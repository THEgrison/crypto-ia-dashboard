/**
 * Mock data — replace with API calls (CoinGecko, Binance, etc.)
 * Structure designed for easy swap to real endpoints.
 */
/** Crée une entrée minimale pour une crypto absente du catalogue local. */
function createCryptoShell(symbol, name, coingeckoId) {
  return {
    name,
    symbol: symbol.toUpperCase(),
    coingeckoId,
    price: 0,
    change24h: 0,
    recommendation: {
      signal: 'wait',
      confidence: 50,
      timing: 'Chargement des données…',
    },
    volume: {
      current24h: 0,
      average24h: 0,
      history: [],
    },
    news: [
      {
        title: `Actualités ${name} — source externe requise`,
        excerpt: 'CoinGecko ne fournit pas de flux news. Branchez CryptoPanic ou un agrégateur RSS pour alimenter cette section.',
        timestamp: new Date().toISOString(),
        serenity: 'neutre',
      },
    ],
    candles: [],
  };
}

const CRYPTO_DATA = {
  BTC: {
    coingeckoId: 'bitcoin',
    name: 'Bitcoin',
    symbol: 'BTC',
    price: 67432.5,
    change24h: 2.34,
    recommendation: {
      signal: 'buy',
      confidence: 78,
      timing: 'Bon moment pour entrer sur un repli court — momentum haussier confirmé',
    },
    volume: {
      current24h: 28_500_000_000,
      average24h: 24_200_000_000,
      history: [
        { label: 'Lun', value: 22.1 },
        { label: 'Mar', value: 24.8 },
        { label: 'Mer', value: 21.5 },
        { label: 'Jeu', value: 26.3 },
        { label: 'Ven', value: 25.1 },
        { label: 'Sam', value: 23.7 },
        { label: 'Dim', value: 27.2 },
        { label: 'Lun', value: 24.9 },
        { label: 'Mar', value: 28.5 },
        { label: 'Mer', value: 26.8 },
        { label: 'Jeu', value: 29.1 },
        { label: 'Ven', value: 27.4 },
        { label: 'Sam', value: 25.6 },
        { label: 'Dim', value: 28.5 },
      ],
    },
    news: [
      {
        title: 'ETF spot Bitcoin : flux entrants stables cette semaine',
        excerpt: 'Les flux institutionnels restent positifs sans accélération notable.',
        timestamp: '2026-08-17T14:32:00',
        serenity: 'calme',
      },
      {
        title: 'Halving effects: réduction progressive de l\'offre minée',
        excerpt: 'Analyse on-chain montre une pression vendeuse en baisse.',
        timestamp: '2026-08-17T09:15:00',
        serenity: 'neutre',
      },
      {
        title: 'Régulation US : audition au Sénat sur les stablecoins',
        excerpt: 'Incertitude législative pourrait impacter le sentiment marché.',
        timestamp: '2026-08-16T18:45:00',
        serenity: 'tendu',
      },
      {
        title: 'Alerte exchange : retrait massif détecté sur un wallet inconnu',
        excerpt: 'Mouvement atypique de 12 000 BTC — origine non confirmée.',
        timestamp: '2026-08-16T11:20:00',
        serenity: 'alarmant',
      },
    ],
    candles: generateCandles(67432.5, 42, 0.018),
  },

  ETH: {
    coingeckoId: 'ethereum',
    name: 'Ethereum',
    symbol: 'ETH',
    price: 3421.8,
    change24h: -1.12,
    recommendation: {
      signal: 'wait',
      confidence: 62,
      timing: 'Attendre une correction vers le support — signal mixte',
    },
    volume: {
      current24h: 14_200_000_000,
      average24h: 13_800_000_000,
      history: [
        { label: 'Lun', value: 12.4 },
        { label: 'Mar', value: 13.1 },
        { label: 'Mer', value: 14.5 },
        { label: 'Jeu', value: 13.8 },
        { label: 'Ven', value: 15.2 },
        { label: 'Sam', value: 12.9 },
        { label: 'Dim', value: 14.0 },
        { label: 'Lun', value: 13.5 },
        { label: 'Mar', value: 14.8 },
        { label: 'Mer', value: 13.2 },
        { label: 'Jeu', value: 15.6 },
        { label: 'Ven', value: 14.1 },
        { label: 'Sam', value: 13.7 },
        { label: 'Dim', value: 14.2 },
      ],
    },
    news: [
      {
        title: 'Mise à jour Pectra : déploiement testnet réussi',
        excerpt: 'Améliorations de scalabilité validées par les validateurs.',
        timestamp: '2026-08-17T16:00:00',
        serenity: 'calme',
      },
      {
        title: 'Staking ETH : rendements stables autour de 3.2%',
        excerpt: 'Participation au staking en légère hausse ce trimestre.',
        timestamp: '2026-08-17T10:30:00',
        serenity: 'neutre',
      },
      {
        title: 'Concurrence L2 : frais en baisse sur Arbitrum et Base',
        excerpt: 'Pression sur les revenus du protocole principal à surveiller.',
        timestamp: '2026-08-16T20:10:00',
        serenity: 'tendu',
      },
    ],
    candles: generateCandles(3421.8, 42, 0.022),
  },

  SOL: {
    coingeckoId: 'solana',
    name: 'Solana',
    symbol: 'SOL',
    price: 178.45,
    change24h: 5.67,
    recommendation: {
      signal: 'sell',
      confidence: 71,
      timing: 'Surachat probable — envisager une prise de profits partielle',
    },
    volume: {
      current24h: 3_800_000_000,
      average24h: 2_900_000_000,
      history: [
        { label: 'Lun', value: 2.1 },
        { label: 'Mar', value: 2.4 },
        { label: 'Mer', value: 2.8 },
        { label: 'Jeu', value: 3.2 },
        { label: 'Ven', value: 2.9 },
        { label: 'Sam', value: 3.5 },
        { label: 'Dim', value: 3.1 },
        { label: 'Lun', value: 2.7 },
        { label: 'Mar', value: 3.4 },
        { label: 'Mer', value: 3.8 },
        { label: 'Jeu', value: 3.6 },
        { label: 'Ven', value: 4.1 },
        { label: 'Sam', value: 3.3 },
        { label: 'Dim', value: 3.8 },
      ],
    },
    news: [
      {
        title: 'Solana DeFi : TVL en hausse de 18% sur 30 jours',
        excerpt: 'Adoption des protocoles natifs continue de progresser.',
        timestamp: '2026-08-17T13:45:00',
        serenity: 'calme',
      },
      {
        title: 'Nouveau record de transactions par seconde',
        excerpt: 'Réseau stable malgré la charge élevée observée hier.',
        timestamp: '2026-08-17T08:00:00',
        serenity: 'neutre',
      },
      {
        title: 'Volatilité extrême : +12% en 4 heures',
        excerpt: 'Mouvement spéculatif — prudence recommandée.',
        timestamp: '2026-08-16T22:30:00',
        serenity: 'alarmant',
      },
    ],
    candles: generateCandles(178.45, 42, 0.035),
  },

  ADA: {
    coingeckoId: 'cardano',
    name: 'Cardano',
    symbol: 'ADA',
    price: 0.4521,
    change24h: 0.89,
    recommendation: {
      signal: 'wait',
      confidence: 55,
      timing: 'Range latéral — pas de signal directionnel clair',
    },
    volume: {
      current24h: 420_000_000,
      average24h: 380_000_000,
      history: generateVolumeHistory(0.42, 0.38, 14),
    },
    news: [
      {
        title: 'Governance Cardano : nouveau proposal CIP soumis',
        excerpt: 'Vote communautaire ouvert jusqu\'au 25 août.',
        timestamp: '2026-08-17T12:00:00',
        serenity: 'neutre',
      },
    ],
    candles: generateCandles(0.4521, 42, 0.025),
  },

  XRP: {
    coingeckoId: 'ripple',
    name: 'Ripple',
    symbol: 'XRP',
    price: 0.6234,
    change24h: -0.45,
    recommendation: {
      signal: 'buy',
      confidence: 65,
      timing: 'Support testé avec rebond — entrée prudente possible',
    },
    volume: {
      current24h: 1_200_000_000,
      average24h: 1_050_000_000,
      history: generateVolumeHistory(1.2, 1.05, 14),
    },
    news: [
      {
        title: 'Ripple vs SEC : décision d\'appel attendue Q4',
        excerpt: 'Marché intégré dans le prix actuel selon les analystes.',
        timestamp: '2026-08-17T15:20:00',
        serenity: 'tendu',
      },
    ],
    candles: generateCandles(0.6234, 42, 0.028),
  },

  AVAX: {
    coingeckoId: 'avalanche-2',
    name: 'Avalanche',
    symbol: 'AVAX',
    price: 28.76,
    change24h: 3.21,
    recommendation: {
      signal: 'buy',
      confidence: 69,
      timing: 'Momentum positif — surveiller la résistance à 30$',
    },
    volume: {
      current24h: 580_000_000,
      average24h: 490_000_000,
      history: generateVolumeHistory(0.58, 0.49, 14),
    },
    news: [
      {
        title: 'Subnet gaming : partenariat annoncé avec un studio AAA',
        excerpt: 'Token utility renforcée sur l\'écosystème Avalanche.',
        timestamp: '2026-08-17T11:00:00',
        serenity: 'calme',
      },
    ],
    candles: generateCandles(28.76, 42, 0.03),
  },

  DOT: {
    coingeckoId: 'polkadot',
    name: 'Polkadot',
    symbol: 'DOT',
    price: 6.84,
    change24h: -2.1,
    recommendation: {
      signal: 'wait',
      confidence: 58,
      timing: 'Attendre une baisse vers 6.50$ avant toute décision',
    },
    volume: {
      current24h: 210_000_000,
      average24h: 195_000_000,
      history: generateVolumeHistory(0.21, 0.195, 14),
    },
    news: [
      {
        title: 'Parachain auctions : activité en recul ce mois',
        excerpt: 'Demande modérée pour les slots disponibles.',
        timestamp: '2026-08-16T14:00:00',
        serenity: 'neutre',
      },
    ],
    candles: generateCandles(6.84, 42, 0.026),
  },

  LINK: {
    coingeckoId: 'chainlink',
    name: 'Chainlink',
    symbol: 'LINK',
    price: 14.32,
    change24h: 1.78,
    recommendation: {
      signal: 'buy',
      confidence: 72,
      timing: 'Tendance haussière modérée — bon ratio risque/rendement',
    },
    volume: {
      current24h: 340_000_000,
      average24h: 310_000_000,
      history: generateVolumeHistory(0.34, 0.31, 14),
    },
    news: [
      {
        title: 'CCIP : nouvelles intégrations cross-chain déployées',
        excerpt: 'Adoption institutionnelle des oracles en progression.',
        timestamp: '2026-08-17T09:45:00',
        serenity: 'calme',
      },
    ],
    candles: generateCandles(14.32, 42, 0.024),
  },
};

