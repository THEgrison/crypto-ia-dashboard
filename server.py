#!/usr/bin/env python3
"""
Serveur local du dashboard : fichiers statiques + agrégation des news RSS.

Les flux RSS crypto et les API de news ne renvoient pas d'en-tête
`Access-Control-Allow-Origin`. Le navigateur refuse donc de les charger depuis
une page statique. Ce script sert le dashboard et expose `/api/news`, qui
récupère les flux côté serveur — où la politique CORS ne s'applique pas — et
les renvoie en JSON.

Usage : python3 server.py [port]        (port 8080 par défaut)

Aucune dépendance externe : bibliothèque standard uniquement.
"""

from __future__ import annotations

import html
import json
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).parent.resolve()
DEFAULT_PORT = 8080

# Flux vérifiés comme accessibles sans clé ni authentification.
FEEDS = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Decrypt", "https://decrypt.co/feed"),
    ("Bitcoin.com", "https://news.bitcoin.com/feed/"),
]

# Certains éditeurs renvoient 403 sans User-Agent de navigateur.
USER_AGENT = "Mozilla/5.0 (compatible; CryptoIADashboard/1.0)"
FEED_TIMEOUT = 12
CACHE_TTL = 300

# Le niveau de sérénité est déduit du vocabulaire du titre et du résumé.
SERENITY_KEYWORDS = {
    "alarmant": [
        "hack", "hacked", "exploit", "stolen", "theft", "scam", "fraud", "rug pull",
        "crash", "collapse", "plunge", "bankruptcy", "insolvent", "liquidation",
        "arrest", "indicted", "seized", "breach", "attack", "ban", "banned",
        "piratage", "vol", "arnaque", "effondrement", "faillite", "saisie",
    ],
    "tendu": [
        "sec", "lawsuit", "sue", "sued", "regulator", "regulation", "investigation",
        "probe", "subpoena", "fine", "penalty", "warning", "risk", "concern",
        "uncertainty", "volatility", "correction", "selloff", "sell-off", "slump",
        "drop", "fall", "decline", "delay", "halt", "outage", "pressure",
        "enquête", "amende", "risque", "incertitude", "baisse", "chute", "retard",
    ],
    "calme": [
        "surge", "rally", "soar", "record", "all-time high", "approval", "approves",
        "approved", "adoption", "partnership", "launch", "launches", "upgrade",
        "gain", "gains", "jump", "boost", "bullish", "inflow", "inflows", "milestone",
        "growth", "expands", "integration",
        "hausse", "record", "adoption", "partenariat", "lancement", "croissance",
    ],
}

_cache: dict[str, object] = {"items": [], "fetched_at": 0.0}
_lock = threading.Lock()


def strip_html(raw: str) -> str:
    """Les descriptions RSS contiennent du HTML : on en extrait le texte brut."""
    text = re.sub(r"<[^>]+>", " ", raw or "")
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def node_text(item: ET.Element, tag: str) -> str:
    node = item.find(tag)
    return (node.text or "").strip() if node is not None and node.text else ""


def parse_date(raw: str) -> str:
    try:
        return parsedate_to_datetime(raw).isoformat()
    except (TypeError, ValueError):
        return ""


def score_serenity(text: str) -> str:
    """
    Retient la catégorie dont le vocabulaire est le plus présent. Les limites de
    mots évitent qu'un terme court comme « sec » ne matche « second » ou « sector ».
    """
    lowered = text.lower()
    scores = {
        level: sum(1 for word in words if re.search(rf"\b{re.escape(word)}\b", lowered))
        for level, words in SERENITY_KEYWORDS.items()
    }
    best = max(scores, key=lambda level: scores[level])
    return best if scores[best] > 0 else "neutre"


def fetch_feed(source: str, url: str) -> list[dict]:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=FEED_TIMEOUT) as response:
        payload = response.read()

    root = ET.fromstring(payload)
    articles = []

    for item in root.iter("item"):
        title = strip_html(node_text(item, "title"))
        if not title:
            continue

        excerpt = strip_html(node_text(item, "description"))
        articles.append(
            {
                "title": title,
                "excerpt": excerpt[:220].rstrip() or "Ouvrir l'article pour le détail.",
                "timestamp": parse_date(node_text(item, "pubDate")),
                "url": node_text(item, "link"),
                "source": source,
                "serenity": score_serenity(f"{title} {excerpt}"),
            }
        )

    return articles


def all_articles() -> list[dict]:
    """Agrège les flux, avec un cache mémoire pour ne pas les solliciter à chaque requête."""
    with _lock:
        fresh = time.time() - float(_cache["fetched_at"]) < CACHE_TTL
        if fresh and _cache["items"]:
            return list(_cache["items"])

    collected: list[dict] = []
    with ThreadPoolExecutor(max_workers=len(FEEDS)) as pool:
        futures = {pool.submit(fetch_feed, name, url): name for name, url in FEEDS}
        for future, name in futures.items():
            try:
                collected.extend(future.result())
            except Exception as exc:  # un flux indisponible ne doit pas tout bloquer
                print(f"[news] flux ignoré ({name}) : {exc}", file=sys.stderr)

    collected.sort(key=lambda a: a["timestamp"], reverse=True)

    with _lock:
        _cache["items"] = collected
        _cache["fetched_at"] = time.time()

    return collected


def build_patterns(symbol: str, name: str, coin_id: str) -> list[re.Pattern]:
    """Le symbole exige une limite de mot ; le nom peut apparaître décliné."""
    patterns = []

    if symbol:
        patterns.append(re.compile(rf"\b{re.escape(symbol)}\b", re.IGNORECASE))
    for term in (name, coin_id.replace("-", " ") if coin_id else ""):
        cleaned = term.strip()
        if len(cleaned) >= 3:
            patterns.append(re.compile(re.escape(cleaned), re.IGNORECASE))

    return patterns


def news_for(symbol: str, name: str, coin_id: str, limit: int = 6) -> list[dict]:
    articles = all_articles()
    patterns = build_patterns(symbol, name, coin_id)

    matched, others = [], []
    for article in articles:
        haystack = f"{article['title']} {article['excerpt']}"
        if any(pattern.search(haystack) for pattern in patterns):
            matched.append({**article, "scope": "coin"})
        else:
            others.append({**article, "scope": "market"})

    # Un panneau vide serait pire qu'un complément d'actualité générale, clairement étiqueté.
    return (matched + others)[:limit]


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/news":
            self.serve_news(urllib.parse.parse_qs(parsed.query))
            return
        super().do_GET()

    def serve_news(self, query: dict[str, list[str]]) -> None:
        def param(key: str) -> str:
            return (query.get(key) or [""])[0].strip()

        try:
            items = news_for(param("symbol"), param("name"), param("id"))
            self.send_json(200, {"symbol": param("symbol").upper(), "items": items})
        except Exception as exc:
            self.send_json(502, {"error": str(exc), "items": []})

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self) -> None:
        # Sans cela, le navigateur ressert un JS obsolète après chaque modification.
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt: str, *args) -> None:
        if "/api/" in self.path or self.path in ("/", "/index.html"):
            super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = partial(DashboardHandler, directory=str(ROOT))

    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Dashboard  → http://localhost:{port}")
        print(f"News       → http://localhost:{port}/api/news?symbol=BTC&name=Bitcoin")
        print("Ctrl+C pour arrêter.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêt du serveur.")


if __name__ == "__main__":
    main()
