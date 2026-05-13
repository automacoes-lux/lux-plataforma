// ═══ AUTENTICAÇÃO LUX ════════════════════════════════════════
// Login com Google via Firebase.
// A whitelist de e-mails agora é gerenciada NO WORKER (KV LUX_USERS),
// não mais aqui. O front confia no que o Worker responder.
// ═══════════════════════════════════════════════════════════════

import { initializeApp }   from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut }
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

// Guarda o usuário atual e dados vindos do Worker (role, nome)
window.__luxUser = null;     // objeto Firebase user

// ── Helper global: __luxFetch ──────────────────────────────
// Use SEMPRE essa função no lugar de fetch() pra chamar o Worker.
// Ela anexa o ID Token do Firebase no header Authorization.
//
// Uso:  const r = await window.__luxFetch(WORKER_URL + '/createOrder', {
//         method: 'POST', body: JSON.stringify({...})
//       });
// ───────────────────────────────────────────────────────────
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

onAuthStateChanged(auth, user => {
  if (user) {
    window.__luxUser = user;
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
    if (!window.__appReady) {
      window.__appReady = true;
      if (typeof window.showDashboard === 'function') window.showDashboard();
    }
  } else {
    window.__luxUser = null;
    document.getElementById('screen-login').style.display = 'flex';
    document.getElementById('screen-app').style.display   = 'none';
    window.__appReady = false;
  }
});

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (!el) return;
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 4000);
}