const LONG_TERM_SAFE = [
  {
    symbol: 'BTC',
    name: 'Bitcoin',
    marketCap: '1.33T',
    volatility: 'Modérée (42%)',
    trend: 'Haussière',
    trendDir: 'up',
  },
  {
    symbol: 'ETH',
    name: 'Ethereum',
    marketCap: '411B',
    volatility: 'Modérée (48%)',
    trend: 'Latérale',
    trendDir: 'flat',
  },
  {
    symbol: 'BNB',
    name: 'BNB',
    marketCap: '98B',
    volatility: 'Faible (35%)',
    trend: 'Haussière',
    trendDir: 'up',
  },
  {
    symbol: 'SOL',
    name: 'Solana',
    marketCap: '82B',
    volatility: 'Élevée (62%)',
    trend: 'Haussière',
    trendDir: 'up',
  },
  {
    symbol: 'XRP',
    name: 'Ripple',
    marketCap: '35B',
    volatility: 'Modérée (44%)',
    trend: 'Latérale',
    trendDir: 'flat',
  },
  {
    symbol: 'ADA',
    name: 'Cardano',
    marketCap: '16B',
    volatility: 'Faible (38%)',
    trend: 'Baissière légère',
    trendDir: 'down',
  },
];

const SHORT_TERM = [
  {
    symbol: 'DOGE',
    name: 'Dogecoin',
    volatility24h: '+8.4%',
    volatility7d: '+22.1%',
    momentum: 'Fort haussier',
    momentumDir: 'up',
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    volatility24h: '+15.2%',
    volatility7d: '+38.7%',
    momentum: 'Extrême',
    momentumDir: 'up',
  },
  {
    symbol: 'WIF',
    name: 'dogwifhat',
    volatility24h: '-6.8%',
    volatility7d: '+18.3%',
    momentum: 'Correction',
    momentumDir: 'down',
  },
  {
    symbol: 'BONK',
    name: 'Bonk',
    volatility24h: '+11.5%',
    volatility7d: '+29.4%',
    momentum: 'Haussier',
    momentumDir: 'up',
  },
  {
    symbol: 'FET',
    name: 'Fetch.ai',
    volatility24h: '+5.2%',
    volatility7d: '+14.8%',
    momentum: 'Modéré',
    momentumDir: 'up',
  },
  {
    symbol: 'INJ',
    name: 'Injective',
    volatility24h: '-4.1%',
    volatility7d: '+12.6%',
    momentum: 'Rebond possible',
    momentumDir: 'flat',
  },
];

