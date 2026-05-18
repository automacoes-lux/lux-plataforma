// ═══ AUTENTICAÇÃO LUX (PAI) ══════════════════════════════════
// Login com Google via Firebase. A whitelist agora é gerenciada
// NO WORKER (KV LUX_USERS), não mais aqui.
//
// Este arquivo roda na PAGE PAI (index.html). Os iframes-filhos
// (tools/figurinhas.html, etc.) NÃO podem acessar window.__luxFetch
// diretamente porque cada iframe tem seu próprio JS context.
//
// Solução: o iframe envia postMessage({type:'luxGetToken'}) pra cá,
// e este script responde com o ID Token do Firebase. O helper
// __luxFetch do iframe (em auth-iframe.js) cuida do resto.
// ═══════════════════════════════════════════════════════════════

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut,
         setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── Configuração do projeto Firebase ────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyA-O4XLh-qgYtc1-umtsgxxvOhXSR_dNlk",
  authDomain:        "lux-plataforma.firebaseapp.com",
  projectId:         "lux-plataforma",
  storageBucket:     "lux-plataforma.firebasestorage.app",
  messagingSenderId: "510483796904",
  appId:             "1:510483796904:web:e20b57de4598fa08e1839d"
};

// ────────────────────────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

// Mantém a sessão salva no navegador (não desloga ao recarregar a
// página nem ao fechar/reabrir o navegador). O Firebase renova o
// token automaticamente; o usuário só precisa logar de novo se
// ficar muito tempo sem abrir ou se for removido da whitelist.
setPersistence(auth, browserLocalPersistence).catch((e) => {
  console.warn('Falha ao definir persistência de sessão:', e.message);
});

// Guarda o usuário atual (Firebase user)
window.__luxUser = null;

// ── Helper global: __luxFetch (para uso no PRÓPRIO index.html) ──
// Iframes-filhos NÃO usam essa função: eles usam o helper do
// auth-iframe.js, que pede token via postMessage.
window.__luxFetch = async (url, options = {}) => {
  if (!window.__luxUser) {
    throw new Error('Usuário não autenticado.');
  }
  const idToken = await window.__luxUser.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', 'Bearer ' + idToken);
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(url, { ...options, headers });
};

// ── Listener pra os iframes pedirem o token ───────────────────
// Iframe manda: { type: 'luxGetToken', requestId: <n> }
// Pai responde: { type: 'luxToken',    requestId: <n>, token: '...' }
//             ou: { type: 'luxToken',    requestId: <n>, error: '...' }
window.addEventListener('message', async (event) => {
  // Aceita só mensagens do mesmo origin (segurança)
  if (event.origin !== window.location.origin) return;

  const data = event.data;
  if (!data || data.type !== 'luxGetToken') return;

  try {
    if (!window.__luxUser) {
      throw new Error('Usuário não autenticado.');
    }
    const token = await window.__luxUser.getIdToken();
    event.source.postMessage(
      { type: 'luxToken', requestId: data.requestId, token },
      event.origin
    );
  } catch (err) {
    event.source.postMessage(
      { type: 'luxToken', requestId: data.requestId, error: err.message },
      event.origin
    );
  }
});

// ───────────────────────────────────────────────────────────
window.__luxSignIn = async () => {
  try {
    await signInWithPopup(auth, provider);
    // A validação real (whitelist) acontece quando o usuário faz
    // qualquer chamada ao Worker. Se o email não estiver no KV,
    // o Worker retorna 403 e o app exibe o erro.
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showAuthError(e.message);
  }
};

window.__luxSignOut = () => signOut(auth);

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // ─── PORTÃO DE SEGURANÇA ────────────────────────────────────
    // ANTES de mostrar qualquer coisa da plataforma, valida no
    // Worker se este email está autorizado (KV LUX_USERS).
    // Usuário não autorizado é deslogado IMEDIATAMENTE e NUNCA vê
    // o interior da plataforma.
    let authorizedUser = null;
    try {
      const idToken = await user.getIdToken();
      const resp = await fetch(
        'https://lux-figurinhas.plataformalux.workers.dev/admin/me',
        { headers: { 'Authorization': 'Bearer ' + idToken } }
      );
      if (resp.ok) {
        const data = await resp.json();
        if (data.ok && data.user) authorizedUser = data.user;
      }
    } catch (e) {
      console.warn('Falha ao validar acesso:', e.message);
      // Em falha de rede, NÃO libera (fail-closed por segurança).
    }

    if (!authorizedUser) {
      // Bloqueia: desloga e mostra mensagem clara na tela de login.
      window.__luxUser = null;
      window.__luxRole = null;
      await signOut(auth);
      document.getElementById('screen-login').style.display = 'flex';
      document.getElementById('screen-app').style.display   = 'none';
      window.__appReady = false;
      applyRole(null);
      showAuthError(
        'Acesso não autorizado. O email ' + (user.email || '') +
        ' não está liberado nesta plataforma. Fale com o administrador.'
      );
      return;
    }

    // ─── Autorizado: libera a plataforma ────────────────────────
    window.__luxUser = user;
    window.__luxRole = authorizedUser.role;
    document.getElementById('screen-login').style.display = 'none';
    document.getElementById('screen-app').style.display   = 'flex';
    document.getElementById('user-name').textContent  = user.displayName || user.email;
    document.getElementById('user-email').textContent = user.email;
    if (user.photoURL) {
      const av = document.getElementById('user-avatar');
      av.src = user.photoURL;
      av.style.display = 'block';
      document.getElementById('user-initials').style.display = 'none';
    } else {
      document.getElementById('user-initials').textContent =
        (user.displayName || user.email)[0].toUpperCase();
    }
    applyRole(authorizedUser.role);
    if (!window.__appReady) {
      window.__appReady = true;
      if (typeof window.showDashboard === 'function') window.showDashboard();
    }
  } else {
    window.__luxUser = null;
    window.__luxRole = null;
    document.getElementById('screen-login').style.display = 'flex';
    document.getElementById('screen-app').style.display   = 'none';
    window.__appReady = false;
    applyRole(null);
  }
});

// ── Mostra/esconde itens da sidebar baseado no role ────────
function applyRole(role) {
  document.querySelectorAll('[data-role-required]').forEach(el => {
    const required = el.getAttribute('data-role-required');
    el.style.display = (required === role) ? '' : 'none';
  });
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}
