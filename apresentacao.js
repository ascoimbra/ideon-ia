// Mantém links antigos de conversas na mesma origem e no aplicativo.
if (/^#(?:chat=|modo=|projeto=|inicio(?:$|&))/.test(location.hash)) {
  location.replace("/app" + location.hash);
}
const exemplos = {
  chat: ["O que vamos descobrir hoje?", "Um lugar para perguntar, aprender e dar espaço à curiosidade.", "Me ajude a transformar uma ideia em um começo.", "Chat · Médio", ["Escrever", "Aprender", "Explorar ideias"]],
  work: ["Vamos colocar suas ideias em prática.", "Um objetivo claro. Um plano possível. Seu próximo passo.", "Organize um plano para tirar meu projeto do papel.", "Work · Phos", ["Planejar", "Organizar", "Desenvolver um texto"]],
  code: ["Uma ideia. Muitas possibilidades de criar.", "Um espaço para desenvolver, entender e melhorar seu código.", "Me ajude a entender este código e encontrar uma solução.", "ideon Code · Phos", ["Criar", "Entender código", "Resolver um erro"]],
};
const abas = [...document.querySelectorAll('.abas [role="tab"]')];
function mostrar(aba) {
  const [titulo, descricao, prompt, contexto, sugestoes] = exemplos[aba.dataset.modo];
  abas.forEach((item) => { const ativo = item === aba; item.setAttribute("aria-selected", String(ativo)); item.tabIndex = ativo ? 0 : -1; });
  document.getElementById("previa").setAttribute("aria-labelledby", aba.id);
  document.getElementById("previa-titulo").textContent = titulo;
  document.getElementById("previa-descricao").textContent = descricao;
  document.getElementById("previa-prompt").textContent = prompt;
  document.getElementById("previa-contexto").textContent = contexto;
  document.getElementById("previa-sugestoes").replaceChildren(...sugestoes.map((texto) => { const span = document.createElement("span"); span.textContent = texto; return span; }));
  renderizarDemonstracao(aba.dataset.modo);
}
abas.forEach((aba, indice) => {
  aba.addEventListener("click", () => mostrar(aba));
  aba.addEventListener("keydown", (evento) => {
    let proxima;
    if (evento.key === "ArrowRight") proxima = abas[(indice + 1) % abas.length];
    if (evento.key === "ArrowLeft") proxima = abas[(indice + abas.length - 1) % abas.length];
    if (evento.key === "Home") proxima = abas[0];
    if (evento.key === "End") proxima = abas.at(-1);
    if (proxima) { evento.preventDefault(); mostrar(proxima); proxima.focus(); }
  });
});

// Exemplos locais: a apresentação não envia perguntas nem altera conversas.
const respostasDemonstracao = {
  chat: ["Comece pelo que desperta sua curiosidade.", "Dê um nome à ideia e encontre uma primeira pergunta.", "Vamos desenvolver esse começo juntos."],
  work: ["Defina o objetivo: o que você quer criar?", "Organize as etapas: pesquisar, esboçar e experimentar.", "Escolha uma tarefa pequena para começar hoje."],
  code: ['const ideia = "Um novo começo";', 'function criar(mensagem) { return mensagem.trim(); }', 'console.log(criar(ideia));'],
};
function renderizarDemonstracao(modo) {
  const destino = document.getElementById("resposta-demo-conteudo");
  destino.replaceChildren(...respostasDemonstracao[modo].map((texto, indice) => {
    const linha = document.createElement("p");
    linha.style.setProperty("--atraso", (200 + indice * 550) + "ms");
    if (modo === "code") {
      const codigo = document.createElement("code");
      codigo.textContent = texto;
      linha.append(codigo);
    } else linha.textContent = texto;
    return linha;
  }));
  document.getElementById("resposta-demo").classList.add("animar-demo");
}

const movimentoReduzido = matchMedia("(prefers-reduced-motion: reduce)");
const botaoMovimento = document.getElementById("alternar-movimento");
const repetir = document.getElementById("repetir-demo");
let pausado = false;
function atualizarMovimento() {
  document.body.classList.toggle("movimento-ativo", !movimentoReduzido.matches);
  document.body.classList.toggle("movimento-pausado", pausado);
  botaoMovimento.textContent = pausado ? "Retomar animações" : "Pausar animações";
  botaoMovimento.setAttribute("aria-pressed", String(pausado));
  repetir.disabled = pausado || movimentoReduzido.matches;
}
botaoMovimento.hidden = false;
repetir.hidden = false;
botaoMovimento.addEventListener("click", () => { pausado = !pausado; atualizarMovimento(); });
movimentoReduzido.addEventListener("change", atualizarMovimento);
repetir.addEventListener("click", () => {
  const selecionada = abas.find((aba) => aba.getAttribute("aria-selected") === "true");
  renderizarDemonstracao(selecionada.dataset.modo);
});