const SERENITY_LABELS = {
  calme: 'Calme',
  neutre: 'Neutre',
  tendu: 'Tendu',
  alarmant: 'Alarmant',
};

const SIGNAL_LABELS = {
  buy: 'Acheter',
  sell: 'Vendre',
  wait: 'Attendre',
};

/**
 * Cadre d'analyse choisi par l'utilisateur. Les prix restent ceux de CoinGecko :
 * ce n'est pas le carnet du broker, et aucun ordre n'est envoyé.
 */
const MARKET_TYPES = {
  spot: {
    label: 'Spot',
    hint: 'Achat et vente au comptant, sans levier',
    signals: { buy: 'Acheter', sell: 'Vendre', wait: 'Attendre' },
    toast: { buy: ' à acheter', sell: ' à vendre' },
    caveat: '',
  },
  futures: {
    label: 'Futures',
    hint: 'Contrats perpétuels ou datés — levier et financement à la charge du broker. Long = hausse, Short = baisse.',
    signals: { buy: 'Long · hausse', sell: 'Short · baisse', wait: 'Attendre' },
    toast: { buy: ' — long (hausse)', sell: ' — short (baisse)' },
    caveat:
      'Cadre futures : le signal décrit une direction, pas un levier. Liquidation et funding dépendent du broker.',
  },
  margin: {
    label: 'Marge',
    hint: 'Position financée par emprunt — le broker peut liquider',
    signals: { buy: 'Long · hausse', sell: 'Short · baisse', wait: 'Attendre' },
    toast: { buy: ' — long (hausse)', sell: ' — short (baisse)' },
    caveat: 'Cadre marge : une baisse plus forte que le collatéral peut déclencher une liquidation.',
  },
  options: {
    label: 'Options',
    hint: 'Primes et décroissance temporelle — un biais directionnel ne suffit pas',
    signals: { buy: 'Biais haussier', sell: 'Biais baissier', wait: 'Attendre' },
    toast: { buy: ' — biais haussier', sell: ' — biais baissier' },
    caveat: 'Cadre options : la valeur temps s\'érode même si le sous-jacent va dans le bon sens.',
  },
  other: {
    label: 'CFD / autre',
    hint: 'Produit synthétique du broker — écarts et frais propres à la plateforme',
    signals: { buy: 'Hausse', sell: 'Baisse', wait: 'Attendre' },
    toast: { buy: ' — hausse', sell: ' — baisse' },
    caveat: 'Produit du broker : le prix affiché ici est un indice CoinGecko, pas le votre.',
  },
};

