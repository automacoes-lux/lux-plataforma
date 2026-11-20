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
  // (20/11) 5 s era pouco: celular voltando do segundo plano precisa RENOVAR o login pela rede
  // (o do Google vence a cada 1 h) e, em 4G fraco, passava do prazo — a consulta morria calada e a
  // tela "ficava parada". Agora espera 15 s e tenta mais uma vez antes de desistir.
  function requestTokenFromParent(timeoutMs = 15000) {
    return pedirToken(timeoutMs).catch((e) => {
      if (!/Timeout/.test(String(e && e.message))) throw e;
      return pedirToken(timeoutMs);
    });
  }
  function pedirToken(timeoutMs) {
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
    // Só força Content-Type: application/json se:
    //   1. tem body
    //   2. ninguém setou Content-Type ainda
    //   3. body NÃO é FormData/Blob/URLSearchParams (esses o browser define sozinho)
    if (options.body && !headers.has('Content-Type')) {
      const body = options.body;
      const isFormData       = (typeof FormData !== 'undefined') && (body instanceof FormData);
      const isBlob           = (typeof Blob !== 'undefined') && (body instanceof Blob);
      const isURLParams      = (typeof URLSearchParams !== 'undefined') && (body instanceof URLSearchParams);
      const isArrayBuffer    = body instanceof ArrayBuffer;
      const browserAutoSets  = isFormData || isBlob || isURLParams || isArrayBuffer;
      if (!browserAutoSets) {
        headers.set('Content-Type', 'application/json');
      }
    }
    return fetch(url, { ...options, headers });
  };
})();
