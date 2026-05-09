# Plataforma Lux

Plataforma interna de ferramentas com IA: figurinhas, letras de música e (em breve) vídeos.

## Estrutura

```
lux-plataforma/
├── index.html              ← Shell: login + sidebar + dashboard. Carrega cada ferramenta em iframe.
├── assets/
│   └── lux-logo.png        ← Logo. Trocar aqui atualiza em todos os lugares.
├── css/
│   ├── theme.css           ← Variáveis de cor, fontes, design tokens compartilhados.
│   └── shell.css           ← Estilos do shell (login, sidebar, dashboard, topbar mobile).
├── js/
│   ├── auth.js             ← Firebase + lista ALLOWED_EMAILS para restringir acesso.
│   └── shell.js            ← Roteamento entre dashboard e ferramentas.
└── tools/
    ├── figurinhas.html     ← Gerador de figurinhas (LIVE).
    ├── maestro.html        ← Gerador de letras Lux Music (LIVE).
    └── videos.html         ← Placeholder "em breve".
```

## Como editar cada parte

| Quero mexer em… | Edite só este arquivo |
|---|---|
| Cores, fontes, identidade visual | `css/theme.css` |
| Login, sidebar, cards do dashboard | `index.html` + `css/shell.css` |
| Restringir login a e-mails específicos | `js/auth.js` (constante `ALLOWED_EMAILS`) |
| Lógica de navegação | `js/shell.js` |
| Ferramenta de Figurinhas | `tools/figurinhas.html` |
| Ferramenta de Letra de Música | `tools/maestro.html` |

## Como adicionar uma ferramenta nova

1. Crie `tools/minha-ferramenta.html` (HTML standalone, com seu próprio `<style>` e `<script>`; pode importar `../css/theme.css` para herdar o tema).
2. Em `js/shell.js`, adicione a entrada no objeto `TOOLS`:
   ```js
   const TOOLS = {
     figurinhas: 'tools/figurinhas.html',
     musica:     'tools/maestro.html',
     videos:     'tools/videos.html',
     'minha-ferramenta': 'tools/minha-ferramenta.html',
   };
   ```
3. Em `index.html`, adicione o item de menu na sidebar e o card no dashboard:
   ```html
   <!-- Sidebar -->
   <a class="nav-item" data-tool="minha-ferramenta" href="#">
     <div class="nav-icon">⚡</div> Minha Ferramenta
     <span class="nav-badge badge-live">LIVE</span>
   </a>

   <!-- Dashboard -->
   <div class="tool-card" onclick="loadTool('minha-ferramenta')">
     <div class="tool-card-icon">⚡</div>
     <div class="tool-card-name">MINHA FERRAMENTA</div>
     <div class="tool-card-desc">Descrição da ferramenta…</div>
     <div class="tool-card-footer">
       <span class="status-live">● Disponível</span>
       <span class="tool-arrow">→</span>
     </div>
   </div>

   <!-- View / iframe container -->
   <div id="view-minha-ferramenta" class="tool-panel">
     <div class="tool-panel-header">
       <button class="btn-back" onclick="showDashboard()">← Voltar</button>
       <span class="tool-panel-title">⚡ MINHA FERRAMENTA</span>
     </div>
   </div>
   ```

## Restringir acesso por e-mail

Edite `js/auth.js`, troque a linha:

```js
const ALLOWED_EMAILS = [];
```

por:

```js
const ALLOWED_EMAILS = [
  'thiago@empresa.com',
  'ana@empresa.com',
];
```

Quem não estiver na lista fará login mas será deslogado imediatamente, com aviso.

## Backend (Apps Script)

| Ferramenta | URL do Apps Script | Modelo OpenAI |
|---|---|---|
| Figurinhas | `https://script.google.com/macros/s/AKfycbwk…/exec` | `gpt-image-1.5` |
| Lux Music | `https://script.google.com/macros/s/AKfycbwS…/exec` | `gpt-4o-mini` |

A URL é hardcoded em cada arquivo de ferramenta (procure por `APPS_SCRIPT_URL`).

## Hospedagem

GitHub Pages: `https://automacoes-lux.github.io/lux-plataforma`
Domínio autorizado no Firebase: `automacoes-lux.github.io`
