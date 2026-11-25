(() => {
  const raiz = document.documentElement;
  const animacaoAtiva = matchMedia("(any-pointer: fine) and (prefers-reduced-motion: no-preference)");
  const rastro = document.createElement("canvas");
  rastro.className = "rastro-cursor";
  rastro.setAttribute("aria-hidden", "true");
  const desenho = rastro.getContext("2d");
  if (desenho) document.body.append(rastro);
  // Um único carregamento para os oito desenhos do atlas (1774 × 887).
  const arteFumaca = document.createElement("img");
  arteFumaca.src = "assets/cursores/ideon-vento-e-fumaca.png";

  const modoSelecao = matchMedia("(any-pointer: fine) and (forced-colors: none)");
  const selecao = document.createElement("canvas");
  selecao.className = "rastro-cursor maos-da-selecao";
  selecao.setAttribute("aria-hidden", "true");
  selecao.hidden = true;
  const desenhoSelecao = selecao.getContext("2d");
  const luva = document.createElement("img");
  luva.src = "cursor-ideon-mao-selecao.svg";
  document.body.append(selecao);
  let quadroSelecao;

  function medirCampo(campo) {
    const inicio = campo.selectionStart;
    const fim = campo.selectionEnd;
    if (inicio == null || inicio === fim || campo.type === "password") return [];

    // O texto de um campo nativo não tem nós DOM que um Range possa medir.
    const estilo = getComputedStyle(campo);
    const caixa = campo.getBoundingClientRect();
    const espelho = document.createElement("div");
    const multilinha = campo.tagName === "TEXTAREA";
    Object.assign(espelho.style, {
      position: "fixed", visibility: "hidden", pointerEvents: "none",
      boxSizing: "border-box", width: `${campo.clientWidth}px`,
      left: `${caixa.left + campo.clientLeft - campo.scrollLeft}px`,
      top: `${caixa.top + campo.clientTop - campo.scrollTop}px`,
      whiteSpace: multilinha && campo.wrap !== "off" ? "pre-wrap" : "pre",
      overflowWrap: "break-word",
    });
    for (const propriedade of [
      "fontFamily", "fontSize", "fontStyle", "fontWeight", "fontStretch", "fontVariant",
      "lineHeight", "letterSpacing", "wordSpacing", "padding", "textAlign", "direction",
      "textIndent", "textTransform", "tabSize",
    ]) espelho.style[propriedade] = estilo[propriedade];

    espelho.textContent = campo.value;
    document.body.append(espelho);
    const trecho = document.createRange();
    trecho.setStart(espelho.firstChild, inicio);
    trecho.setEnd(espelho.firstChild, fim);
    const retangulos = [...trecho.getClientRects()];
    espelho.remove();
    return retangulos;
  }

  function atualizarSelecao() {
    quadroSelecao = undefined;
    selecao.hidden = true;
    if (!modoSelecao.matches || !document.hasFocus() || !luva.naturalWidth || !desenhoSelecao) return;

    const campo = document.activeElement;
    const texto = window.getSelection();
    const retangulos = campo?.matches("textarea, input")
      ? medirCampo(campo)
      : texto?.rangeCount && !texto.isCollapsed ? [...texto.getRangeAt(0).getClientRects()] : [];
    const linhas = retangulos.filter(({ width, height }) => width > 0 && height > 0);
    if (!linhas.length) return;

    const escala = Math.min(devicePixelRatio || 1, 2);
    const largura = Math.round(innerWidth * escala);
    const altura = Math.round(innerHeight * escala);
    if (selecao.width !== largura || selecao.height !== altura) {
      selecao.width = largura;
      selecao.height = altura;
    }
    desenhoSelecao.setTransform(escala, 0, 0, escala, 0, 0);
    desenhoSelecao.clearRect(0, 0, innerWidth, innerHeight);
    // As extremidades reais ficam fora das letras, inclusive na seleção inversa.
    const tamanho = 24;
    const margem = 3;
    const primeira = linhas[0];
    const ultima = linhas.at(-1);
    const y = (linha) => (linha.top + linha.bottom - tamanho) / 2;
    const limite = campo?.matches("textarea, input") ? campo.getBoundingClientRect()
      : { left: 0, right: innerWidth, top: 0, bottom: innerHeight };
    const visivel = (x, linha) => x >= Math.max(0, limite.left) &&
      x <= Math.min(innerWidth, limite.right) && linha.bottom > Math.max(0, limite.top) &&
      linha.top < Math.min(innerHeight, limite.bottom);
    if (visivel(primeira.left, primeira)) {
      desenhoSelecao.drawImage(luva, primeira.left - tamanho - margem, y(primeira), tamanho, tamanho);
    }
    if (visivel(ultima.right, ultima)) {
      desenhoSelecao.setTransform(-escala, 0, 0, escala,
        (ultima.right + margem + tamanho) * escala, y(ultima) * escala);
      desenhoSelecao.drawImage(luva, 0, 0, tamanho, tamanho);
    }
    const destino = document.querySelector("dialog[open]") || document.body;
    if (selecao.parentElement !== destino) destino.append(selecao);
    selecao.hidden = false;
  }

  function agendarSelecao() {
    if (quadroSelecao === undefined) quadroSelecao = requestAnimationFrame(atualizarSelecao);
  }

  for (const tipo of ["selectionchange", "select", "input", "focusin", "focusout"]) {
    document.addEventListener(tipo, agendarSelecao);
  }
  for (const tipo of ["scroll", "resize", "focus", "blur"]) {
    window.addEventListener(tipo, (evento) => {
      agendarSelecao();
      if (tipo === "scroll") registrarRolagem(evento);
    }, { capture: true, passive: true });
  }
  luva.addEventListener("load", agendarSelecao);
  modoSelecao.addEventListener("change", agendarSelecao);

  let anterior;
  let movimentoRapido;
  let fumaca;
  let rolagem;
  let pressionado;
  let quadro;
  let ultimaEmissao = -Infinity;
  let ultimaForma = 1;
  const ventos = [];
  const posicoesRolagem = new WeakMap();
  const velocidadeVento = 1.05;
  const velocidadeParada = 1.65;
  const esperaParada = 60;
  const duracaoVento = 230;
  const duracaoFumaca = 480;
  // Atlas 1774 × 887: margens transparentes separam todos os oito desenhos.
  const recortes = [
    [150, 180, 160, 100], [520, 180, 300, 100],
    [980, 165, 265, 120], [1410, 145, 290, 155],
    [30, 510, 400, 330], [510, 505, 310, 335],
    [930, 475, 325, 385], [1400, 565, 295, 220],
  ];
  const arteRolagem = document.createElement("img");
  let spriteRolagem;
  arteRolagem.addEventListener("load", () => {
    // O PNG fornecido tem um quadriculado opaco. Remover apenas o fundo
    // conectado às bordas preserva o branco dentro do contorno fechado da luva.
    const recorte = document.createElement("canvas");
    recorte.width = arteRolagem.naturalWidth;
    recorte.height = arteRolagem.naturalHeight;
    const contexto = recorte.getContext("2d", { willReadFrequently: true });
    if (!contexto) return;
    contexto.drawImage(arteRolagem, 0, 0);
    const pixels = contexto.getImageData(0, 0, recorte.width, recorte.height);
    const { data } = pixels;
    const largura = recorte.width, altura = recorte.height;
    const visitados = new Uint8Array(largura * altura);
    const fila = new Uint32Array(visitados.length);
    let leitura = 0, escrita = 0;
    function incluir(i) {
      if (visitados[i]) return;
      visitados[i] = 1;
      const p = i * 4;
      const minimo = Math.min(data[p], data[p + 1], data[p + 2]);
      const maximo = Math.max(data[p], data[p + 1], data[p + 2]);
      if (data[p + 3] === 0 || (minimo > 180 && maximo - minimo < 35)) {
        data[p + 3] = 0;
        fila[escrita++] = i;
      }
    }
    for (let x = 0; x < largura; x++) { incluir(x); incluir((altura - 1) * largura + x); }
    for (let y = 0; y < altura; y++) { incluir(y * largura); incluir(y * largura + largura - 1); }
    while (leitura < escrita) {
      const i = fila[leitura++], x = i % largura;
      if (x) incluir(i - 1);
      if (x < largura - 1) incluir(i + 1);
      if (i >= largura) incluir(i - largura);
      if (i < largura * (altura - 1)) incluir(i + largura);
    }
    contexto.putImageData(pixels, 0, 0);
    spriteRolagem = recorte;
  });
  arteRolagem.src = "assets/cursores/ideon-scroll-dois-dedos.png";

  function suavizar(progresso) {
    const t = Math.max(0, Math.min(1, progresso));
    return t * t * (3 - 2 * t);
  }

  function agendarEfeitos() {
    if (quadro === undefined) quadro = requestAnimationFrame(pintar);
  }

  function limparRastro() {
    anterior = movimentoRapido = fumaca = rolagem = undefined;
    ventos.length = 0;
    ultimaEmissao = -Infinity;
    cancelAnimationFrame(quadro);
    quadro = undefined;
    desenho?.clearRect(0, 0, rastro.width, rastro.height);
  }

  function desenharArte(indice, x, y, angulo, largura, opacidade, distancia) {
    const [sx, sy, sw, sh] = recortes[indice];
    const altura = largura * sh / sw;
    const escalaX = arteFumaca.naturalWidth / 1774;
    const escalaY = arteFumaca.naturalHeight / 887;
    desenho.save();
    desenho.translate(x, y);
    desenho.rotate(angulo);
    desenho.globalAlpha = opacidade;
    desenho.drawImage(arteFumaca, sx * escalaX, sy * escalaY, sw * escalaX, sh * escalaY,
      -distancia - largura, -altura / 2, largura, altura);
    desenho.restore();
  }

  function frear(agora) {
    if (!movimentoRapido?.armado) return;
    movimentoRapido.armado = false;
    if (movimentoRapido.velocidade < velocidadeParada) return;
    ultimaForma = 1 - ultimaForma;
    fumaca = {
      x: anterior.x, y: anterior.y, inicio: agora,
      angulo: Math.atan2(movimentoRapido.uy, movimentoRapido.ux),
      inicial: 4 + ultimaForma, final: 6 + ultimaForma,
    };
  }

  function pintarRolagem(agora) {
    if (!rolagem) return;
    const repouso = Math.max(0, agora - rolagem.ultimo - 110);
    if (repouso >= 220) { rolagem = undefined; return; }
    const ativo = repouso === 0;
    const idade = agora - rolagem.inicio;
    const pose = ativo && idade >= 55 ? 1 : idade < 55 ? 0 : 2;
    const opacidade = 0.88 * suavizar(idade / 65) * (1 - suavizar(repouso / 220));
    const deslocamento = rolagem.direcao * 10 * suavizar(idade / 140) * (1 - suavizar(repouso / 220));
    const larguraCelula = spriteRolagem.width / 3;
    const altura = 54, largura = altura * larguraCelula / spriteRolagem.height;
    const x = Math.max(4, Math.min(innerWidth - largura - 4, (anterior?.x ?? innerWidth - 62) + 20));
    const y = Math.max(14, Math.min(innerHeight - altura - 14, (anterior?.y ?? innerHeight / 2) - altura / 2));
    desenho.save();
    desenho.globalAlpha = opacidade;
    desenho.drawImage(spriteRolagem, pose * larguraCelula, 0, larguraCelula, spriteRolagem.height,
      x, y + deslocamento, largura, altura);
    desenho.restore();
  }

  function registrarRolagem(evento, somenteRegistrar = false) {
    const alvo = evento.target === document ? document.scrollingElement : evento.target;
    if (!alvo || typeof alvo.scrollTop !== "number") return;
    const atual = alvo.scrollTop;
    const anteriorScroll = posicoesRolagem.get(alvo);
    posicoesRolagem.set(alvo, atual);
    if (somenteRegistrar || anteriorScroll === undefined || atual === anteriorScroll ||
        !desenho || !spriteRolagem || !animacaoAtiva.matches) return;
    const agora = performance.now();
    const direcao = Math.sign(atual - anteriorScroll);
    if (!rolagem || agora - rolagem.ultimo > 330) rolagem = { inicio: agora };
    Object.assign(rolagem, { ultimo: agora, direcao });
    agendarEfeitos();
  }
  // Compartilha o listener de scroll da seleção, inclusive nos painéis internos.
  registrarRolagem({ target: document }, true);
  document.querySelectorAll("*").forEach((alvo) => {
    registrarRolagem({ target: alvo }, true);
  });

  function pintar(agora) {
    quadro = undefined;
    const escala = Math.min(devicePixelRatio || 1, 2);
    const pixelsX = Math.round(innerWidth * escala), pixelsY = Math.round(innerHeight * escala);
    if (rastro.width !== pixelsX || rastro.height !== pixelsY) { rastro.width = pixelsX; rastro.height = pixelsY; }
    desenho.setTransform(escala, 0, 0, escala, 0, 0);
    desenho.clearRect(0, 0, innerWidth, innerHeight);
    if (movimentoRapido?.armado && agora - movimentoRapido.tempo >= esperaParada) frear(movimentoRapido.tempo + esperaParada);
    for (let i = ventos.length - 1; i >= 0; i--) {
      const vento = ventos[i], idade = agora - vento.inicio;
      if (idade >= duracaoVento) { ventos.splice(i, 1); continue; }
      const progresso = idade / duracaoVento;
      const opacidade = 0.68 * suavizar(idade / 30) * (1 - suavizar(progresso));
      const angulo = Math.atan2(movimentoRapido.uy, movimentoRapido.ux);
      desenharArte(vento.forma, anterior.x, anterior.y, angulo, vento.largura, opacidade, 18 + progresso * 9);
    }
    if (fumaca) {
      const idade = agora - fumaca.inicio;
      if (idade >= duracaoFumaca) fumaca = undefined;
      else {
        const progresso = Math.max(0, idade / duracaoFumaca);
        const transicao = suavizar((progresso - 0.25) / 0.45);
        const opacidade = 0.82 * suavizar(idade / 45) * (1 - suavizar(progresso));
        const largura = 40 + 16 * suavizar(progresso), distancia = 18 + 5 * progresso;
        desenharArte(fumaca.inicial, fumaca.x, fumaca.y, fumaca.angulo, largura, opacidade * (1 - transicao), distancia);
        desenharArte(fumaca.final, fumaca.x, fumaca.y, fumaca.angulo, largura, opacidade * transicao, distancia);
      }
    }
    if (spriteRolagem) pintarRolagem(agora);
    if (ventos.length || fumaca || rolagem || movimentoRapido?.armado) agendarEfeitos();
  }

  function registrarMovimento(evento) {
    if (pressionado?.arrastavel && evento.pointerId === pressionado.id &&
        Math.hypot(evento.clientX - pressionado.x, evento.clientY - pressionado.y) >= 6) {
      raiz.classList.add("cursor-arrastando");
      raiz.classList.remove("cursor-pressionado");
    }
    if (!desenho || !animacaoAtiva.matches || evento.pointerType !== "mouse") return;
    const ponto = { x: evento.clientX, y: evento.clientY, tempo: performance.now() };
    const ultimo = anterior;
    anterior = ponto;
    if (!ultimo || !arteFumaca.naturalWidth) return;
    const intervalo = ponto.tempo - ultimo.tempo;
    if (intervalo > 90) { if (movimentoRapido) movimentoRapido.armado = false; return; }
    const dx = ponto.x - ultimo.x, dy = ponto.y - ultimo.y;
    const distancia = Math.hypot(dx, dy);
    const velocidade = distancia / Math.max(intervalo, 4);
    if (velocidade < velocidadeVento) {
      if (movimentoRapido?.armado) {
        if (velocidade <= 0.42 && ponto.tempo - movimentoRapido.tempo <= esperaParada) frear(ponto.tempo);
        else movimentoRapido.armado = false;
      }
      return;
    }
    movimentoRapido = { ...ponto, ux: dx / distancia, uy: dy / distancia, velocidade, armado: true };
    if (ponto.tempo - ultimaEmissao >= 75) {
      ultimaEmissao = ponto.tempo;
      ventos.push({ inicio: ponto.tempo, forma: Math.floor(Math.random() * 4), largura: 30 + Math.random() * 8 });
      if (ventos.length > 4) ventos.shift();
    }
    agendarEfeitos();
  }

  window.addEventListener("pointermove", registrarMovimento, { passive: true });
  window.addEventListener("pointerdown", (evento) => {
    if (evento.pointerType !== "mouse" || evento.button !== 0) return;
    const cursor = getComputedStyle(evento.target).cursor;
    if (cursor === "text" || cursor.endsWith(", text")) {
      raiz.classList.add("cursor-selecionando");
      return;
    }
    if (!evento.target.closest("input, textarea, [contenteditable]")) {
      pressionado = { id: evento.pointerId, x: evento.clientX, y: evento.clientY,
        arrastavel: !!evento.target.closest('[draggable="true"], [data-atalho]') };
      raiz.classList.add("cursor-pressionado");
    }
  });
  function soltar() {
    pressionado = undefined;
    raiz.classList.remove("cursor-pressionado", "cursor-arrastando", "cursor-selecionando");
  }
  for (const tipo of ["pointerup", "pointercancel", "lostpointercapture", "dragend", "drop", "blur"]) {
    window.addEventListener(tipo, soltar);
  }
  window.addEventListener("dragstart", (evento) => {
    if (pressionado?.arrastavel || evento.target.closest('[draggable="true"]')) {
      raiz.classList.add("cursor-arrastando");
      raiz.classList.remove("cursor-pressionado");
    }
  });
  window.addEventListener("keydown", (evento) => {
    if (evento.key === "Escape") soltar();
  });
  raiz.addEventListener("pointerleave", () => {
    limparRastro();
    soltar();
  });
  animacaoAtiva.addEventListener("change", limparRastro);
  window.addEventListener("blur", limparRastro);
})();
