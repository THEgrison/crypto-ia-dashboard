#!/usr/bin/env python3
"""
Serveur local du dashboard : fichiers statiques, news RSS et assistant.

Deux problèmes justifient ce serveur, tous deux insolubles depuis une page
statique :

- les flux RSS crypto ne renvoient pas d'en-tête `Access-Control-Allow-Origin`,
  donc le navigateur refuse de les charger ; `/api/news` les récupère côté
  serveur, où la politique CORS ne s'applique pas ;
- une clé d'API de modèle de langage placée dans le JavaScript serait lisible
  par n'importe quel visiteur ; `/api/chat` la garde côté serveur.

Usage : python3 server.py [port]        (port 8080 par défaut)

Clé Groq (facultative, active l'assistant conversationnel) :
    export GROQ_API_KEY=gsk_...
    ou une ligne GROQ_API_KEY=gsk_... dans un fichier .env non versionné.

Sans clé, l'assistant répond quand même à partir des données du dashboard.

Aucune dépendance externe : bibliothèque standard uniquement.
"""

from __future__ import annotations

import html
import json
import os
import re
import sys
import threading
import time
import urllib.error
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

GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
# Llama 3.3 70B a été retiré le 16 août 2026 ; gpt-oss-20b est le remplaçant
# recommandé par Groq pour le plan gratuit.
GROQ_MODEL = os.environ.get("GROQ_MODEL", "openai/gpt-oss-20b")
CHAT_TIMEOUT = 30
MAX_HISTORY = 12

_cache: dict[str, object] = {"items": [], "fetched_at": 0.0}
_lock = threading.Lock()


def api_key() -> str:
    """L'environnement prime ; le fichier .env évite d'exporter la variable à chaque session."""
    key = os.environ.get("GROQ_API_KEY", "").strip()
    if key:
        return key

    env_file = ROOT / ".env"
    if not env_file.exists():
        return ""

    for line in env_file.read_text(encoding="utf-8").splitlines():
        name, _, value = line.partition("=")
        if name.strip() == "GROQ_API_KEY":
            return value.strip().strip("\"'")

    return ""


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


SIGNAL_LABELS = {"buy": "Acheter", "sell": "Vendre", "wait": "Attendre"}

SYSTEM_PROMPT = """Tu es l'assistant d'analyse du dashboard « Crypto IA ».

Règles impératives :
- Tu expliques et mets en perspective, tu ne recommandes jamais d'acheter ou de vendre.
- Tu ne promets aucun gain et ne garantis aucun résultat ; tu rappelles l'incertitude
  quand la question cherche une certitude.
- Tu t'appuies sur les données ci-dessous. Si une information manque, tu le dis au
  lieu de l'inventer, et tu ne cites aucun chiffre absent de ces données.
- Le dashboard n'exécute aucun ordre et n'est connecté à aucun broker : ne propose
  jamais d'en passer un, même si un broker est sélectionné.
- Adapte le vocabulaire au type de marché (spot = acheter/vendre, futures/marge =
  long/short) sans changer les chiffres.
- Tu réponds en français, en quatre phrases maximum, sans liste à puces sauf demande
  explicite d'énumération.

État du dashboard au moment de la question :
"""


def fmt_usd(value) -> str:
    if not value:
        return "non disponible"
    if value >= 1e12:
        return f"{value / 1e12:.2f} mille milliards $"
    if value >= 1e9:
        return f"{value / 1e9:.1f} milliards $"
    if value >= 1e6:
        return f"{value / 1e6:.0f} millions $"
    return f"{value:,.2f} $".replace(",", " ")


def fmt_pct(value) -> str:
    if value is None:
        return "non disponible"
    return f"{value:+.2f} %"