// Os elementos só são ocultados quando o observador está disponível.
if ("IntersectionObserver" in window) {
  const observador = new IntersectionObserver((entradas) => {
    for (const entrada of entradas) {
      if (!entrada.isIntersecting) continue;
      entrada.target.classList.add("visivel");
      if (entrada.target.classList.contains("vitrine")) {
        const selecionada = abas.find((aba) => aba.getAttribute("aria-selected") === "true");
        renderizarDemonstracao(selecionada.dataset.modo);
      }
      observador.unobserve(entrada.target);
    }
  // Seções altas também precisam aparecer em telas pequenas ou com zoom.
  }, { threshold: 0 });
  document.querySelectorAll(".vitrine, .abertura, .modos article, .detalhes, .catalogo-modelos, .como > div:first-child, .fluxo > div, .sobre > *").forEach((elemento) => {
    elemento.classList.add("revelar");
    if (elemento.matches(".modos article")) {
      elemento.style.setProperty("--atraso", [...elemento.parentElement.children].indexOf(elemento) * 100 + "ms");
    }
    observador.observe(elemento);
  });
}
document.addEventListener("visibilitychange", () => {
  document.body.classList.toggle("pagina-inativa", document.hidden);
});
atualizarMovimento();
renderizarDemonstracao("chat");

// Cada seção da apresentação ocupa sua própria aba, com links compartilháveis.
const navegacao = document.querySelector(".navegacao-abas");
const abasApresentacao = [...navegacao.querySelectorAll("a")];
const paginas = [...document.querySelectorAll("[data-pagina]")];
navegacao.setAttribute("role", "tablist");
abasApresentacao.forEach((aba) => {
  aba.setAttribute("role", "tab");
  aba.setAttribute("aria-controls", aba.hash.slice(1));
  const pagina = document.getElementById(aba.hash.slice(1));
  pagina.setAttribute("role", "tabpanel");
  pagina.setAttribute("aria-labelledby", aba.id);
  pagina.tabIndex = 0;
});

function mostrarPagina(hash, atualizarEndereco = false) {
  const atual = paginas.find((pagina) => "#" + pagina.id === hash) || paginas[0];
  paginas.forEach((pagina) => { pagina.hidden = pagina !== atual; });
  abasApresentacao.forEach((aba) => {
    const ativa = aba.hash === "#" + atual.id;
    aba.setAttribute("aria-selected", String(ativa));
    aba.tabIndex = ativa ? 0 : -1;
  });
  if (atualizarEndereco && location.hash !== "#" + atual.id) {
    history.pushState(null, "", "#" + atual.id);
  }
  window.scrollTo({ top: 0, behavior: "instant" });
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  const hash = link.getAttribute("href");
  if (hash !== "#" && !paginas.some((pagina) => hash === "#" + pagina.id)) return;
  link.addEventListener("click", (evento) => {
    if (evento.button !== 0 || evento.ctrlKey || evento.metaKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    mostrarPagina(hash, true);
    // O link de recursos fica dentro de um painel que acabou de ser ocultado.
    if (link.closest("[data-pagina]")) {
      paginas.find((pagina) => !pagina.hidden).focus({ preventScroll: true });
    }
  });
});
abasApresentacao.forEach((aba, indice) => {
  aba.addEventListener("keydown", (evento) => {
    let proxima;
    if (evento.key === "ArrowRight") proxima = abasApresentacao[(indice + 1) % abasApresentacao.length];
    if (evento.key === "ArrowLeft") proxima = abasApresentacao[(indice + abasApresentacao.length - 1) % abasApresentacao.length];
    if (evento.key === "Home") proxima = abasApresentacao[0];
    if (evento.key === "End") proxima = abasApresentacao.at(-1);
    if (proxima) {
      evento.preventDefault();
      mostrarPagina(proxima.hash, true);
      proxima.focus({ preventScroll: true });
    }
    if (evento.key === " ") { evento.preventDefault(); aba.click(); }
  });
});
window.addEventListener("popstate", () => mostrarPagina(location.hash));
window.addEventListener("hashchange", () => {
  if (!/^#(?:chat=|modo=|projeto=|inicio(?:$|&))/.test(location.hash)) mostrarPagina(location.hash);
});
mostrarPagina(location.hash);
