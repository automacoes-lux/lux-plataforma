// ═══ SHELL DA PLATAFORMA — navegação + alertas globais ═══════
// Cuida do roteamento entre dashboard e cada ferramenta (iframe).
// Cada ferramenta vive em tools/<nome>.html e é carregada lazy:
// só monta o iframe na primeira vez que o usuário abre.
//
// Também controla os alertas manuais (admin → atendentes):
// - Faz polling em /alertas/pending a cada 60s
// - Quando há alerta novo, mostra pop-up bloqueante
// - Pop-up só some quando atendente clica "Entendi"
// ═══════════════════════════════════════════════════════════════

const TOOLS = {
  figurinhas:        'tools/figurinhas.html',
  musica:            'tools/maestro.html',
  logo3d:            'tools/logo3d.html',
  cover:             'tools/cover.html',
  corte:             'tools/corte.html',
  videos:            'tools/videos.html',
  'videos-premium':  'tools/videos-premium.html',
  'videos-promocional':'tools/videos-promocional.html',
  atendimento:       'tools/atendimento.html',
  'financeiro-atendente': 'tools/financeiro-atendente.html',
  financeiro:        'tools/financeiro.html',
  admin:             'tools/admin.html',
};

// Worker que serve os alertas (mesmo do atendimento)
const ALERTAS_WORKER_URL = 'https://lux-figurinhas.plataformalux.workers.dev';
const ALERTAS_POLL_INTERVAL = 60000; // 60s