def describe_context(ctx: dict) -> str:
    if not ctx:
        return "Aucune donnée transmise par le dashboard."

    profile = ctx.get("profile") or {}
    lines = [
        f"Crypto affichée : {ctx.get('name')} ({ctx.get('symbol')})",
        f"Prix : {fmt_usd(ctx.get('price'))}",
        f"Variation 24 h : {fmt_pct(ctx.get('change24h'))}",
        f"Capitalisation : {fmt_usd(ctx.get('marketCap'))}",
        f"Signal calculé : {ctx.get('signalLabel') or SIGNAL_LABELS.get(ctx.get('signal'), 'inconnu')}"
        f" (confiance {ctx.get('confidence', '?')} %)",
        f"Commentaire de timing : {ctx.get('timing')}",
        f"Profil de calibrage : {profile.get('label')}"
        f" — seuil {profile.get('threshold')} % sur {profile.get('window')}",
        f"Type de marché choisi : {(ctx.get('market') or {}).get('label', 'Spot')}",
        f"Broker choisi : {(ctx.get('broker') or {}).get('label', 'Non spécifié')}"
        " — le dashboard n'est pas connecté à ce broker, les prix viennent de CoinGecko",
        f"Prix vs moyenne 7 jours : {'au-dessus' if ctx.get('aboveMa') else 'en dessous'}",
        f"Volume 24 h : {fmt_usd(ctx.get('volume24h'))}"
        f" (moyenne {fmt_usd(ctx.get('volumeAverage24h'))})",
    ]

    news = ctx.get("news") or []
    if news:
        lines.append("Dernières actualités et leur tonalité :")
        lines += [f"  - [{n.get('serenity', 'neutre')}] {n.get('title')}" for n in news[:5]]

    return "\n".join(lines)


def ask_groq(messages: list[dict], ctx: dict, key: str) -> str:
    payload = {
        "model": GROQ_MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT + describe_context(ctx)}]
        + messages[-MAX_HISTORY:],
        "temperature": 0.3,
        "max_tokens": 800,
    }

    request = urllib.request.Request(
        GROQ_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            # Cloudflare bloque le User-Agent par défaut de urllib (erreur 1010).
            "User-Agent": USER_AGENT,
        },
        method="POST",
    )

    with urllib.request.urlopen(request, timeout=CHAT_TIMEOUT) as response:
        body = json.loads(response.read())

    message = body["choices"][0]["message"]
    text = (message.get("content") or "").strip()
    if not text:
        raise RuntimeError("Groq a renvoyé une réponse vide")
    return text


def local_reply(question: str, ctx: dict) -> str:
    """
    Repli sans modèle : reformule les données du dashboard. Volontairement
    déterministe, pour ne jamais avancer autre chose que ce qui est affiché.
    """
    if not ctx:
        return "Je n'ai pas reçu les données du dashboard, je ne peux donc rien analyser."

    q = question.lower()
    symbol = ctx.get("symbol") or "cette crypto"
    profile = ctx.get("profile") or {}
    signal = ctx.get("signalLabel") or SIGNAL_LABELS.get(ctx.get("signal"), "Attendre")
    side = "au-dessus" if ctx.get("aboveMa") else "en dessous"

    if any(word in q for word in ("volume", "liquidit", "échange", "echange")):
        current = ctx.get("volume24h") or 0
        average = ctx.get("volumeAverage24h") or 0
        ratio = (current / average * 100) if average else 0
        return (
            f"Le volume 24 h de {symbol} atteint {fmt_usd(current)}, soit {ratio:.0f} % de sa moyenne "
            f"({fmt_usd(average)}). Un mouvement de prix accompagné d'un volume supérieur à la moyenne "
            "est généralement considéré comme mieux confirmé, sans que cela constitue une certitude."
        )

    if any(word in q for word in ("news", "actualit", "annonce", "sérénité", "serenite")):
        news = ctx.get("news") or []
        if not news:
            return "Aucune actualité n'est chargée pour le moment."
        tones = ", ".join(f"{n.get('title')} ({n.get('serenity', 'neutre')})" for n in news[:3])
        return f"Les dernières actualités sur {symbol} sont : {tones}."

    if any(word in q for word in ("tendance", "moyenne", "graphique", "chandelle")):
        return (
            f"{symbol} cote {fmt_usd(ctx.get('price'))}, {fmt_pct(ctx.get('change24h'))} sur 24 h, "
            f"et se situe {side} de sa moyenne 7 jours. Cette position sert justement de garde-fou : "
            "un rebond sous la moyenne ne suffit pas à déclencher un signal d'achat."
        )

    return (
        f"Le signal sur {symbol} est « {signal} » avec le profil {profile.get('label')} "
        f"(seuil {profile.get('threshold')} % sur {profile.get('window')}), et le prix est {side} "
        f"de sa moyenne 7 jours. Cadre {(ctx.get('market') or {}).get('label', 'Spot')}"
        f" · {(ctx.get('broker') or {}).get('label', 'broker non spécifié')}. "
        f"{ctx.get('timing') or ''} "
        "Ce n'est pas un conseil d'investissement, "
        "et les performances passées ne préjugent pas des performances futures."
    )


