/**
 * Copiez ce fichier en js/config.js et collez votre clé CoinGecko Demo.
 *
 * Endpoints utilisés :
 * - /simple/price          → prix + variation 24h (via /coins/markets)
 * - /coins/markets         → volume 24h, market cap, variations
 * - /coins/{id}/market_chart → historique prix + volumes (graphiques)
 * - /coins/list            → recherche autocomplete
 */
window.COINGECKO_CONFIG = {
  apiKey: 'CG-VOTRE-CLE-ICI',
  baseUrl: 'https://api.coingecko.com/api/v3',
  refreshIntervalMs: 60_000,
};