// ── NAVEGAÇÃO ──────────────────────────────────────────────
function handleNav(e) {
  const item = e.target.closest('.nav-item');
  if (!item || item.classList.contains('disabled') || item.classList.contains('soon')) {
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

  // Bloqueia ferramentas "em breve" (ex: videos pro atendente).
  // O card/nav recebe a classe .soon via applyRole quando nao-admin.
  const navEl  = document.querySelector(`.nav-item[data-tool="${name}"]`);
  const cardEl = document.querySelector(`.tool-card[data-card-tool="${name}"]`);
  if ((navEl && navEl.classList.contains('soon')) ||
      (cardEl && cardEl.classList.contains('soon'))) {
    return;
  }

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

// ═══════════════════════════════════════════════════════════════
// SISTEMA DE ALERTAS MANUAIS
// ═══════════════════════════════════════════════════════════════
// Admin dispara alertas via Atendimento.
// Aqui (no shell) ficamos escutando alertas pendentes e mostramos
// pop-up bloqueante pro atendente. Admin não vê próprios alertas.
// ═══════════════════════════════════════════════════════════════

let alertasPollTimer   = null;
let alertaModalAberto  = false;
let alertasNaFila      = []; // fila de pendentes ainda não exibidos

function alertasEnsureStyles() {
  if (document.getElementById('lux-alertas-styles')) return;
  const style = document.createElement('style');
  style.id = 'lux-alertas-styles';
  style.textContent = `
.lux-alert-overlay {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 999999;
  display: flex; align-items: center; justify-content: center;
  padding: 20px;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}
.lux-alert-modal {
  background: #111114;
  border: 2px solid rgba(232,168,76,.7);
  border-radius: 14px;
  padding: 1.6rem 1.4rem;
  max-width: 480px; width: 100%;
  box-shadow: 0 0 60px rgba(232,168,76,.18);
  font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  color: #E8E4DC;
  animation: luxAlertIn .25s ease-out;
}
@keyframes luxAlertIn {
  from { opacity: 0; transform: scale(.92) translateY(-10px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.lux-alert-header { text-align: center; margin-bottom: 1.2rem; }
.lux-alert-icon-wrap {
  display: inline-flex; width: 54px; height: 54px;
  border-radius: 50%; background: rgba(232,168,76,.15);
  align-items: center; justify-content: center;
  margin-bottom: 10px; font-size: 28px;
}
.lux-alert-title {
  font-family: 'Cinzel', Georgia, serif;
  font-size: 16px; color: #E8A84C;
  font-weight: 600; letter-spacing: .12em;
  text-transform: uppercase; margin: 0;
}
.lux-alert-meta {
  font-size: 11px; color: #8A8680; margin-top: 4px;
}
.lux-alert-body {
  background: #18181C;
  border: 1px solid rgba(201,168,76,.15);
  border-radius: 8px;
  padding: 14px 16px;
  margin-bottom: 1.2rem;
  font-size: 14px; line-height: 1.6;
  white-space: pre-wrap; word-break: break-word;
  max-height: 50vh; overflow-y: auto;
}
.lux-alert-btn {
  width: 100%;
  background: linear-gradient(135deg, #C9A84C, #E2BA5F);
  border: none; color: #000;
  padding: 12px; border-radius: 8px;
  font-size: 13px; font-weight: 600;
  letter-spacing: .12em; text-transform: uppercase;
  cursor: pointer;
  font-family: 'Cinzel', Georgia, serif;
  transition: filter .15s, transform .1s;
}
.lux-alert-btn:hover:not(:disabled) {
  filter: brightness(1.08);
  transform: translateY(-1px);
}
.lux-alert-btn:disabled { opacity: .5; cursor: wait; }
.lux-alert-footer {
  font-size: 11px; color: #666;
  text-align: center; margin-top: 10px;
}
@media (max-width: 520px) {
  .lux-alert-modal { padding: 1.2rem 1rem; }
  .lux-alert-title { font-size: 14px; }
}
  `;
  document.head.appendChild(style);
}

function alertasEscapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function alertasFmtTime(ts) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1)  return 'agora há pouco';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d>1?'s':''}`;
}

function alertasShowModal(alerta) {
  if (alertaModalAberto) return; // já tem um aberto
  alertaModalAberto = true;

  alertasEnsureStyles();

  const overlay = document.createElement('div');
  overlay.className = 'lux-alert-overlay';
  overlay.id = 'lux-alert-overlay-' + alerta.id;
  overlay.innerHTML = `
    <div class="lux-alert-modal" role="dialog" aria-modal="true">
      <div class="lux-alert-header">
        <div class="lux-alert-icon-wrap">🔔</div>
        <h3 class="lux-alert-title">Atualização importante</h3>
        <div class="lux-alert-meta">enviado pela coordenação · ${alertasFmtTime(alerta.criadoEm)}</div>
      </div>
      <div class="lux-alert-body">${alertasEscapeHtml(alerta.mensagem)}</div>
      <button class="lux-alert-btn" id="lux-alert-btn-${alerta.id}">
        ✓ Entendi
      </button>
      <div class="lux-alert-footer">
        Esta mensagem não aparecerá mais após confirmar.
      </div>
    </div>
  `;

  // Bloqueia ESC pra não fechar acidentalmente
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') e.preventDefault();
  });

  document.body.appendChild(overlay);

  const btn = document.getElementById('lux-alert-btn-' + alerta.id);
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Confirmando...';
    try {
      if (window.__luxFetch) {
        await window.__luxFetch(ALERTAS_WORKER_URL + '/alertas/' + alerta.id + '/seen', { method: 'POST' });
      }
    } catch (e) {
      // mesmo se der erro de rede, fechamos o pop-up (tenta de novo se necessário)
    }

    // Fecha esse modal
    overlay.remove();
    alertaModalAberto = false;

    // Mostra o próximo da fila se houver
    if (alertasNaFila.length > 0) {
      const proximo = alertasNaFila.shift();
      setTimeout(() => alertasShowModal(proximo), 300);
    }
  });
}

async function alertasFetchPending() {
  // Aguarda __luxFetch estar disponível (auth carregou)
  if (!window.__luxFetch) return;

  try {
    const resp = await window.__luxFetch(ALERTAS_WORKER_URL + '/alertas/pending');
    if (!resp.ok) return;
    const data = await resp.json();
    if (!data.ok || !Array.isArray(data.alertas)) return;

    // Filtra os que ainda não estão na fila nem sendo exibidos
    const idsConhecidos = new Set(alertasNaFila.map(a => a.id));
    const overlayIds = Array.from(document.querySelectorAll('[id^="lux-alert-overlay-"]'))
      .map(el => el.id.replace('lux-alert-overlay-', ''));
    overlayIds.forEach(id => idsConhecidos.add(id));

    const novos = data.alertas.filter(a => !idsConhecidos.has(a.id));

    if (novos.length === 0) return;

    // Adiciona à fila e exibe o primeiro se não tem modal aberto
    novos.forEach(a => alertasNaFila.push(a));
    if (!alertaModalAberto) {
      const primeiro = alertasNaFila.shift();
      alertasShowModal(primeiro);
    }
  } catch (e) {
    // silencia erros (rede instável, etc) — tenta de novo no próximo ciclo
  }
}

function alertasStartPolling() {
  if (alertasPollTimer) return;
  // Primeira chamada com delay curto pra dar tempo do auth carregar
  setTimeout(alertasFetchPending, 2000);
  alertasPollTimer = setInterval(alertasFetchPending, ALERTAS_POLL_INTERVAL);
}

// Inicia polling assim que o shell carrega
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', alertasStartPolling);
} else {
  alertasStartPolling();
}

// Expõe pro atendimento.html avisar o shell que dispararam um alerta
window.luxAlertasRefresh = alertasFetchPending;

// Exposto pro auth.js e pro HTML inline
window.showDashboard = showDashboard;
window.loadTool      = loadTool;
window.handleNav     = handleNav;
window.toggleSidebar = toggleSidebar;
window.closeSidebar  = closeSidebar;
