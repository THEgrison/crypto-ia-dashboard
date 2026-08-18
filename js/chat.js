/**
 * Assistant conversationnel — dialogue avec /api/chat exposé par server.py.
 *
 * La clé du modèle reste côté serveur : le navigateur n'envoie que l'historique
 * et un instantané des données affichées. Sans clé configurée, le serveur
 * répond quand même à partir de ce contexte, en mode déterministe.
 */
const Chat = (() => {
  const MAX_HISTORY = 12;

  let els = {};
  let getContext = () => ({});
  let history = [];
  let pending = false;
  let source = null;

  function init(options) {
    els = options.elements;
    getContext = options.getContext || getContext;

    els.toggle.addEventListener('click', () => setOpen(els.panel.hidden));
    els.close.addEventListener('click', () => setOpen(false));
    els.form.addEventListener('submit', onSubmit);

    document.querySelectorAll('[data-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        els.input.value = btn.dataset.prompt;
        els.form.requestSubmit();
      });
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !els.panel.hidden) setOpen(false);
    });

    greet();
    probe();
  }

  async function probe() {
    try {
      const res = await fetch('/api/chat');
      if (!res.ok) return;
      const data = await res.json();
      setSource(data.model);
    } catch {
      /* Le badge reste sur sa valeur par défaut tant que le serveur n'a pas répondu. */
    }
  }

  function setOpen(open) {
    els.panel.hidden = !open;
    els.toggle.setAttribute('aria-expanded', String(open));
    if (open) els.input.focus();
  }

  function greet() {
    addMessage(
      'assistant',
      "Posez-moi une question sur la crypto affichée : son signal, sa tendance, ses volumes ou ses actualités. J'analyse les données du dashboard, je ne donne aucun conseil d'investissement."
    );
  }

  function addMessage(role, text, meta) {
    const node = document.createElement('div');
    node.className = 'chat-msg';
    node.dataset.role = role;

    const bubble = document.createElement('p');
    bubble.className = 'chat-msg__text';
    bubble.textContent = text;
    node.append(bubble);

    if (meta) {
      const tag = document.createElement('span');
      tag.className = 'chat-msg__meta';
      tag.textContent = meta;
      node.append(tag);
    }

    els.log.append(node);
    els.log.scrollTop = els.log.scrollHeight;
    return node;
  }

  async function onSubmit(event) {
    event.preventDefault();

    const question = els.input.value.trim();
    if (!question || pending) return;

    els.input.value = '';
    addMessage('user', question);
    history.push({ role: 'user', content: question });

    pending = true;
    els.send.disabled = true;
    const placeholder = addMessage('assistant', 'Analyse en cours…');
    placeholder.dataset.state = 'pending';

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.slice(-MAX_HISTORY),
          context: getContext(),
        }),
      });

      if (!res.ok) throw new Error(`Assistant ${res.status}`);

      const data = await res.json();
      placeholder.remove();
      addMessage('assistant', data.reply, data.warning || null);
      history.push({ role: 'assistant', content: data.reply });
      setSource(data.source);
    } catch (err) {
      placeholder.remove();
      addMessage(
        'assistant',
        "L'assistant est injoignable. Vérifiez que le dashboard est bien servi par python3 server.py."
      );
      console.warn('[Chat]', err.message);
    } finally {
      pending = false;
      els.send.disabled = false;
      els.input.focus();
    }
  }

  function setSource(value) {
    if (!value || value === source) return;
    source = value;
    els.badge.textContent = value === 'groq' ? 'Groq · gpt-oss-20b' : 'Mode local';
    els.badge.title =
      value === 'groq'
        ? 'Réponses générées par un modèle de langage via server.py'
        : 'Aucune clé GROQ_API_KEY configurée : réponses construites depuis les données du dashboard';
  }

  return { init };
})();