const BROKERS = [
  { id: 'unspecified', label: 'Non spécifié' },
  { id: 'binance', label: 'Binance' },
  { id: 'bybit', label: 'Bybit' },
  { id: 'okx', label: 'OKX' },
  { id: 'bitget', label: 'Bitget' },
  { id: 'kraken', label: 'Kraken' },
  { id: 'coinbase', label: 'Coinbase' },
  { id: 'cryptocom', label: 'Crypto.com' },
  { id: 'bitstamp', label: 'Bitstamp' },
  { id: 'ibkr', label: 'Interactive Brokers' },
];

const DEFAULT_MARKET = 'spot';
const DEFAULT_BROKER = 'unspecified';

function marketOf(key) {
  return MARKET_TYPES[key] || MARKET_TYPES[DEFAULT_MARKET];
}

function brokerOf(id) {
  return BROKERS.find((b) => b.id === id) || BROKERS[0];
}

function signalLabel(signal, marketKey) {
  return marketOf(marketKey).signals[signal] || SIGNAL_LABELS[signal] || signal;
}

/** Generate pseudo-random OHLC candles ending at `endPrice`. */
function generateCandles(endPrice, count, volatility) {
  const candles = [];
  let price = endPrice * (1 - volatility * count * 0.15);

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.48) * volatility * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);
    candles.push({ open, high, low, close });
    price = close;
  }

  candles[candles.length - 1].close = endPrice;
  return candles;
}

function generateVolumeHistory(current, average, days) {
  const labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  const history = [];
  for (let i = 0; i < days; i++) {
    const variance = average * (0.8 + Math.random() * 0.4);
    history.push({ label: labels[i % 7], value: parseFloat(variance.toFixed(1)) });
  }
  history[history.length - 1].value = current;
  return history;
}

/** Compute simple moving averages from close prices. */
function computeMA(candles, period) {
  const ma = [];
  for (let i = 0; i < candles.length; i++) {
    if (i < period - 1) {
      ma.push(null);
    } else {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += candles[j].close;
      ma.push(sum / period);
    }
  }
  return ma;
}
