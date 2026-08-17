/**
 * CoinGecko API — prix, volumes, historique et liste des cryptos.
 * Docs: https://docs.coingecko.com/
 */
const CoinGecko = (() => {
  const SYMBOL_TO_ID = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    SOL: 'solana',
    ADA: 'cardano',
    XRP: 'ripple',
    AVAX: 'avalanche-2',
    DOT: 'polkadot',
    LINK: 'chainlink',
    BNB: 'binancecoin',
    DOGE: 'dogecoin',
    PEPE: 'pepe',
    WIF: 'dogwifcoin',
    BONK: 'bonk',
    FET: 'fetch-ai',
    INJ: 'injective-protocol',
  };

  const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

  let coinsListCache = null;
  let symbolIndex = null;

  function config() {
    return window.COINGECKO_CONFIG || { apiKey: '', baseUrl: 'https://api.coingecko.com/api/v3' };
  }

  function buildUrl(path, params = {}) {
    const cfg = config();
    const url = new URL(`${cfg.baseUrl}${path}`);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
    if (cfg.apiKey) url.searchParams.set('x_cg_demo_api_key', cfg.apiKey);
    return url.toString();
  }

  async function fetchJson(path, params) {
    const res = await fetch(buildUrl(path, params));
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`CoinGecko ${res.status}: ${body.slice(0, 160)}`);
    }
    return res.json();
  }

  function getId(symbol) {
    const sym = symbol.toUpperCase();
    if (CRYPTO_DATA[sym]?.coingeckoId) return CRYPTO_DATA[sym].coingeckoId;
    return SYMBOL_TO_ID[sym] || null;
  }

  function resolveId(symbolOrId) {
    const value = String(symbolOrId).trim();
    const upper = value.toUpperCase();
    return getId(upper) || (value.includes('-') ? value.toLowerCase() : null);
  }

  /** GET /coins/list — cache local pour la recherche. */
  async function loadCoinsList() {
    if (coinsListCache) return coinsListCache;

    const list = await fetchJson('/coins/list');
    coinsListCache = list;

    const preferredIds = new Set(Object.values(SYMBOL_TO_ID));
    Object.values(CRYPTO_DATA).forEach((c) => {
      if (c.coingeckoId) preferredIds.add(c.coingeckoId);
    });

    symbolIndex = new Map();
    list.forEach((coin) => {
      const sym = coin.symbol.toUpperCase();
      const existing = symbolIndex.get(sym);
      if (!existing || preferredIds.has(coin.id)) {
        symbolIndex.set(sym, coin);
      }
    });

    return list;
  }

  function searchCoins(query, limit = 12) {
    if (!query) {
      return Object.keys(CRYPTO_DATA)
        .slice(0, limit)
        .map((sym) => ({
          symbol: sym,
          name: CRYPTO_DATA[sym].name,
          id: getId(sym),
        }));
    }

    const q = query.trim().toLowerCase();
    const qUpper = query.trim().toUpperCase();
    const results = [];
    const seen = new Set();

    if (CRYPTO_DATA[qUpper]) {
      results.push({
        symbol: qUpper,
        name: CRYPTO_DATA[qUpper].name,
        id: getId(qUpper),
      });
      seen.add(qUpper);
    }

    if (symbolIndex) {
      for (const [sym, coin] of symbolIndex.entries()) {
        if (results.length >= limit) break;
        if (seen.has(sym)) continue;
        if (sym.startsWith(qUpper) || coin.name.toLowerCase().includes(q) || coin.id.includes(q)) {
          results.push({ symbol: sym, name: coin.name, id: coin.id });
          seen.add(sym);
        }
      }
    }

    if (coinsListCache && results.length < limit) {
      for (const coin of coinsListCache) {
        if (results.length >= limit) break;
        const sym = coin.symbol.toUpperCase();
        if (seen.has(sym)) continue;
        if (sym.includes(qUpper) || coin.name.toLowerCase().includes(q) || coin.id.includes(q)) {
          results.push({ symbol: sym, name: coin.name, id: coin.id });
          seen.add(sym);
        }
      }
    }

    return results;
  }

  /** GET /coins/markets — prix, volume 24h, market cap, variation. */
  async function fetchMarkets(ids) {
    const idList = [...new Set(ids.filter(Boolean))];
    if (!idList.length) return [];

    return fetchJson('/coins/markets', {
      vs_currency: 'usd',
      ids: idList.join(','),
      order: 'market_cap_desc',
      per_page: idList.length,
      page: 1,
      sparkline: 'false',
      price_change_percentage: '24h,7d',
    });
  }

  async function fetchMarketForSymbol(symbol) {
    const id = resolveId(symbol);
    if (!id) return null;
    const rows = await fetchMarkets([id]);
    return rows[0] || null;
  }

  /** GET /coins/{id}/market_chart — historique prix + volumes. */
  async function fetchMarketChart(id, days = 30) {
    return fetchJson(`/coins/${id}/market_chart`, {
      vs_currency: 'usd',
      days,
    });
  }

  function pricesToDailyCandles(prices) {
    const dayMap = new Map();

    prices.forEach(([ts, price]) => {
      const day = new Date(ts).toISOString().slice(0, 10);
      if (!dayMap.has(day)) {
        dayMap.set(day, { open: price, high: price, low: price, close: price });
      } else {
        const candle = dayMap.get(day);
        candle.high = Math.max(candle.high, price);
        candle.low = Math.min(candle.low, price);
        candle.close = price;
      }
    });

    return [...dayMap.values()];
  }

  /**
   * `total_volumes` renvoie des instantanés du volume glissant 24h (horaires sur 14j).
   * On moyenne les points d'une même journée : les additionner gonflerait le volume.
   */
  function volumesToDailyHistory(totalVolumes, days = 14) {
    const buckets = new Map();

    (totalVolumes || []).forEach(([ts, vol]) => {
      const day = new Date(ts).toISOString().slice(0, 10);
      const bucket = buckets.get(day) || { sum: 0, count: 0 };
      bucket.sum += vol;
      bucket.count += 1;
      buckets.set(day, bucket);
    });

    return [...buckets.entries()]
      .slice(-days)
      .map(([day, { sum, count }]) => ({
        label: DAY_LABELS[new Date(`${day}T12:00:00`).getDay()],
        value: sum / count / 1e9,
      }));
  }

  function computeLiveRecommendation(candles, change24h) {
    if (!candles?.length) {
      return {
        signal: 'wait',
        confidence: 50,
        timing: 'Données insuffisantes pour un signal fiable — prudence recommandée',
      };
    }

    const maFast = computeMA(candles, 7);
    const lastClose = candles[candles.length - 1].close;
    const lastMaFast = maFast.filter((v) => v !== null).at(-1);
    const aboveMa = lastMaFast ? lastClose > lastMaFast : change24h > 0;

    let signal = 'wait';
    if (change24h > 2 && aboveMa) signal = 'buy';
    else if (change24h < -2 && !aboveMa) signal = 'sell';

    const confidence = Math.min(92, Math.max(45, Math.round(50 + Math.abs(change24h) * 4 + (aboveMa ? 5 : 0))));

    const timingBySignal = {
      buy: aboveMa
        ? 'Momentum haussier — entrée possible sur repli court'
        : 'Rebond en formation — attendre confirmation au-dessus de la MA7',
      sell: !aboveMa
        ? 'Pression vendeuse — envisager une sortie ou réduction d\'exposition'
        : 'Correction probable malgré le support — prudence sur les niveaux actuels',
      wait: Math.abs(change24h) < 1
        ? 'Range latéral — pas de signal directionnel clair'
        : 'Signal mixte — attendre une cassure plus nette',
    };

    return { signal, confidence, timing: timingBySignal[signal] };
  }

  /** Agrège toutes les données live pour une crypto. */
  async function refreshCrypto(symbol, coinId) {
    const id = coinId || resolveId(symbol);
    if (!id) throw new Error(`Crypto non mappée: ${symbol}`);

    const [market, chart] = await Promise.all([
      fetchMarkets([id]).then((rows) => rows[0]),
      fetchMarketChart(id, 30),
    ]);

    if (!market) throw new Error(`Marché introuvable pour ${symbol}`);

    const candles = pricesToDailyCandles(chart.prices || []);
    const volumeHistory = volumesToDailyHistory(chart.total_volumes, 14);
    const avgBillions =
      volumeHistory.length > 0
        ? volumeHistory.reduce((sum, item) => sum + item.value, 0) / volumeHistory.length
        : (market.total_volume || 0) / 1e9;

    const change24h = market.price_change_percentage_24h ?? 0;
    const recommendation = computeLiveRecommendation(candles, change24h);

    return {
      price: market.current_price,
      change24h,
      volume24h: market.total_volume,
      marketCap: market.market_cap,
      volumeAverage24h: avgBillions * 1e9,
      volumeHistory,
      candles: candles.slice(-42),
      recommendation,
    };
  }

  function applyLiveData(data, live) {
    data.price = live.price;
    data.change24h = live.change24h;
    data.marketCap = live.marketCap;
    data.live = true;

    if (live.recommendation) data.recommendation = live.recommendation;

    if (live.volume24h) {
      data.volume.current24h = live.volume24h;
      if (live.volumeAverage24h) data.volume.average24h = live.volumeAverage24h;
    }

    if (live.volumeHistory?.length) data.volume.history = live.volumeHistory;

    if (live.candles?.length) {
      data.candles = live.candles;
      data.candles[data.candles.length - 1].close = live.price;
    } else if (data.candles?.length) {
      data.candles[data.candles.length - 1].close = live.price;
    }
  }

  function formatMarketCap(value) {
    if (!value) return '—';
    if (value >= 1e12) return `$${(value / 1e12).toFixed(2)}T`;
    if (value >= 1e9) return `$${(value / 1e9).toFixed(0)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toLocaleString('fr-FR')}`;
  }

  function formatPct(value) {
    if (value == null) return '—';
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  }

  function trendFromChange(change) {
    if (change > 1.5) return { label: 'Haussière', dir: 'up' };
    if (change < -1.5) return { label: 'Baissière', dir: 'down' };
    return { label: 'Latérale', dir: 'flat' };
  }

  function momentumFromChanges(change24h, change7d) {
    const abs = Math.abs(change24h ?? 0) + Math.abs(change7d ?? 0) * 0.3;
    if (abs > 15) return change24h >= 0 ? 'Extrême haussier' : 'Extrême baissier';
    if (abs > 8) return change24h >= 0 ? 'Fort haussier' : 'Fort baissier';
    if (abs > 4) return change24h >= 0 ? 'Haussier' : 'Baissier';
    if (change24h < -2) return 'Correction';
    return 'Modéré';
  }

  return {
    getId,
    resolveId,
    loadCoinsList,
    searchCoins,
    fetchMarkets,
    fetchMarketForSymbol,
    refreshCrypto,
    applyLiveData,
    formatMarketCap,
    formatPct,
    trendFromChange,
    momentumFromChanges,
    isSupported: (symbol, coinId) => Boolean(coinId || resolveId(symbol)),
  };
})();
