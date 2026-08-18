/**
 * News — consomme /api/news exposé par server.py.
 *
 * Les flux RSS ne renvoient pas d'en-tête CORS : ils ne peuvent pas être lus
 * directement par le navigateur. Si le dashboard est servi autrement que par
 * server.py, l'endpoint est absent et l'appelant retombe sur les news de
 * démonstration de data.js.
 */
const NewsFeed = (() => {
  const cache = new Map();
  const CACHE_TTL = 120_000;

  async function load(symbol, name, coinId) {
    const key = symbol.toUpperCase();
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) return cached.items;

    const url = new URL('/api/news', window.location.origin);
    url.searchParams.set('symbol', key);
    if (name) url.searchParams.set('name', name);
    if (coinId) url.searchParams.set('id', coinId);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Proxy news ${res.status}`);

    const { items } = await res.json();
    if (!items?.length) throw new Error('Aucune actualité renvoyée');

    cache.set(key, { at: Date.now(), items });
    return items;
  }

  return { load };
})();
