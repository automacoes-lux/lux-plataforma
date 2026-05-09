// ═══ AUTENTICAÇÃO LUX ════════════════════════════════════════
// Login com Google via Firebase + lista de e-mails autorizados.
// Para restringir acesso: adicione e-mails em ALLOWED_EMAILS abaixo.
// Para liberar geral: deixe ALLOWED_EMAILS = [].
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

// ── E-mails autorizados ─────────────────────────────────────
// EXEMPLO de uso quando quiser restringir:
//   const ALLOWED_EMAILS = [
//     'thiago@empresa.com',
//     'ana@empresa.com',
//     'maria@empresa.com',
//   ];
// Deixe [] para liberar qualquer conta Google.
const ALLOWED_EMAILS = [];

// ────────────────────────────────────────────────────────────
const app      = initializeApp(firebaseConfig);
const auth     = getAuth(app);
const provider = new GoogleAuthProvider();

const isAllowed = e =>
  !ALLOWED_EMAILS.length ||
  ALLOWED_EMAILS.includes(String(e).toLowerCase());

window.__luxSignIn = async () => {
  try {
    const result = await signInWithPopup(auth, provider);
    if (!isAllowed(result.user.email)) {
      await signOut(auth);
      showAuthError('Acesso não autorizado: ' + result.user.email);
    }
  } catch (e) {
    if (e.code !== 'auth/popup-closed-by-user') showAuthError(e.message);
  }
};

window.__luxSignOut = () => signOut(auth);

onAuthStateChanged(auth, user => {
  if (user && isAllowed(user.email)) {
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