class DashboardHandler(SimpleHTTPRequestHandler):
    def do_GET(self) -> None:
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/news":
            self.serve_news(urllib.parse.parse_qs(parsed.query))
            return
        if parsed.path == "/api/chat":
            self.send_json(200, {"available": True, "model": "groq" if api_key() else "local"})
            return
        super().do_GET()

    def do_POST(self) -> None:
        if urllib.parse.urlparse(self.path).path != "/api/chat":
            self.send_error(404, "Not Found")
            return

        try:
            length = int(self.headers.get("Content-Length") or 0)
            body = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError) as exc:
            self.send_json(400, {"error": f"Requête illisible : {exc}"})
            return

        messages = [m for m in body.get("messages", []) if m.get("content")]
        context = body.get("context") or {}
        question = messages[-1]["content"] if messages else ""

        key = api_key()
        if not key:
            self.send_json(200, {"reply": local_reply(question, context), "source": "local"})
            return

        try:
            self.send_json(200, {"reply": ask_groq(messages, context, key), "source": "groq"})
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:200]
            print(f"[chat] Groq {exc.code} : {detail}", file=sys.stderr)
            warning = (
                "Groq a bloqué la requête (Cloudflare 1010). Relancez python3 server.py après mise à jour."
                if "1010" in detail
                else f"Groq a renvoyé une erreur {exc.code}, repli sur l'assistant local."
            )
            self.send_json(
                200,
                {
                    "reply": local_reply(question, context),
                    "source": "local",
                    "warning": warning,
                },
            )
        except Exception as exc:
            print(f"[chat] {exc}", file=sys.stderr)
            self.send_json(
                200,
                {
                    "reply": local_reply(question, context),
                    "source": "local",
                    "warning": "Modèle injoignable, repli sur l'assistant local.",
                },
            )

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

    def handle_one_request(self) -> None:
        # Recharger la page coupe les transferts en cours. Sans ce filet, Python
        # déverse une trace d'appels alarmante alors que rien n'est cassé.
        try:
            super().handle_one_request()
        except (BrokenPipeError, ConnectionResetError):
            self.close_connection = True

    def log_message(self, fmt: str, *args) -> None:
        if "/api/" in self.path or self.path in ("/", "/index.html"):
            super().log_message(fmt, *args)


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PORT
    handler = partial(DashboardHandler, directory=str(ROOT))

    with ThreadingHTTPServer(("127.0.0.1", port), handler) as server:
        print(f"Dashboard  → http://localhost:{port}")
        print(f"News       → http://localhost:{port}/api/news?symbol=BTC&name=Bitcoin")
        print(
            "Assistant  → "
            + ("Groq actif" if api_key() else "mode local (aucune clé GROQ_API_KEY détectée)")
        )
        print("Ctrl+C pour arrêter.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nArrêt du serveur.")


if __name__ == "__main__":
    main()
