/**
 * Dashboard application logic.
 */
(() => {
  let currentSymbol = 'BTC';
  let currentCoinId = 'bitcoin';
  let highlightIndex = -1;
  let refreshTimer = null;
  let fetchGeneration = 0;
  let searchMatches = [];
  let longTermMarkets = [];
  let shortTermMarkets = [];

  const LONG_TERM_IDS = ['bitcoin', 'ethereum', 'binancecoin', 'solana', 'ripple', 'cardano'];
  const SHORT_TERM_IDS = ['dogecoin', 'pepe', 'dogwifcoin', 'bonk', 'fetch-ai', 'injective-protocol'];
  const WATCHLIST = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'DOGE', 'AVAX'];

  const PREFS_KEY = 'crypto-ia-chart-prefs';
  const REFRESH_KEY = 'crypto-ia-refresh-interval';
  const chartPrefs = loadChartPrefs();

  let refreshIntervalMs = loadRefreshInterval();
  let lastUpdateAt = null;
  let clockTimer = null;

  const els = {
    searchInput: document.getElementById('search-input'),
    searchDropdown: document.getElementById('search-dropdown'),
    recSymbol: document.getElementById('rec-symbol'),
    recName: document.getElementById('rec-name'),
    recPrice: document.getElementById('rec-price'),
    recChange: document.getElementById('rec-change'),
    recSignal: document.getElementById('rec-signal'),
    recConfidence: document.getElementById('rec-confidence'),
    recConfidenceBar: document.getElementById('rec-confidence-bar'),
    recTiming: document.getElementById('rec-timing'),
    volCurrent: document.getElementById('vol-current'),
    volAverage: document.getElementById('vol-average'),
    volComparisonFill: document.getElementById('vol-comparison-fill'),
    volComparisonPct: document.getElementById('vol-comparison-pct'),
    newsList: document.getElementById('news-list'),
    newsBadge: document.getElementById('news-badge'),
    longtermGrid: document.getElementById('longterm-grid'),
    shorttermGrid: document.getElementById('shortterm-grid'),
    priceChart: document.getElementById('price-chart'),
    volumeChart: document.getElementById('volume-chart'),
    chartBadge: document.getElementById('chart-badge'),
    volumeBadge: document.getElementById('volume-badge'),
    apiStatus: document.getElementById('api-status'),
    footerSource: document.getElementById('footer-source'),
    tickerPills: document.getElementById('ticker-pills'),
    chartLegend: document.getElementById('chart-legend'),
    toggleMa: document.getElementById('toggle-ma'),
    statPrice: document.getElementById('stat-price'),
    statChange: document.getElementById('stat-change'),
    statCap: document.getElementById('stat-cap'),
    lastUpdate: document.getElementById('last-update'),
    refreshNow: document.getElementById('refresh-now'),
  };

  function loadRefreshInterval() {
    const fallback = window.COINGECKO_CONFIG?.refreshIntervalMs ?? 60_000;
    const stored = localStorage.getItem(REFRESH_KEY);
    if (stored === null) return fallback;

    const parsed = Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  }

  function saveRefreshInterval() {
    try {
      localStorage.setItem(REFRESH_KEY, String(refreshIntervalMs));
    } catch {
      /* stockage indisponible (navigation privée) : préférence non persistée */
    }
  }

  function loadChartPrefs() {
    const defaults = { type: 'candles', showMA: true };
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return defaults;
    }
  }

  function saveChartPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(chartPrefs));
    } catch {
      /* stockage indisponible (navigation privée) : préférence non persistée */
    }
  }

  async function init() {
    renderLongTerm();
    renderShortTerm();
    renderTickerPills();
    bindSearch();
    bindChartControls();
    bindRefreshControls();
    bindResize();

    setApiStatus('loading', 'Connexion CoinGecko…');

    /* Premier rendu immédiat sur les données locales, puis enrichissement live. */
    await selectCrypto('BTC');
    scheduleRefresh();

    /* /coins/list pèse plusieurs Mo : chargé en tâche de fond pour la recherche. */
    CoinGecko.loadCoinsList().catch((err) => console.warn('[CoinGecko list]', err.message));
    refreshListSections();
  }

  async function refreshListSections() {
    try {
      [longTermMarkets, shortTermMarkets] = await Promise.all([
        CoinGecko.fetchMarkets(LONG_TERM_IDS),
        CoinGecko.fetchMarkets(SHORT_TERM_IDS),
      ]);
      renderLongTerm();
      renderShortTerm();
    } catch (err) {
      console.warn('[CoinGecko lists]', err.message);
    }
  }

  function ensureCryptoEntry(symbol, name, coinId) {
    const sym = symbol.toUpperCase();
    if (!CRYPTO_DATA[sym]) {
      CRYPTO_DATA[sym] = createCryptoShell(sym, name, coinId);
    } else if (coinId && !CRYPTO_DATA[sym].coingeckoId) {
      CRYPTO_DATA[sym].coingeckoId = coinId;
    }
    return CRYPTO_DATA[sym];
  }

  async function selectCrypto(symbol, { coinId, name, skipApi } = {}) {
    const sym = symbol.toUpperCase();
    const resolvedId = coinId || CoinGecko.resolveId(sym);
    const data = ensureCryptoEntry(sym, name || sym, resolvedId);

    currentSymbol = sym;
    currentCoinId = resolvedId || data.coingeckoId;
    const generation = ++fetchGeneration;

    els.searchInput.value = sym;
    closeDropdown();
    syncTickerPills();

    renderRecommendation(data);
    renderVolume(data);
    renderNews(data);
    renderCharts(data);
    loadNews(sym, data, generation);

    els.chartBadge.textContent = `${sym} · 30j`;
    els.volumeBadge.textContent = '14 derniers jours';

    if (skipApi || !CoinGecko.isSupported(sym, currentCoinId)) {
      setApiStatus('mock', 'Données locales (hors API ou erreur init)');
      return;
    }

    setApiStatus('loading', 'Synchronisation CoinGecko…');
    els.recPrice.classList.add('is-loading');

    try {
      const live = await CoinGecko.refreshCrypto(sym, currentCoinId);
      if (generation !== fetchGeneration) return;

      CoinGecko.applyLiveData(data, live);
      renderRecommendation(data);
      renderVolume(data);
      renderCharts(data);
      lastUpdateAt = Date.now();
      renderLastUpdate();
      setApiStatus('live', 'Prix live · CoinGecko');
    } catch (err) {
      if (generation !== fetchGeneration) return;
      console.warn('[CoinGecko]', err.message);
      setApiStatus('error', `API: ${err.message.slice(0, 48)}…`);
    } finally {
      if (generation === fetchGeneration) els.recPrice.classList.remove('is-loading');
    }
  }

  function scheduleRefresh() {
    clearInterval(refreshTimer);
    refreshTimer = null;

    if (refreshIntervalMs > 0) {
      refreshTimer = setInterval(refreshNow, refreshIntervalMs);
    }

    /* L'âge des données défile en continu, même en mode manuel. */
    if (!clockTimer) clockTimer = setInterval(renderLastUpdate, 1000);

    syncRefreshControls();
  }

  async function refreshNow() {
    const tasks = [refreshListSections()];
    if (CoinGecko.isSupported(currentSymbol, currentCoinId)) {
      tasks.push(selectCrypto(currentSymbol, { coinId: currentCoinId }));
    }
    await Promise.all(tasks);
  }

  /* ── Contrôles d'actualisation ── */
  function bindRefreshControls() {
    document.querySelectorAll('[data-interval]').forEach((btn) => {
      btn.addEventListener('click', () => {
        refreshIntervalMs = Number(btn.dataset.interval);
        saveRefreshInterval();
        scheduleRefresh();
      });
    });

    els.refreshNow.addEventListener('click', async () => {
      els.refreshNow.setAttribute('aria-busy', 'true');
      await refreshNow();
      els.refreshNow.removeAttribute('aria-busy');
    });

    syncRefreshControls();
    renderLastUpdate();
  }

  function syncRefreshControls() {
    document.querySelectorAll('[data-interval]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(Number(btn.dataset.interval) === refreshIntervalMs));
    });
  }

  function renderLastUpdate() {
    if (!els.lastUpdate) return;

    if (!lastUpdateAt) {
      els.lastUpdate.textContent = 'En attente de données';
      els.lastUpdate.dataset.state = 'pending';
      return;
    }

    const seconds = Math.floor((Date.now() - lastUpdateAt) / 1000);
    const heure = new Date(lastUpdateAt).toLocaleTimeString('fr-FR');

    els.lastUpdate.textContent = `MAJ ${heure} · ${formatAge(seconds)}`;
    els.lastUpdate.dataset.state = seconds < 90 ? 'fresh' : 'stale';
    els.lastUpdate.title = refreshIntervalMs
      ? `Actualisation automatique toutes les ${formatInterval(refreshIntervalMs)}`
      : 'Actualisation automatique désactivée';
  }

  function formatAge(seconds) {
    if (seconds < 5) return 'à l\'instant';
    if (seconds < 60) return `il y a ${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    return `il y a ${Math.floor(minutes / 60)} h`;
  }

  function formatInterval(ms) {
    return ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`;
  }

  function setApiStatus(state, message) {
    if (!els.apiStatus) return;
    els.apiStatus.textContent = message;
    els.apiStatus.dataset.state = state;
  }

  function renderRecommendation(data) {
    els.recSymbol.textContent = data.symbol;
    els.recName.textContent = data.name;
    els.recPrice.textContent = formatMoney(data.price);
    els.recChange.textContent = formatChange(data.change24h);
    els.recChange.className = `rec-change ${data.change24h >= 0 ? 'is-positive' : 'is-negative'}`;

    els.recSignal.textContent = SIGNAL_LABELS[data.recommendation.signal];
    els.recSignal.dataset.signal = data.recommendation.signal;

    els.recConfidence.textContent = `${data.recommendation.confidence}%`;
    els.recConfidenceBar.style.width = `${data.recommendation.confidence}%`;
    els.recConfidenceBar.parentElement.setAttribute('aria-valuenow', data.recommendation.confidence);

    els.recTiming.textContent = data.recommendation.timing;

    els.statPrice.textContent = formatMoney(data.price);
    els.statChange.textContent = formatChange(data.change24h);
    els.statCap.textContent = CoinGecko.formatMarketCap(data.marketCap);
  }

  function renderVolume(data) {
    const { current24h, average24h, history } = data.volume;

    if (!history?.length) {
      els.volCurrent.textContent = formatVolume(current24h);
      els.volAverage.textContent = '—';
      els.volComparisonPct.textContent = '—';
      return;
    }

    els.volCurrent.textContent = formatVolume(current24h);
    els.volAverage.textContent = formatVolume(average24h);

    const ratio = average24h > 0 ? (current24h / average24h) * 100 : 100;
    const capped = Math.min(ratio, 150);
    els.volComparisonFill.style.width = `${(capped / 150) * 100}%`;
    els.volComparisonPct.textContent = `${ratio.toFixed(0)}%`;

    const avgHistory = history.reduce((s, h) => s + h.value, 0) / history.length;
    Charts.drawVolumeChart(els.volumeChart, history, avgHistory);
  }

  function renderNews(data) {
    els.newsList.innerHTML = data.news.map(newsItemHtml).join('');
  }

  function newsItemHtml(n) {
    const serenity = SERENITY_LABELS[n.serenity] || SERENITY_LABELS.neutre;
    const title = escapeHtml(n.title);
    const titleHtml = n.url
      ? `<a class="news-item__link" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`
      : title;

    /* Une news « marché » n'évoque pas la crypto sélectionnée : on l'étiquette pour éviter la confusion. */
    const scopeTag =
      n.scope === 'market' ? '<span class="news-item__scope">Marché</span>' : '';
    const source = n.source ? `<span class="news-item__source">${escapeHtml(n.source)}</span>` : '';

    return `
      <li class="news-item">
        <div class="serenity-badge" aria-label="Niveau de sérénité : ${serenity}">
          <div class="serenity-badge__indicator" data-serenity="${n.serenity}" role="img" aria-hidden="true"></div>
          <span class="serenity-badge__label">${serenity}</span>
        </div>
        <div class="news-item__content">
          <h3 class="news-item__title">${titleHtml}</h3>
          <p class="news-item__excerpt">${escapeHtml(n.excerpt)}</p>
        </div>
        <div class="news-item__meta">
          <time class="news-item__time" datetime="${n.timestamp}">${formatTimestamp(n.timestamp)}</time>
          ${source}
          ${scopeTag}
        </div>
      </li>`;
  }

  async function loadNews(symbol, data, generation) {
    try {
      const items = await NewsFeed.load(symbol, data.name, data.coingeckoId);
      if (generation !== fetchGeneration) return;

      data.news = items;
      renderNews(data);
      setNewsBadge('live');
    } catch (err) {
      if (generation !== fetchGeneration) return;
      console.warn('[News]', err.message);
      setNewsBadge('mock');
    }
  }

  function setNewsBadge(mode) {
    if (!els.newsBadge) return;

    const live = mode === 'live';
    els.newsBadge.textContent = live ? 'Flux RSS · live' : 'Démo · proxy news inactif';
    els.newsBadge.dataset.newsMode = mode;
    els.newsBadge.title = live
      ? 'Agrégation CoinDesk, Cointelegraph, Decrypt et Bitcoin.com via server.py'
      : 'Lancez python3 server.py pour agréger les vrais flux RSS';

    if (els.footerSource) {
      els.footerSource.textContent = `Prix & volumes · CoinGecko · Signaux · calcul local · News · ${
        live ? 'flux RSS agrégés' : 'données de démonstration'
      }`;
    }
  }

  function renderCharts(data) {
    if (!data.candles?.length) return;
    /* Fenêtres courtes : l'historique chargé couvre 30 jours. */
    const maFast = computeMA(data.candles, 7);
    const maSlow = computeMA(data.candles, 25);
    Charts.drawPriceChart(els.priceChart, data.candles, maFast, maSlow, chartPrefs);
  }

  /* ── Contrôles du graphique ── */
  function bindChartControls() {
    document.querySelectorAll('[data-chart-type]').forEach((btn) => {
      btn.addEventListener('click', () => {
        chartPrefs.type = btn.dataset.chartType;
        saveChartPrefs();
        syncChartControls();
        renderCharts(CRYPTO_DATA[currentSymbol]);
      });
    });

    els.toggleMa.addEventListener('click', () => {
      chartPrefs.showMA = !chartPrefs.showMA;
      saveChartPrefs();
      syncChartControls();
      renderCharts(CRYPTO_DATA[currentSymbol]);
    });

    syncChartControls();
  }

  function syncChartControls() {
    document.querySelectorAll('[data-chart-type]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.chartType === chartPrefs.type));
    });

    els.toggleMa.setAttribute('aria-pressed', String(chartPrefs.showMA));

    /* Chandelles et barres OHLC sont les seuls rendus à distinguer hausse et baisse. */
    const showsDirection = chartPrefs.type === 'candles' || chartPrefs.type === 'ohlc';
    els.chartLegend.querySelectorAll('.chart-legend__item').forEach((item) => {
      if (item.dataset.legend === 'ma') item.hidden = !chartPrefs.showMA;
      else item.hidden = !showsDirection;
    });

    els.priceChart.setAttribute(
      'aria-label',
      `Graphique de prix sur 30 jours, affichage ${Charts.TYPES[chartPrefs.type].toLowerCase()}${
        chartPrefs.showMA ? ', avec moyennes mobiles MA7 et MA25' : ''
      }`
    );
  }

  function renderTickerPills() {
    els.tickerPills.innerHTML = WATCHLIST.map(
      (sym) => `
      <button type="button" class="pill" data-symbol="${sym}" aria-pressed="${sym === currentSymbol}">${sym}</button>`
    ).join('');

    els.tickerPills.querySelectorAll('.pill').forEach((btn) => {
      btn.addEventListener('click', () => selectCrypto(btn.dataset.symbol));
    });
  }

  function syncTickerPills() {
    els.tickerPills.querySelectorAll('.pill').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.symbol === currentSymbol));
    });
  }

  function renderLongTerm() {
    const cards = LONG_TERM_SAFE.map((c) => {
      const market = longTermMarkets.find((m) => m.id === CoinGecko.getId(c.symbol));
      const marketCap = market ? CoinGecko.formatMarketCap(market.market_cap) : c.marketCap;
      const change7d = market?.price_change_percentage_7d_in_currency;
      const trend = market ? CoinGecko.trendFromChange(change7d ?? market.price_change_percentage_24h) : { label: c.trend, dir: c.trendDir };
      const volPct = market?.price_change_percentage_24h;

      return `
      <button type="button" class="crypto-card" data-symbol="${c.symbol}" aria-label="Sélectionner ${c.name}">
        <div class="crypto-card__symbol">${c.symbol}</div>
        <div class="crypto-card__name">${c.name}</div>
        <div class="crypto-card__metrics">
          <div class="crypto-card__metric">
            <span class="crypto-card__metric-key">Cap.</span>
            <span class="crypto-card__metric-val">${marketCap}</span>
          </div>
          <div class="crypto-card__metric">
            <span class="crypto-card__metric-key">Var. 24h</span>
            <span class="crypto-card__metric-val ${volPct >= 0 ? 'is-up' : 'is-down'}">${market ? CoinGecko.formatPct(volPct) : c.volatility}</span>
          </div>
          <div class="crypto-card__metric">
            <span class="crypto-card__metric-key">Tendance</span>
            <span class="crypto-card__metric-val is-${trend.dir}">${trend.label}</span>
          </div>
        </div>
      </button>`;
    });

    els.longtermGrid.innerHTML = cards.join('');

    els.longtermGrid.querySelectorAll('.crypto-card').forEach((btn) => {
      btn.addEventListener('click', () => selectCrypto(btn.dataset.symbol));
    });
  }

  function renderShortTerm() {
    els.shorttermGrid.innerHTML = SHORT_TERM.map((c) => {
      const market = shortTermMarkets.find((m) => m.id === CoinGecko.getId(c.symbol));
      const vol24 = market ? CoinGecko.formatPct(market.price_change_percentage_24h) : c.volatility24h;
      const vol7 = market ? CoinGecko.formatPct(market.price_change_percentage_7d_in_currency) : c.volatility7d;
      const momentum = market
        ? CoinGecko.momentumFromChanges(
            market.price_change_percentage_24h,
            market.price_change_percentage_7d_in_currency
          )
        : c.momentum;

      return `
      <div class="shortterm-card">
        <div class="shortterm-card__header">
          <span class="shortterm-card__symbol">${c.symbol}</span>
          <span class="shortterm-card__name">${c.name}</span>
        </div>
        <div class="shortterm-card__row">
          <span class="shortterm-card__key">Vol. 24h</span>
          <span class="shortterm-card__val">${vol24}</span>
        </div>
        <div class="shortterm-card__row">
          <span class="shortterm-card__key">Vol. 7j</span>
          <span class="shortterm-card__val">${vol7}</span>
        </div>
        <div class="shortterm-card__row">
          <span class="shortterm-card__key">Momentum</span>
          <span class="shortterm-card__val">${momentum}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ── Search ── */
  function bindSearch() {
    els.searchInput.addEventListener('input', onSearchInput);
    els.searchInput.addEventListener('focus', onSearchInput);
    els.searchInput.addEventListener('keydown', onSearchKeydown);
    els.searchInput.addEventListener('blur', () => setTimeout(closeDropdown, 150));

    document.addEventListener('click', (e) => {
      if (!els.searchInput.contains(e.target) && !els.searchDropdown.contains(e.target)) {
        closeDropdown();
      }
    });
  }

  function onSearchInput() {
    const query = els.searchInput.value.trim();
    searchMatches = CoinGecko.searchCoins(query, 12);

    if (searchMatches.length === 0) {
      closeDropdown();
      return;
    }

    showDropdown(searchMatches);
  }

  function showDropdown(matches) {
    highlightIndex = -1;
    searchMatches = matches;

    els.searchDropdown.innerHTML = matches
      .map(
        (coin, i) => `
      <div class="search-option" role="option" tabindex="0" data-index="${i}">
        <span>${coin.symbol}</span>
        <span class="search-option__name">${escapeHtml(coin.name)}</span>
      </div>`
      )
      .join('');

    els.searchDropdown.classList.add('is-open');
    els.searchInput.setAttribute('aria-expanded', 'true');

    els.searchDropdown.querySelectorAll('.search-option').forEach((opt) => {
      opt.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pickSearchResult(Number(opt.dataset.index));
      });
      opt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') pickSearchResult(Number(opt.dataset.index));
      });
    });
  }

  function pickSearchResult(index) {
    const coin = searchMatches[index];
    if (!coin) return;
    selectCrypto(coin.symbol, { coinId: coin.id, name: coin.name });
  }

  function closeDropdown() {
    els.searchDropdown.classList.remove('is-open');
    els.searchInput.setAttribute('aria-expanded', 'false');
    highlightIndex = -1;
  }

  function onSearchKeydown(e) {
    const options = els.searchDropdown.querySelectorAll('.search-option');

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!els.searchDropdown.classList.contains('is-open')) onSearchInput();
      highlightIndex = Math.min(highlightIndex + 1, options.length - 1);
      updateHighlight(options);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      highlightIndex = Math.max(highlightIndex - 1, 0);
      updateHighlight(options);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlightIndex >= 0) {
        pickSearchResult(highlightIndex);
      } else {
        const val = els.searchInput.value.trim();
        const match = CoinGecko.searchCoins(val, 1)[0];
        if (match) pickSearchResult(0);
        else if (CRYPTO_DATA[val.toUpperCase()]) selectCrypto(val);
      }
    } else if (e.key === 'Escape') {
      closeDropdown();
    }
  }

  function updateHighlight(options) {
    options.forEach((opt, i) => {
      opt.classList.toggle('is-highlighted', i === highlightIndex);
    });
    if (options[highlightIndex]) options[highlightIndex].scrollIntoView({ block: 'nearest' });
  }

  function bindResize() {
    let timer;
    window.addEventListener('resize', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (CRYPTO_DATA[currentSymbol]) {
          renderCharts(CRYPTO_DATA[currentSymbol]);
          renderVolume(CRYPTO_DATA[currentSymbol]);
        }
      }, 150);
    });
  }

  /* ── Formatters ── */
  function formatMoney(value) {
    if (!value) return '—';
    if (value >= 1000) {
      return `$${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (value >= 1) {
      return `$${value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
    }
    return `$${value.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 6 })}`;
  }

  function formatChange(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  }

  function formatVolume(value) {
    if (!value) return '—';
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(0)}M`;
    return `$${value.toLocaleString('fr-FR')}`;
  }

  function formatTimestamp(iso) {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffH = Math.floor(diffMs / 3600000);

    if (diffH < 1) return 'Il y a < 1h';
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `Il y a ${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
