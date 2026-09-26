// ================================================================
// PRÉVIA PARA O CLIENTE — motor compartilhado (26/09/2026)
// ================================================================
// Usado pela Lux Music (botão Prévia em cada versão + o bloco "Prévia de
// música" para arquivo feito fora da plataforma) e pelo Suno Download.
//
// Monta, no NAVEGADOR do atendente, um trecho da música com a voz da Lux
// por cima, para mandar ao cliente antes do pagamento. Não chama IA, não
// gasta crédito e não passa pelo servidor: custo zero por prévia.
// Medido no PC do Thiago: 3 a 4 s (até ~6 s com o PC carregado) — quase
// tudo é a conversão para MP3.
//
// O FORMATO foi calibrado pelo Thiago de ouvido ("ficou perfeito"):
//   0,15 s  "A Lúx cria as melhores músicas!"   (sem música)
//           a música entra e toca 20 s CHEIOS
//   6,6 s   "Versão de teste Lúx."              ┐ tempos do PLAYER (desde
//   13 s    "Isso é só o começo!"               │ o começo do arquivo, não
//   19 s    "Impressione com a Lúx."            ┘ da música); a música abaixa
//   fim dos 20 s: a música some e, em SILÊNCIO,
//           "Gostou? Ou deseja alguma alteração?"
//
// As falas vêm de UM arquivo gravado na ElevenLabs (voz Ana Alice, v3):
// tools/luxmusic-previa-vozes.mp3. PREVIA.falas diz onde cada fala está
// DENTRO dele — trocou a gravação, esses tempos mudam (ache pelos
// silêncios). A ElevenLabs já cortou a última frase duas vezes: confira
// que o arquivo novo termina em silêncio antes de usar.
//
// Uso:
//   const blob = await PreviaLux.montar(bytesOuPromessa, txt => botao.textContent = txt);
//   PreviaLux.baixar(blob, 'Pizzaria do João');   // -> Pizzaria-do-Joao-PREVIA.mp3
// ================================================================
(function(){
  // a gravação é achada a partir DESTE arquivo (js/), não da página
  const AQUI = (document.currentScript && document.currentScript.src) || location.href;

  const PREVIA = {
    vozes: new URL('../tools/luxmusic-previa-vozes.mp3', AQUI).href,
    falas: {
      abertura:    { ini: 0.12,  fim: 2.78 },   // "A Lúx cria as melhores músicas!"
      marca:       { ini: 3.93,  fim: 5.71 },   // "Versão de teste Lúx."
      comeco:      { ini: 6.82,  fim: 8.33 },   // "Isso é só o começo!"
      impressione: { ini: 9.40,  fim: 11.15 },  // "Impressione com a Lúx."
      // "Gostou?" + "Ou deseja alguma alteração?", com a pausa original da
      // gravação (0,87 s = 0,77 + as folgas do recorte)
      chamada:     { partes: [{ ini: 12.26, fim: 12.83 }, { ini: 13.70, fim: 15.39, fadeFim: 0.08 }], intervalo: 0.77 }
    },
    noMeio:        [['marca', 6.6], ['comeco', 13], ['impressione', 19]],   // tempo do ARQUIVO
    respiroAntes:  0.15,   // silêncio antes da abertura
    respiroDepois: 0.35,   // entre a abertura e a música
    musicaDura:    20,     // segundos de música
    someEm:        1.2,    // fade da música no fim
    silencio:      0.25,   // silêncio antes da chamada
    abaixaPara:    0.35,   // volume da música sob as falas
    rampa:         0.08,
    kbps:          192     // mesmo MP3 do Corte e do Suno Download
  };

  // ── o conversor de MP3 e as vozes: baixados só na 1ª prévia da sessão ──
  let promessaLame = null;
  function carregarLame(){
    if(typeof lamejs !== 'undefined') return Promise.resolve();
    if(!promessaLame){
      promessaLame = new Promise((ok, falha) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
        s.onload = () => ok();
        s.onerror = () => { promessaLame = null; falha(new Error('o conversor de MP3 não carregou')); };
        document.head.appendChild(s);
      });
    }
    return promessaLame;
  }

  function decodificar(bytes){
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    return new Off(2, 44100, 44100).decodeAudioData(bytes);
  }

  let promessaVozes = null;
  function carregarVozes(){
    if(!promessaVozes){
      promessaVozes = (async () => {
        const r = await fetch(PREVIA.vozes);
        if(!r.ok) throw new Error('a gravação da voz não foi encontrada (' + r.status + ')');
        const buf = await decodificar(await r.arrayBuffer());
        const v = {};
        for(const [nome, lim] of Object.entries(PREVIA.falas)) v[nome] = recortarFala(buf, lim);
        return v;
      })().catch(e => { promessaVozes = null; throw e; });
    }
    return promessaVozes;
  }

  // Recorta uma fala da gravação (com folga e micro-fade, sem estalo) e
  // iguala o volume pela média — o sussurro sobe junto com as outras.
  function recortarFala(buf, lim){
    if(lim.partes){                               // fala em pedaços: junta com a pausa
      const pedacos = lim.partes.map(p => recortarFala(buf, p));
      const gap = Math.round((lim.intervalo || 0.3) * buf.sampleRate);
      const out = new AudioBuffer({ numberOfChannels: 1, sampleRate: buf.sampleRate,
        length: pedacos.reduce((s, p) => s + p.length, 0) + gap * (pedacos.length - 1) });
      const o = out.getChannelData(0);
      let pos = 0;
      pedacos.forEach((p, i) => { o.set(p.getChannelData(0), pos); pos += p.length + (i < pedacos.length - 1 ? gap : 0); });
      return out;
    }
    const taxa = buf.sampleRate, d = buf.getChannelData(0);
    const a = Math.max(0, Math.round((lim.ini - 0.04) * taxa));
    const b = Math.min(d.length, Math.round((lim.fim + 0.06) * taxa));
    const out = new AudioBuffer({ numberOfChannels: 1, sampleRate: taxa, length: b - a });
    const o = out.getChannelData(0);
    for(let i = a; i < b; i++) o[i - a] = d[i];
    const fi = Math.round(0.01 * taxa), ff = Math.round((lim.fadeFim || 0.01) * taxa);
    for(let i = 0; i < fi; i++) o[i] *= i / fi;
    for(let i = 0; i < ff; i++) o[o.length - 1 - i] *= i / ff;
    let soma = 0, pico = 0;
    for(let i = 0; i < o.length; i++){ soma += o[i] * o[i]; pico = Math.max(pico, Math.abs(o[i])); }
    const g = Math.min(0.158 / (Math.sqrt(soma / o.length) || 1), 0.95 / (pico || 1));
    for(let i = 0; i < o.length; i++) o[i] *= g;
    return out;
  }

  async function mixar(musica, v){
    const P = PREVIA, taxa = musica.sampleRate;
    const tMus = P.respiroAntes + v.abertura.duration + P.respiroDepois;
    const fimMusica = tMus + Math.min(P.musicaDura, musica.duration);
    const tCta = fimMusica + P.someEm + P.silencio;
    const total = tCta + v.chamada.duration + 0.4;
    // falas do meio em tempo do ARQUIVO; só as que cabem antes da música acabar
    const meio = P.noMeio
      .map(([nome, t]) => ({ nome, t, fim: t + v[nome].duration }))
      .filter(m => m.t > tMus && m.fim < fimMusica);

    // volume da música ponto a ponto (vale o MENOR pedido de cada momento)
    const R = P.rampa, D = P.abaixaPara;
    const nivel = t => {
      let x = 1;
      meio.forEach(m => {
        if(t >= m.t - R && t < m.t)              x = Math.min(x, 1 + (D - 1) * (t - (m.t - R)) / R);
        else if(t >= m.t && t <= m.fim)          x = Math.min(x, D);
        else if(t > m.fim && t < m.fim + R)      x = Math.min(x, D + (1 - D) * (t - m.fim) / R);
      });
      if(t >= fimMusica) x = Math.min(x, Math.max(0, 1 - (t - fimMusica) / P.someEm));   // some e fica mudo
      return x;
    };

    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const off = new Off(2, Math.round(taxa * total), taxa);
    const fala = (buf, t) => { const s = off.createBufferSource(); s.buffer = buf; s.connect(off.destination); s.start(t); };
    const fonte = off.createBufferSource();
    fonte.buffer = musica;
    const vol = off.createGain();
    fonte.connect(vol).connect(off.destination);
    const passos = Math.ceil((total - tMus) * 200) + 1, curva = new Float32Array(passos);
    for(let k = 0; k < passos; k++) curva[k] = nivel(tMus + k / 200);
    vol.gain.setValueCurveAtTime(curva, tMus, (passos - 1) / 200);

    fala(v.abertura, P.respiroAntes);
    meio.forEach(m => fala(v[m.nome], m.t));
    fala(v.chamada, tCta);
    fonte.start(tMus, 0);

    const pronto = await off.startRendering();
    let pico = 0;                                  // não deixa estourar
    for(let c = 0; c < 2; c++){ const d = pronto.getChannelData(c); for(let i = 0; i < d.length; i++) pico = Math.max(pico, Math.abs(d[i])); }
    if(pico > 0.98){
      const k = 0.98 / pico;
      for(let c = 0; c < 2; c++){ const d = pronto.getChannelData(c); for(let i = 0; i < d.length; i++) d[i] *= k; }
    }
    return pronto;
  }

  // Devolve a vez pra tela entre um pedaço e outro da conversão. Por
  // MessageChannel, e não por setTimeout: se o atendente for pra aba do
  // WhatsApp no meio, o navegador segura o setTimeout de aba de fundo (até
  // 1 s por vez) e a prévia levaria uns 20 s. Mensagem não é temporizador.
  const cederAVez = (() => {
    if(typeof MessageChannel === 'undefined') return () => new Promise(r => setTimeout(r, 0));
    const canal = new MessageChannel(), fila = [];
    canal.port1.onmessage = () => { const f = fila.shift(); if(f) f(); };
    return () => new Promise(r => { fila.push(r); canal.port2.postMessage(0); });
  })();

  async function paraMp3(buffer, aoAvancar){
    const f16 = f => {
      const o = new Int16Array(f.length);
      for(let i = 0; i < f.length; i++){ const s = Math.max(-1, Math.min(1, f[i])); o[i] = s < 0 ? s * 0x8000 : s * 0x7FFF; }
      return o;
    };
    const esq = f16(buffer.getChannelData(0));
    const dir = buffer.numberOfChannels > 1 ? f16(buffer.getChannelData(1)) : esq;
    const enc = new lamejs.Mp3Encoder(2, buffer.sampleRate, PREVIA.kbps);
    const partes = [], BLOCO = 1152, total = Math.ceil(esq.length / BLOCO);
    for(let i = 0, n = 0; i < esq.length; i += BLOCO, n++){
      const o = enc.encodeBuffer(esq.subarray(i, i + BLOCO), dir.subarray(i, i + BLOCO));
      if(o.length) partes.push(o);
      if(n % 100 === 0){ aoAvancar(n / total); await cederAVez(); }
    }
    const fim = enc.flush();
    if(fim.length) partes.push(fim);
    return new Blob(partes, { type: 'audio/mpeg' });
  }

  // ── o que as telas usam ────────────────────────────────────────────
  // fonte = os bytes da música (ArrayBuffer) ou a promessa deles; o
  // conversor, as vozes e a música chegam em paralelo.
  async function montar(fonte, aoMudar){
    const avisar = t => { try{ if(aoMudar) aoMudar(t); }catch(e){} };
    avisar('Preparando…');
    const [, vozes, bytes] = await Promise.all([carregarLame(), carregarVozes(), Promise.resolve(fonte)]);
    avisar('Montando…');
    let musica;
    try{ musica = await decodificar(bytes); }
    catch(e){ throw new Error('não consegui ler esse arquivo de áudio — use MP3, WAV ou M4A'); }
    const pronto = await mixar(musica, vozes);
    return paraMp3(pronto, f => avisar('Montando ' + Math.round(f * 100) + '%'));
  }

  // "Pizzaria do João.mp3" -> "Pizzaria-do-Joao"
  function nomeBase(titulo){
    return String(titulo || 'musica')
      .replace(/\.(mp3|wav|m4a|mp4|ogg|aac|flac|webm)$/i, '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'musica';
  }

  // salva no computador e devolve o nome do arquivo
  function baixar(blob, titulo){
    const nome = nomeBase(titulo) + '-PREVIA.mp3';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return nome;
  }

  window.PreviaLux = { montar, baixar, nomeBase, PREVIA };
})();
