// ═══ SHELL DA PLATAFORMA — navegação ═════════════════════════
// Cuida do roteamento entre dashboard e cada ferramenta (iframe).
// Cada ferramenta vive em tools/<nome>.html e é carregada lazy:
// só monta o iframe na primeira vez que o usuário abre.
// ═══════════════════════════════════════════════════════════════

const TOOLS = {
  figurinhas:        'tools/figurinhas.html',
  musica:            'tools/maestro.html',
  videos:            'tools/videos.html',
  'videos-premium':  'tools/videos-premium.html',
  'meus-custos':     'tools/meus-custos.html',
  admin:             'tools/admin.html',
};

// ── NAVEGAÇÃO ──────────────────────────────────────────────
function handleNav(e) {
  const item = e.target.closest('.nav-item');
  if (!item || item.classList.contains('disabled')) {
    e.preventDefault();
    return;
  }
  e.preventDefault();
  const tool = item.dataset.tool;
  if (tool === 'dashboard') showDashboard();
  else loadTool(tool);
  closeSidebar();
}

function showDashboard() {
  hideAll();
  document.getElementById('view-dashboard').style.display = 'block';
  setNav('dashboard');
  document.getElementById('mainContent').scrollTo(0, 0);
}

function loadTool(name) {
  const url = TOOLS[name];
  if (!url) return;

  hideAll();

  const view = document.getElementById('view-' + name);
  if (!view) return;

  // Lazy-mount: cria o iframe só na primeira vez
  let iframe = view.querySelector('iframe.tool-iframe');
  if (!iframe) {
    iframe = document.createElement('iframe');
    iframe.className = 'tool-iframe';
    iframe.src = url;
    iframe.allow = 'clipboard-write';
    iframe.allowFullscreen = true;
    view.appendChild(iframe);
  }

  view.classList.add('show');
  setNav(name);

  // Preenche o nome do atendente na topbar (Lux Music e Figurinhas)
  const atendenteSlots = { musica: 'musicAtendente', figurinhas: 'figurinhasAtendente' };
  if (atendenteSlots[name]) {
    const slot = document.getElementById(atendenteSlots[name]);
    if (slot) {
      const nm = (document.getElementById('user-name') || {}).textContent
              || (document.getElementById('user-email') || {}).textContent || '';
      slot.innerHTML = nm ? 'Atendente: <strong>' + nm + '</strong>' : '';
    }
  }

  document.getElementById('mainContent').scrollTo(0, 0);
}

function hideAll() {
  document.getElementById('view-dashboard').style.display = 'none';
  document.querySelectorAll('.tool-panel').forEach(el => el.classList.remove('show'));
}

function setNav(tool) {
  document.querySelectorAll('.nav-item').forEach(i =>
    i.classList.toggle('active', i.dataset.tool === tool)
  );
}

// ── SIDEBAR MOBILE ─────────────────────────────────────────
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('show');
}

// Exposto pro auth.js e pro HTML inline
window.showDashboard = showDashboard;
window.loadTool      = loadTool;
window.handleNav     = handleNav;
window.toggleSidebar = toggleSidebar;
window.closeSidebar  = closeSidebar;
