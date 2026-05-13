// ═══ AUTH-IFRAME — helper de fetch para iframes-filhos ═══════
// Cada ferramenta (tools/figurinhas.html, etc.) carrega este
// arquivo. Ele NÃO inicia Firebase — apenas pede o token Firebase
// do pai (index.html) via postMessage, e expõe __luxFetch.
// ═══════════════════════════════════════════════════════════════

(function () {
  // Mapa de requestId -> { resolve, reject }
  const pendingRequests = new Map();
  let requestCounter = 0;

  // Recebe respostas do pai
  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'luxToken') return;

    const pending = pendingRequests.get(data.requestId);
    if (!pending) return;
    pendingRequests.delete(data.requestId);

    if (data.error) pending.reject(new Error(data.error));
    else pending.resolve(data.token);
  });

  // Pede o ID Token ao pai
  function requestTokenFromParent(timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      if (window.parent === window) {
        reject(new Error('Esta página deve ser aberta dentro da plataforma Lux.'));
        return;
      }
      const requestId = ++requestCounter;
      pendingRequests.set(requestId, { resolve, reject });

      window.parent.postMessage(
        { type: 'luxGetToken', requestId },
        window.location.origin
      );

      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          pendingRequests.delete(requestId);
          reject(new Error('Timeout ao pedir token ao pai.'));
        }
      }, timeoutMs);
    });
  }

  // Função global usada por todas as ferramentas
  window.__luxFetch = async (url, options = {}) => {
    const token = await requestTokenFromParent();
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', 'Bearer ' + token);
    if (options.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return fetch(url, { ...options, headers });
  };
})();
