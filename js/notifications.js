/**
 * Alertes de signaux — pile de notifications pour les cryptos passant à l'achat
 * ou à la vente. Le contenu est construit via textContent : aucune donnée
 * d'API n'est interprétée comme du HTML.
 */
const Notifier = (() => {
  const MUTE_KEY = 'crypto-ia-alerts-muted';
  const MAX_VISIBLE = 4;

  let container = null;
  let toggle = null;
  let muted = loadMuted();

  function loadMuted() {
    try {
      return localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      return false;
    }
  }

  function saveMuted() {
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* stockage indisponible (navigation privée) : préférence non persistée */
    }
  }

  function init(elements) {
    container = elements.container;
    toggle = elements.toggle;

    toggle?.addEventListener('click', () => setMuted(!muted));
    syncToggle();
  }

  function setMuted(value) {
    muted = value;
    saveMuted();
    syncToggle();
    if (muted) clear();
  }

  function syncToggle() {
    if (!toggle) return;

    toggle.textContent = muted ? 'Alertes coupées' : 'Alertes actives';
    toggle.setAttribute('aria-pressed', String(!muted));
    toggle.dataset.muted = String(muted);
    toggle.title = muted
      ? 'Réactiver les notifications de signaux'
      : 'Couper les notifications de signaux';
  }

  function clear() {
    if (container) container.replaceChildren();
  }

  function formatPrice(value) {
    if (value >= 1000) return `$${value.toLocaleString('fr-FR', { maximumFractionDigits: 0 })}`;
    if (value >= 1) return `$${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })}`;
    return `$${value.toLocaleString('fr-FR', { maximumFractionDigits: 4 })}`;
  }

  function buildToast(alert) {
    const node = document.createElement('article');
    node.className = 'toast';
    node.dataset.signal = alert.signal;
    node.setAttribute('role', 'status');

    const body = document.createElement('div');
    body.className = 'toast__body';

    const title = document.createElement('p');
    title.className = 'toast__title';

    const symbol = document.createElement('span');
    symbol.className = 'toast__symbol';
    symbol.textContent = alert.symbol;
    title.append(symbol, alert.actionSuffix || (alert.signal === 'buy' ? ' à acheter' : ' à vendre'));

    const sign = alert.change24h >= 0 ? '+' : '';
    const detail = document.createElement('p');
    detail.className = 'toast__detail mono';
    detail.textContent = `${formatPrice(alert.price)} · ${sign}${alert.change24h.toFixed(1)}% 24h`;

    body.append(title, detail);

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast__close';
    close.setAttribute('aria-label', `Fermer l'alerte ${alert.symbol}`);
    close.textContent = '×';
    close.addEventListener('click', () => node.remove());

    node.append(body, close);
    return node;
  }

  function push(alert) {
    if (muted || !container) return;

    container.prepend(buildToast(alert));

    /* La pile est plafonnée : une rafale de signaux ne doit pas noyer l'écran. */
    while (container.children.length > MAX_VISIBLE) {
      container.lastElementChild.remove();
    }
  }

  function pushMany(alerts) {
    alerts.forEach(push);
  }

  return { init, push, pushMany, clear, isMuted: () => muted };
})();
