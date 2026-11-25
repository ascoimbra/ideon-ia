const porId = (id) => document.getElementById(id);
const chave = "ideon-chats-v1";
let verificacaoServidor;
async function verificarServidor() {
  if (verificacaoServidor) return verificacaoServidor;
  verificacaoServidor = (async () => {
    try {
      if (!["http:", "https:"].includes(location.protocol)) throw new Error("arquivo");
      const resposta = await fetch("/api/saude", { signal: AbortSignal.timeout(4000), cache: "no-store" });
      if (!resposta.ok || (await resposta.json()).aplicacao !== "ideon") throw new Error("previa");
      porId("conexao-servidor").hidden = true;
      return true;
    } catch {
      porId("mensagem-conexao").textContent = "Esta tela está sem conexão com o servidor do ideon. Execute npm.cmd start no terminal da pasta do projeto e abra o endereço local abaixo. Sua mensagem será mantida aqui.";
      porId("conexao-servidor").hidden = false;
      return false;
    }
  })();
  try { return await verificacaoServidor; }
  finally { verificacaoServidor = undefined; }
}

function lerDados() {
  try {
    return JSON.parse(localStorage.getItem(chave));
  } catch {
    return null;
  }
}

const dadosLidos = lerDados();
const dados = dadosLidos && typeof dadosLidos === "object" && !Array.isArray(dadosLidos) ? dadosLidos : {};
if (!Array.isArray(dados.chats)) dados.chats = [];
if (!Array.isArray(dados.projetos)) dados.projetos = [];
const atalhos = porId("atalhos");
const navegacao = atalhos.closest("nav");
const opcoes = porId("opcoes");
const submenu = porId("opcoes-copiar");
const botaoCopiar = opcoes.querySelector('[data-acao="copiar"]');
const dialogo = porId("editar-texto");
const dialogoExclusao = porId("confirmar-exclusao");
const campoTexto = porId("novo-texto");
const campoMensagem = porId("mensagem");
const modos = document.querySelector(".modos");
const escolherEspaco = porId("escolher-espaco");
const espacosIdeon = porId("espacos-ideon");
const modeloWork = porId("modelo-work");
const esforcoWork = porId("esforco-work");
const painelWork = porId("painel-work");
const resumoWork = porId("resumo-work");
const niveis = [
  ["Pouco", "Resposta curta e direta, com prioridade para a rapidez."],
  ["Médio", "Equilíbrio entre tempo e detalhe."],
  ["Alto", "Mais análise e espaço para explicações."],
  ["Extra alto", "Mais tempo para comparar opções e revisar a resposta."],
  ["Ultra", "Maior limite de análise e espaço para uma resposta detalhada."],
];
const apresentacao = {
  chat: ["Como posso ajudar?", "Escreva uma mensagem", "Novo Chat"],
  work: ["Organize seu próximo trabalho", "Descreva o trabalho que você quer fazer", "Novo trabalho"],
  code: ["O que você quer programar?", "Descreva o problema ou cole um trecho de código", "Novo chat de código"],
};
const geracoes = new Map();
const controlesGeracao = new Map();
let voz;
let anexos = [];
let versaoAnexos = 0;
let lendoAnexos = false;
const errosIa = new Map();
let modo = "chat";
let chatAtivo;
let projetoAtivo;
let chatDoMenu;
let botaoDoMenu;
let arrastado;
let tempoAviso;
let tempoSaudacao;
let chatParaExcluir;

function saudacaoLocal(data = new Date(), nome = dados.perfil?.primeiroNome ?? dados.perfil?.nome) {
  const hora = data.getHours();
  const frase = hora < 4 ? "Ainda acordado por aí?"
    : hora < 6 ? "Já de pé a essa hora?"
    : hora < 10 ? "Bom dia!"
    : hora < 12 ? "Como vai a manhã?"
    : hora < 18 ? "Boa tarde!" : "Boa noite!";
  const primeiroNome = typeof nome === "string" ? nome.trim().split(/\s+/)[0] : "";
  return primeiroNome && frase.endsWith("!") ? frase.slice(0, -1) + ", " + primeiroNome + "!" : frase;
}

function atualizarSaudacao() {
  clearTimeout(tempoSaudacao);
  if (!porId("conversa").classList.contains("boas-vindas-chat")) return;
  porId("titulo-chat").textContent = saudacaoLocal();
  const agora = new Date();
  const proximaHora = new Date(agora);
  proximaHora.setHours(agora.getHours() + 1, 0, 0, 0);
  tempoSaudacao = setTimeout(atualizarSaudacao, proximaHora - agora + 50);
}

function abrirInicio() {
  modo = "chat";
  selecionar();
}

function confirmarExclusao(chat) {
  chatParaExcluir = chat.id;
  porId("nome-conversa-excluir").textContent = chat.titulo;
  dialogoExclusao.returnValue = "";
  dialogoExclusao.showModal();
}

dialogoExclusao.addEventListener("close", () => {
  const id = chatParaExcluir;
  chatParaExcluir = undefined;
  if (dialogoExclusao.returnValue !== "excluir") return;
  const indice = dados.chats.findIndex((chat) => chat.id === id);
  if (indice < 0) return;
  const [chat] = dados.chats.splice(indice, 1);
  if (!salvar()) {
    dados.chats.splice(indice, 0, chat);
    return;
  }
  controlesGeracao.get(id)?.abort();
  controlesGeracao.delete(id);
  geracoes.delete(id);
  errosIa.delete(id);
  if (chatAtivo === id) {
    abrirInicio();
    campoMensagem.focus();
  } else renderizar();
  avisar("Conversa excluída.");
});

function avisar(texto) {
  const aviso = porId("aviso");
  aviso.textContent = texto;
  clearTimeout(tempoAviso);
  tempoAviso = setTimeout(() => { aviso.textContent = ""; }, 3200);
}

function salvar() {
  try {
    localStorage.setItem(chave, JSON.stringify(dados));
    return true;
  } catch {
    avisar("O navegador não conseguiu salvar as alterações.");
    return false;
  }
}

function definirRota(rota) {
  const url = new URL(location.href);
  url.hash = rota;
  history.replaceState(null, "", url);
}

function selecionar(chat, projeto) {
  cancelarVoz();
  limparAnexos();
  chatAtivo = chat?.id;
  projetoAtivo = chat?.projeto ?? projeto?.id;
  if (chat) modo = Object.hasOwn(apresentacao, chat.modo) ? chat.modo : "chat";
  if (chat?.naoLido) {
    chat.naoLido = false;
    salvar();
  }
  const rota = new URLSearchParams();
  if (chat) rota.set("chat", chat.id);
  else {
    if (projeto) rota.set("projeto", projeto.id);
    if (modo !== "chat") rota.set("modo", modo);
  }
  definirRota(rota.toString() || "inicio");
  campoMensagem.value = "";
  renderizar();
}

function lerRota() {
  const rota = new URLSearchParams(location.hash.slice(1));
  const id = rota.get("chat");
  const chat = dados.chats.find((item) => item.id === id && !item.arquivado);
  const projeto = dados.projetos.find((item) => item.id === rota.get("projeto"));
  const modoDaRota = rota.get("modo");
  if (!chat) modo = Object.hasOwn(apresentacao, modoDaRota) ? modoDaRota : "chat";
  selecionar(chat, projeto);
  if (id && !chat) avisar("Este chat não está disponível neste navegador.");
}

function novoChat(abrir = true) {
  const chat = {
    id: crypto.randomUUID(),
    titulo: apresentacao[modo][2],
    modo,
    projeto: projetoAtivo,
    mensagens: [],
    momento: Date.now(),
  };
  dados.chats.push(chat);
  if (abrir) {
    salvar();
    selecionar(chat);
    campoMensagem.focus();
  }
  return chat;
}

function botao(texto, classe) {
  const elemento = document.createElement("button");
  elemento.type = "button";
  elemento.className = classe;
  elemento.textContent = texto;
  return elemento;
}

function botaoDeAcao(icone, rotulo) {
  const elemento = botao(icone, "acao-icone");
  elemento.setAttribute("aria-label", rotulo);
  elemento.title = rotulo;
  return elemento;
}

function linhaDeChat(chat) {
  const linha = document.createElement("li");
  linha.className = "linha-chat";
  linha.classList.toggle("ativo", chatAtivo === chat.id);
  linha.classList.toggle("nao-lido", Boolean(chat.naoLido));

  const abrir = botao(chat.titulo, "abrir-item");
  abrir.dataset.abrirConversa = chat.id;
  abrir.title = chat.titulo;
  if (chatAtivo === chat.id) abrir.setAttribute("aria-current", "page");
  if (chat.naoLido) abrir.setAttribute("aria-label", chat.titulo + " (não lido)");
  abrir.addEventListener("click", () => selecionar(chat));

  const acoes = document.createElement("div");
  acoes.className = "acoes-chat";
  const fixar = botaoDeAcao("📌\uFE0E", chat.fixado ? "Desafixar" : "Fixar");
  fixar.setAttribute("aria-pressed", String(Boolean(chat.fixado)));
  fixar.addEventListener("click", () => alternarFixacao(chat));
  const mais = botaoDeAcao("⋯", "Mais ações para " + chat.titulo);
  mais.setAttribute("aria-controls", "opcoes");
  mais.setAttribute("aria-expanded", "false");
  mais.addEventListener("click", () => abrirOpcoes(chat, mais));
  acoes.append(fixar, mais);
  linha.append(abrir, acoes);
  return linha;
}

function linhaDeProjeto(projeto, chats) {
  const item = document.createElement("li");
  const linha = document.createElement("div");
  linha.className = "linha-chat";
  linha.classList.toggle("ativo", projetoAtivo === projeto.id && !chatAtivo);
  const abrir = botao("▱  " + projeto.nome, "abrir-item");
  abrir.title = projeto.nome;
  abrir.setAttribute("aria-expanded", String(projetoAtivo === projeto.id));
  abrir.addEventListener("click", () => selecionar(undefined, projetoAtivo === projeto.id ? undefined : projeto));
  linha.append(abrir);
  item.append(linha);
  if (projetoAtivo === projeto.id) {
    const lista = document.createElement("ul");
    lista.className = "lista projeto-chats";
    lista.append(...chats.filter((chat) => chat.projeto === projeto.id).map(linhaDeChat));
    item.append(lista);
  }
  return item;
}

function renderizar() {
  const chats = dados.chats.filter((chat) => !chat.arquivado).sort((a, b) => b.momento - a.momento);
  porId("fixados").replaceChildren(...chats.filter((chat) => chat.fixado).map(linhaDeChat));
  porId("projetos").replaceChildren(...dados.projetos.map((projeto) => linhaDeProjeto(projeto, chats)));
  porId("recentes").replaceChildren(...chats.filter((chat) => !chat.fixado).map(linhaDeChat));

  const chat = chats.find((item) => item.id === chatAtivo);
  const projeto = dados.projetos.find((item) => item.id === projetoAtivo);
  const inicio = atalhos.querySelector('[data-atalho="inicio"]');
  if (!chat && !projeto) inicio.setAttribute("aria-current", "page");
  else inicio.removeAttribute("aria-current");

  for (const botao of modos.children) {
    botao.setAttribute("aria-pressed", String(botao.dataset.modo === modo));
  }
  modos.hidden = modo === "code";
  const nomeEspaco = modo === "code" ? "ideon Code" : "ideon IA";
  porId("nome-espaco").textContent = nomeEspaco;
  escolherEspaco.setAttribute("aria-label", "Escolher área: " + nomeEspaco);
  for (const opcao of espacosIdeon.querySelectorAll("[data-espaco]")) {
    opcao.setAttribute("aria-pressed", String(opcao.dataset.espaco === (modo === "code" ? "code" : "ideon")));
  }
  const semMensagens = !chat?.mensagens.length;
  porId("inicio").dataset.modo = modo;
  const identidade = {
    chat: ["Chat", "Um espaço para conversar, explorar ideias e aprender.", "Como posso ajudar você hoje?"],
    work: ["Work", "Transforme suas ideias em planos, textos e próximas etapas.", "O que vamos colocar em prática hoje?"],
    code: ["ideon Code", "Do primeiro rascunho à solução. Vamos construir juntos.", "Descreva o que quer criar ou cole seu código…"],
  };
  porId("identidade-modo").replaceChildren(iconeSugestao(modo === "code" ? "programar" : modo === "work" ? "trabalho" : "conversa"), document.createTextNode(identidade[modo][0]));
  porId("descricao-modo").hidden = !semMensagens;
  porId("descricao-modo").textContent = identidade[modo][1];
  porId("contexto-compositor").hidden = modo === "chat";
  porId("rotulo-compositor").textContent = modo === "code" ? "›_ Prompt" : "Seu briefing";
  porId("dica-compositor").textContent = modo === "code" ? "Código · contexto · resultado esperado" : "Objetivo · contexto · entrega";
  const boasVindas = semMensagens;
  porId("conversa").classList.toggle("conversa-inicial", semMensagens);
  porId("conversa").classList.toggle("boas-vindas-chat", boasVindas);
  porId("simbolo-boas-vindas").hidden = !boasVindas;
  porId("titulo-chat").textContent = chat?.titulo ?? projeto?.nome ?? apresentacao[modo][0];
  campoMensagem.placeholder = boasVindas ? identidade[modo][2] : apresentacao[modo][1];
  const sugestoes = {
    chat: [["Escrever", "Ajude-me a escrever: ", "escrever"], ["Aprender", "Quero aprender sobre: ", "aprender"], ["Programar", "Ajude-me a programar: ", "programar"], ["Vida pessoal", "Ajude-me a organizar minha vida pessoal: ", "vida"]],
    work: [["Escrever", "Escreva um rascunho de: ", "escrever", "Do rascunho à entrega"], ["Resumir", "Resuma o texto em pontos principais:\n\n", "aprender", "Encontre o essencial"], ["Planejar", "Monte um plano com etapas e prioridades para: ", "trabalho", "Defina os próximos passos"], ["Organizar", "Organize estas tarefas por prioridade:\n\n", "tarefas", "Dê ordem às prioridades"]],
    code: [["Criar código", "Crie uma função e inclua exemplos de uso para: ", "programar", "Implemente uma ideia"], ["Entender código", "Explique este código passo a passo:\n\n", "aprender", "Explore a lógica"], ["Corrigir um erro", "Encontre o erro, explique a causa e sugira como testar a correção:\n\n", "corrigir", "Investigue e teste"], ["Planejar a solução", "Ajude-me a planejar a implementação de: ", "tarefas", "Estruture antes de construir"]],
  };
  porId("sugestoes").hidden = !semMensagens;
  porId("sugestoes").replaceChildren(...sugestoes[modo].map(([nome, texto, icone, descricao]) => {
    const sugestao = botao(nome, "sugestao");
    if (descricao) {
      const rotulo = document.createElement("span");
      const titulo = document.createElement("strong"); titulo.textContent = nome;
      const detalhe = document.createElement("small"); detalhe.textContent = descricao;
      rotulo.append(titulo, detalhe); sugestao.replaceChildren(rotulo);
    }
    sugestao.prepend(iconeSugestao(icone));
    sugestao.addEventListener("click", () => { campoMensagem.value = texto; campoMensagem.focus(); });
    return sugestao;
  }));
  atualizarSaudacao();
  porId("configuracao-work").hidden = false;
  atualizarModeloWork();
  porId("mensagens").replaceChildren(...(chat?.mensagens ?? []).map((mensagem) => {
    const item = document.createElement("li");
    if (typeof mensagem === "string") {
      item.textContent = mensagem;
    } else {
      item.className = "resposta-ia";
      const autoria = document.createElement("strong");
      autoria.textContent = mensagem.modelo;
      const conteudo = renderizarResposta(mensagem.conteudo);
      item.append(autoria, conteudo);
      if (mensagem.truncado) {
        const limite = document.createElement("p"); limite.className = "estado-ia";
        limite.textContent = "A resposta atingiu o limite deste esforço. Peça para continuar ou aumente o esforço para ter mais espaço.";
        item.append(limite);
      }
      if (Number.isFinite(mensagem.segundos)) {
        const tempo = document.createElement("small"); tempo.className = "tempo-resposta";
        tempo.textContent = `${mensagem.tag ?? mensagem.modelo} · ${mensagem.segundos}s`;
        item.append(tempo);
      }
    }
    return item;
  }));
  atualizarEstadoIa();
}

function iconeSugestao(tipo) {
  const caminhos = {
    conversa: "M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4ZM8 10h8M8 14h5",
    trabalho: "M8 7V4h8v3M3 7h18v14H3zM3 12q9 5 18 0M12 12v4",
    tarefas: "m3 6 2 2 3-4M11 6h10M3 13l2 2 3-4M11 13h10M4 20h4m3 0h10",
    corrigir: "m8 8 8 8m0-8-8 8M9 3h6l6 6v6l-6 6H9l-6-6V9z",
    escrever: "m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14z",
    aprender: "m2 8 10-5 10 5-10 5zM6 10v7q6 5 12 0v-7M22 8v8",
    programar: "m7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18",
    vida: "M5 8h12v9a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM17 9h2a3 3 0 0 1 0 6h-2M8 2v3m5-3v3",
  };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none"); svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6"); svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round"); svg.setAttribute("aria-hidden", "true");
  const caminho = document.createElementNS("http://www.w3.org/2000/svg", "path");
  caminho.setAttribute("d", caminhos[tipo]); svg.append(caminho); return svg;
}

function atualizarEsforco() {
  const [nome, descricao] = niveis[esforcoWork.valueAsNumber];
  porId("nivel-esforco").textContent = nome;
  porId("descricao-esforco").textContent = descricao;
  esforcoWork.setAttribute("aria-valuetext", nome);
  esforcoWork.style.setProperty("--preenchimento", esforcoWork.valueAsNumber * 25 + "%");
  atualizarModeloWork();
}

function atualizarModeloWork() {
  const chat = modo === "chat";
  const nivel = niveis[esforcoWork.valueAsNumber][0];
  const modelo = modeloWork.selectedOptions[0].textContent;
  porId("resumo-modelo").hidden = chat;
  porId("resumo-modelo").textContent = modelo;
  porId("resumo-nivel").textContent = (chat ? "" : " · ") + nivel;
  painelWork.querySelector(".lista-modelos").hidden = chat;
  porId("titulo-modelo").textContent = chat ? "Ajustar esforço" : "Selecionar modelo";
  resumoWork.classList.toggle("resumo-esforco", modo === "chat");
  resumoWork.setAttribute("aria-label", chat ? "Esforço " + nivel : "Modelo " + modelo + ", esforço " + nivel);
  for (const opcao of painelWork.querySelectorAll("[data-modelo]")) {
    opcao.setAttribute("aria-pressed", String(opcao.dataset.modelo === modeloWork.value));
  }
}

function posicionarPainelWork() {
  const alvo = resumoWork.getBoundingClientRect();
  const largura = painelWork.offsetWidth;
  const altura = painelWork.offsetHeight;
  painelWork.style.left = Math.max(8, Math.min(alvo.right - largura, innerWidth - largura - 8)) + "px";
  const acima = alvo.top - altura - 8;
  painelWork.style.top = Math.max(8, Math.min(acima >= 8 ? acima : alvo.bottom + 8, (window.visualViewport?.height ?? innerHeight) - altura - 8)) + "px";
}

painelWork.addEventListener("beforetoggle", (evento) => {
  resumoWork.setAttribute("aria-expanded", String(evento.newState === "open"));
});
painelWork.addEventListener("toggle", () => {
  if (painelWork.matches(":popover-open")) posicionarPainelWork();
});
painelWork.addEventListener("click", (evento) => {
  const opcao = evento.target.closest("[data-modelo]");
  if (!opcao) return;
  modeloWork.value = opcao.dataset.modelo;
  modeloWork.dispatchEvent(new Event("change"));
});
painelWork.addEventListener("keydown", (evento) => {
  const opcao = evento.target.closest("[data-modelo]");
  if (!opcao || !["ArrowDown", "ArrowUp", "Home", "End"].includes(evento.key)) return;
  evento.preventDefault();
  const opcoes = [...painelWork.querySelectorAll("[data-modelo]")];
  const indice = opcoes.indexOf(opcao);
  const proximo = evento.key === "Home" ? 0 : evento.key === "End" ? opcoes.length - 1
    : (indice + (evento.key === "ArrowDown" ? 1 : -1) + opcoes.length) % opcoes.length;
  opcoes[proximo].focus();
});

function atualizarEstadoIa() {
  const gerando = geracoes.has(chatAtivo);
  const estado = porId("estado-ia");
  const texto = geracoes.get(chatAtivo) ?? errosIa.get(chatAtivo) ?? (location.protocol === "file:"
    ? "Para gerar respostas, execute node servidor.js no terminal e abra http://127.0.0.1:41983."
    : "");
  const enviar = porId("enviar");
  enviar.disabled = false;
  enviar.setAttribute("aria-label", gerando ? "Parar resposta" : "Enviar mensagem");
  enviar.title = gerando ? "Parar resposta" : "Enviar mensagem";
  enviar.querySelector(".seta-enviar").hidden = gerando;
  enviar.querySelector(".quadrado-parar").hidden = !gerando;
  porId("microfone").disabled = gerando;
  estado.textContent = texto;
  estado.hidden = !texto;
}

function alternarFixacao(chat) {
  chat.fixado = !chat.fixado;
  salvar();
  renderizar();
  avisar(chat.fixado ? "Chat fixado." : "Chat desafixado.");
}

function pedirTexto(rotulo, valor, aplicar) {
  porId("rotulo-texto").textContent = rotulo;
  campoTexto.value = valor;
  dialogo.returnValue = "";
  dialogo.addEventListener("close", () => {
    const texto = campoTexto.value.trim();
    if (dialogo.returnValue === "salvar" && texto) aplicar(texto);
  }, { once: true });
  dialogo.showModal();
  campoTexto.select();
}

function abrirOpcoes(chat, gatilho) {
  if (opcoes.matches(":popover-open")) opcoes.hidePopover();
  chatDoMenu = chat;
  botaoDoMenu = gatilho;
  opcoes.querySelector('[data-acao="fixar"]').textContent = chat.fixado ? "Desafixar" : "Fixar";
  opcoes.querySelector('[data-acao="ler"]').textContent = chat.naoLido ? "Marcar como lido" : "Marcar como não lido";
  fecharSubmenu();

  gatilho.setAttribute("aria-expanded", "true");
  gatilho.closest(".linha-chat").classList.add("menu-aberto");
  opcoes.showPopover();
  const alvo = gatilho.getBoundingClientRect();
  opcoes.style.left = Math.max(8, Math.min(alvo.right - opcoes.offsetWidth, innerWidth - opcoes.offsetWidth - 8)) + "px";
  opcoes.style.top = Math.max(8, Math.min(alvo.bottom + 5, (window.visualViewport?.height ?? innerHeight) - opcoes.offsetHeight - 8)) + "px";
  opcoes.querySelector("button").focus();
}

function fecharSubmenu() {
  submenu.hidden = true;
  botaoCopiar.setAttribute("aria-expanded", "false");
}

function abrirSubmenu() {
  const menu = opcoes.getBoundingClientRect();
  const alvo = botaoCopiar.getBoundingClientRect();
  submenu.hidden = false;
  botaoCopiar.setAttribute("aria-expanded", "true");
  const largura = submenu.offsetWidth;
  submenu.style.left = (menu.right + largura + 16 <= innerWidth
    ? menu.right + 4 : Math.max(8, menu.left - largura - 4)) + "px";
  submenu.style.top = Math.max(8, Math.min(alvo.top, (window.visualViewport?.height ?? innerHeight) - submenu.offsetHeight - 8)) + "px";
}

function linkDoChat(chat) {
  const url = new URL(location.href);
  url.hash = "chat=" + chat.id;
  return url.href;
}

function markdownDoChat(chat) {
  return ["# " + chat.titulo, ...chat.mensagens.map((mensagem) => typeof mensagem === "string"
    ? "## Você\n\n" + mensagem
    : "## " + mensagem.modelo + "\n\n" + mensagem.conteudo)].join("\n\n") + "\n";
}

function diretorioLocal() {
  if (location.protocol !== "file:") return "";
  const pasta = new URL(".", location.href);
  const caminho = decodeURIComponent(pasta.pathname);
  if (pasta.hostname || /^\/[A-Za-z]:\//.test(caminho)) {
    return (pasta.hostname ? "//" + pasta.hostname + caminho : caminho.slice(1)).replaceAll("/", "\\");
  }
  return caminho;
}

async function copiar(texto, confirmacao) {
  try {
    await navigator.clipboard.writeText(texto);
    avisar(confirmacao);
  } catch {
    const temporario = document.createElement("textarea");
    temporario.value = texto;
    temporario.className = "visualmente-oculto";
    document.body.append(temporario);
    temporario.select();
    let copiado = false;
    try {
      copiado = document.execCommand("copy");
    } finally {
      temporario.remove();
    }
    avisar(copiado ? confirmacao : "O navegador bloqueou a cópia.");
  }
}

async function compartilhar(chat) {
  const arquivo = new File([markdownDoChat(chat)], "chat-ideon.md", { type: "text/markdown" });
  const dadosDeCompartilhamento = { files: [arquivo], title: chat.titulo };
  try {
    if (navigator.canShare?.(dadosDeCompartilhamento)) {
      await navigator.share(dadosDeCompartilhamento);
      return;
    }
  } catch (erro) {
    if (erro.name === "AbortError") return;
  }
  const link = document.createElement("a");
  link.href = URL.createObjectURL(arquivo);
  link.download = arquivo.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  avisar("Arquivo Markdown preparado para compartilhar.");
}

opcoes.addEventListener("beforetoggle", (evento) => {
  if (evento.newState === "closed") {
    fecharSubmenu();
    botaoDoMenu?.setAttribute("aria-expanded", "false");
    botaoDoMenu?.closest(".linha-chat").classList.remove("menu-aberto");
  }
});

opcoes.addEventListener("click", (evento) => {
  const acao = evento.target.closest("[data-acao]")?.dataset.acao;
  if (!acao || !chatDoMenu) return;
  if (acao === "copiar") {
    if (submenu.hidden) {
      abrirSubmenu();
      submenu.querySelector("button").focus();
    } else fecharSubmenu();
    return;
  }

  const chat = chatDoMenu;
  opcoes.hidePopover();
  switch (acao) {
    case "renomear":
      pedirTexto("Nome do chat", chat.titulo, (titulo) => {
        chat.titulo = titulo;
        chat.renomeado = true;
        salvar();
        renderizar();
      });
      break;
    case "fixar":
      alternarFixacao(chat);
      break;
    case "ler":
      chat.naoLido = !chat.naoLido;
      salvar();
      renderizar();
      break;
    case "compartilhar":
      compartilhar(chat);
      break;
    case "link":
      copiar(linkDoChat(chat), "Link local copiado.");
      break;
    case "markdown":
      copiar(markdownDoChat(chat), "Markdown copiado.");
      break;
    case "diretorio": {
      const projeto = dados.projetos.find((item) => item.id === chat.projeto);
      const dono = projeto ?? chat;
      const pasta = dono.diretorio || diretorioLocal();
      if (pasta) copiar(pasta, "Diretório de trabalho copiado.");
      else pedirTexto("Caminho do diretório de trabalho", "", (diretorio) => {
        dono.diretorio = diretorio;
        salvar();
        copiar(diretorio, "Diretório de trabalho copiado.");
      });
      break;
    }
    case "arquivar":
      chat.arquivado = true;
      salvar();
      if (chatAtivo === chat.id) selecionar(undefined, dados.projetos.find((item) => item.id === chat.projeto));
      else renderizar();
      avisar("Chat arquivado.");
      break;
    case "excluir":
      confirmarExclusao(chat);
      break;
  }
});

opcoes.addEventListener("keydown", (evento) => {
  if (evento.key === "ArrowRight" && evento.target === botaoCopiar) {
    evento.preventDefault();
    abrirSubmenu();
    submenu.querySelector("button").focus();
  }
  if (evento.key === "ArrowLeft" && submenu.contains(evento.target)) {
    evento.preventDefault();
    fecharSubmenu();
    botaoCopiar.focus();
  }
});

function moverAntes(origem, destino) {
  if (!destino || origem === destino || origem.nextElementSibling === destino) return;
  atalhos.insertBefore(origem, destino);
  dados.ordem = [...atalhos.children].map((item) => item.dataset.atalho);
  salvar();
}

for (const nome of dados.ordem ?? []) {
  const item = [...atalhos.children].find((botao) => botao.dataset.atalho === nome);
  if (item) atalhos.append(item);
}

let gestoAtalho;
let cliqueDoArraste;

atalhos.addEventListener("pointerdown", (evento) => {
  const item = evento.target.closest("[data-atalho]");
  if (!item || evento.pointerType !== "mouse" || evento.button !== 0) return;
  gestoAtalho = { item, id: evento.pointerId, x: evento.clientX, y: evento.clientY, arrasteNativo: item.draggable };
  item.draggable = false;
});

window.addEventListener("pointermove", (evento) => {
  const gesto = gestoAtalho;
  if (!gesto || gesto.id !== evento.pointerId) return;
  if (!arrastado) {
    if (Math.hypot(evento.clientX - gesto.x, evento.clientY - gesto.y) < 6) return;
    arrastado = gesto.item;
    arrastado.classList.add("arrastando");
    document.documentElement.classList.add("cursor-arrastando");
  }
  atalhos.querySelector(".receber-atalho")?.classList.remove("receber-atalho");
  const alvo = document.elementFromPoint(evento.clientX, evento.clientY);
  destinoDoArraste(alvo)?.classList.add("receber-atalho");
});

function terminarGestoAtalho(evento) {
  if (!gestoAtalho || (evento.pointerId !== undefined && evento.pointerId !== gestoAtalho.id)) return;
  const { item, arrasteNativo } = gestoAtalho;
  gestoAtalho = undefined;
  item.draggable = arrasteNativo;
  if (!arrastado) return;
  const alvo = evento.type === "pointerup" && document.elementFromPoint(evento.clientX, evento.clientY);
  const destino = destinoDoArraste(alvo);
  if (evento.type === "pointerup") {
    cliqueDoArraste = item;
    setTimeout(() => { cliqueDoArraste = undefined; }, 0);
  }
  limparArraste();
  if (destino) moverAntes(item, destino);
}

for (const tipo of ["pointerup", "pointercancel", "blur"]) {
  window.addEventListener(tipo, terminarGestoAtalho);
}
window.addEventListener("keydown", (evento) => {
  if (evento.key === "Escape") terminarGestoAtalho(evento);
});
document.documentElement.addEventListener("pointerleave", terminarGestoAtalho);

atalhos.addEventListener("click", (evento) => {
  if (evento.target.closest("[data-atalho]") !== cliqueDoArraste) return;
  evento.preventDefault();
  evento.stopPropagation();
}, true);

atalhos.addEventListener("dragstart", (evento) => {
  if (gestoAtalho) {
    evento.preventDefault();
    return;
  }
  arrastado = evento.target.closest("[data-atalho]");
  if (!arrastado) return;
  evento.dataTransfer.setData("text/plain", arrastado.dataset.atalho);
  evento.dataTransfer.effectAllowed = "move";
  arrastado.classList.add("arrastando");
});

function destinoDoArraste(alvo) {
  const destino = alvo ? alvo.closest("[data-atalho]") : null;
  return arrastado && destino?.parentElement === atalhos && destino !== arrastado && arrastado.nextElementSibling !== destino
    ? destino : null;
}

navegacao.addEventListener("dragover", (evento) => {
  atalhos.querySelector(".receber-atalho")?.classList.remove("receber-atalho");
  const destino = destinoDoArraste(evento.target);
  if (!destino) return;
  evento.preventDefault();
  evento.dataTransfer.dropEffect = "move";
  destino.classList.add("receber-atalho");
});

navegacao.addEventListener("drop", (evento) => {
  const destino = destinoDoArraste(evento.target);
  if (!destino) return;
  evento.preventDefault();
  moverAntes(arrastado, destino);
});

navegacao.addEventListener("dragleave", (evento) => {
  if (!navegacao.contains(evento.relatedTarget)) atalhos.querySelector(".receber-atalho")?.classList.remove("receber-atalho");
});

function limparArraste() {
  arrastado?.classList.remove("arrastando");
  atalhos.querySelector(".receber-atalho")?.classList.remove("receber-atalho");
  document.documentElement.classList.remove("cursor-arrastando");
  arrastado = undefined;
}

atalhos.addEventListener("dragend", limparArraste);

atalhos.addEventListener("keydown", (evento) => {
  if (!evento.altKey || evento.key !== "ArrowUp") return;
  const item = evento.target.closest("[data-atalho]");
  if (!item?.previousElementSibling) return;
  evento.preventDefault();
  moverAntes(item, item.previousElementSibling);
  item.focus();
});

atalhos.querySelector('[data-atalho="inicio"]').addEventListener("click", abrirInicio);
atalhos.querySelector('[data-atalho="novo"]').addEventListener("click", () => novoChat());
porId("novo-chat").addEventListener("click", () => novoChat());
porId("novo-projeto").addEventListener("click", () => {
  pedirTexto("Nome do projeto", "", (nome) => {
    const projeto = { id: crypto.randomUUID(), nome };
    dados.projetos.push(projeto);
    salvar();
    selecionar(undefined, projeto);
  });
});

function trocarModo(selecionado) {
  if (!Object.hasOwn(apresentacao, selecionado) || selecionado === modo) return;
  const rascunho = campoMensagem.value;
  const arquivos = anexos;
  modo = selecionado;
  selecionar(undefined, dados.projetos.find((item) => item.id === projetoAtivo));
  campoMensagem.value = rascunho;
  anexos = arquivos;
  renderizarAnexos();
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    porId("conversa").animate([{ opacity: 0.55, transform: "translateY(5px)" }, { opacity: 1, transform: "translateY(0)" }], { duration: 220, easing: "ease-out" });
  }
}

modos.addEventListener("click", (evento) => {
  trocarModo(evento.target.closest("[data-modo]")?.dataset.modo);
});

function posicionarEspacos() {
  const alvo = escolherEspaco.getBoundingClientRect();
  const largura = espacosIdeon.offsetWidth;
  const altura = espacosIdeon.offsetHeight;
  espacosIdeon.style.left = Math.max(8, Math.min(alvo.left, innerWidth - largura - 8)) + "px";
  espacosIdeon.style.top = Math.max(8, Math.min(alvo.bottom + 8, (window.visualViewport?.height ?? innerHeight) - altura - 8)) + "px";
}

espacosIdeon.addEventListener("beforetoggle", (evento) => {
  escolherEspaco.setAttribute("aria-expanded", String(evento.newState === "open"));
});
espacosIdeon.addEventListener("toggle", () => {
  if (espacosIdeon.matches(":popover-open")) posicionarEspacos();
});
espacosIdeon.addEventListener("click", (evento) => {
  const espaco = evento.target.closest("[data-espaco]")?.dataset.espaco;
  if (!espaco) return;
  trocarModo(espaco === "code" ? "code" : modo === "code" ? "chat" : modo);
  espacosIdeon.hidePopover();
  escolherEspaco.focus({ preventScroll: true });
});

modeloWork.value = [...modeloWork.options].some((opcao) => opcao.value === dados.modeloWork)
  ? dados.modeloWork : "padrao";
esforcoWork.value = String(Number.isInteger(dados.esforcoWork) && niveis[dados.esforcoWork]
  ? dados.esforcoWork : 1);
modeloWork.addEventListener("change", () => {
  dados.modeloWork = modeloWork.value;
  atualizarModeloWork();
  salvar();
});
esforcoWork.addEventListener("input", atualizarEsforco);
esforcoWork.addEventListener("change", () => {
  dados.esforcoWork = esforcoWork.valueAsNumber;
  salvar();
});
atualizarEsforco();

function renderizarAnexos() {
  const lista = porId("anexos");
  lista.hidden = !anexos.length;
  lista.replaceChildren(...anexos.map((arquivo, indice) => {
    const item = document.createElement("span");
    item.className = "anexo";
    const nome = document.createElement("span");
    nome.textContent = arquivo.nome;
    nome.title = arquivo.nome;
    const remover = botao("×", "remover-anexo");
    remover.setAttribute("aria-label", "Remover " + arquivo.nome);
    remover.addEventListener("click", () => { anexos.splice(indice, 1); renderizarAnexos(); });
    item.append(nome, remover);
    return item;
  }));
}

function limparAnexos() {
  versaoAnexos++;
  anexos = [];
  lendoAnexos = false;
  porId("arquivos").value = "";
  porId("estado-anexos").hidden = true;
  renderizarAnexos();
}

async function adicionarArquivos(arquivos) {
  if (lendoAnexos) return;
  const versao = versaoAnexos;
  const estado = porId("estado-anexos");
  lendoAnexos = true;
  estado.hidden = false;
  estado.textContent = "Lendo arquivos…";
  const erros = [];
  const extensoes = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|html|css|js|mjs|cjs|ts|tsx|jsx|py|java|c|h|cpp|cs|go|rs|rb|php|sql|yaml|yml|toml|ini|log|sh|ps1)$/i;
  try {
    for (const arquivo of arquivos) {
      if (versao !== versaoAnexos) return;
      if (!extensoes.test(arquivo.name)) {
        erros.push(arquivo.name + ": use um arquivo de texto, documento Markdown, planilha CSV ou código.");
        continue;
      }
      if (anexos.length >= 5 || arquivo.size + anexos.reduce((total, item) => total + item.tamanho, 0) > 120 * 1024) {
        erros.push("Use até 5 arquivos, somando no máximo 120 KB.");
        continue;
      }
      try {
        const conteudo = new TextDecoder("utf-8", { fatal: true }).decode(await arquivo.arrayBuffer());
        if (versao !== versaoAnexos) return;
        if (conteudo.includes("\0") || !conteudo.trim()) throw new Error();
        anexos.push({ nome: arquivo.name, conteudo, tamanho: arquivo.size });
      } catch {
        erros.push(arquivo.name + ": não foi possível ler o texto. Use um arquivo UTF-8 não vazio.");
      }
    }
  } finally {
    if (versao === versaoAnexos) {
      lendoAnexos = false;
      porId("arquivos").value = "";
      renderizarAnexos();
      estado.textContent = erros.join(" ") || "Arquivos prontos para enviar.";
      estado.hidden = !erros.length;
    }
  }
}

porId("adicionar-arquivo").addEventListener("click", () => porId("arquivos").click());
porId("arquivos").addEventListener("change", (evento) => adicionarArquivos([...evento.target.files]));

function historicoParaEnvio(mensagens) {
  const historico = mensagens.slice(-20);
  while (historico.length > 1 && new TextEncoder().encode(JSON.stringify(historico)).length > 220 * 1024) historico.shift();
  return historico;
}

function pararResposta() {
  const controle = controlesGeracao.get(chatAtivo);
  if (!controle) return;
  controle.abort();
  controlesGeracao.delete(chatAtivo);
  geracoes.delete(chatAtivo);
  errosIa.delete(chatAtivo);
  atualizarEstadoIa();
}

function liberarAudio(sessao) {
  cancelAnimationFrame(sessao.quadro);
  sessao.stream?.getTracks().forEach((faixa) => faixa.stop());
  sessao.audio?.close().catch(() => {});
}

function atualizarVoz(texto = "") {
  porId("barra-voz").hidden = !voz;
  porId("escrever").classList.toggle("ditando", Boolean(voz));
  campoMensagem.readOnly = Boolean(voz);
  porId("estado-voz").hidden = !texto;
  porId("estado-voz").textContent = texto;
}

function cancelarVoz() {
  if (!voz) return;
  const sessao = voz;
  voz = undefined;
  sessao.reconhecimento.abort();
  liberarAudio(sessao);
  atualizarVoz();
}

function desenharVoz(sessao) {
  if (voz !== sessao || sessao.finalizando) return;
  const canvas = porId("ondas-voz");
  canvas.width = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio));
  canvas.height = 40 * devicePixelRatio;
  const ctx = canvas.getContext("2d");
  const amostras = new Uint8Array(sessao.analisador.fftSize);
  sessao.analisador.getByteTimeDomainData(amostras);
  let energia = 0;
  for (const valor of amostras) energia += ((valor - 128) / 128) ** 2;
  sessao.niveis.push(Math.min(1, Math.sqrt(energia / amostras.length) * 5));
  const passo = 5 * devicePixelRatio;
  const quantidade = Math.max(1, Math.floor(canvas.width / passo));
  sessao.niveis = sessao.niveis.slice(-quantidade);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 2 * devicePixelRatio;
  ctx.lineCap = "round";
  for (let i = 0; i < quantidade; i++) {
    const nivel = sessao.niveis[sessao.niveis.length - quantidade + i] ?? 0;
    const altura = Math.max(2 * devicePixelRatio, nivel * canvas.height * 0.8);
    ctx.beginPath();
    ctx.moveTo(i * passo + passo / 2, (canvas.height - altura) / 2);
    ctx.lineTo(i * passo + passo / 2, (canvas.height + altura) / 2);
    ctx.stroke();
  }
  sessao.quadro = requestAnimationFrame(() => desenharVoz(sessao));
}

async function iniciarVoz() {
  if (voz || geracoes.has(chatAtivo)) return;
  const Reconhecimento = window.SpeechRecognition ?? window.webkitSpeechRecognition;
  if (!Reconhecimento || !navigator.mediaDevices?.getUserMedia) {
    atualizarVoz("A transcrição de voz não está disponível neste navegador. Tente o Chrome ou Edge.");
    return;
  }
  const sessao = { reconhecimento: new Reconhecimento(), rascunho: campoMensagem.value, transcricao: "", niveis: [] };
  voz = sessao;
  atualizarVoz("Aguardando acesso ao microfone… Transcrição pelo navegador.");
  const reconhecimento = sessao.reconhecimento;
  reconhecimento.lang = "pt-BR";
  reconhecimento.continuous = true;
  reconhecimento.interimResults = true;
  reconhecimento.onresult = (evento) => {
    if (voz !== sessao) return;
    sessao.transcricao = Array.from(evento.results, (resultado) => resultado[0].transcript).join(" ").trim();
  };
  reconhecimento.onerror = (evento) => {
    if (voz !== sessao) return;
    const texto = evento.error === "not-allowed" ? "Permita o acesso ao microfone para ditar."
      : evento.error === "no-speech" ? "Nenhuma fala foi detectada. Tente novamente."
      : "Não foi possível transcrever. Verifique o microfone e a conexão.";
    cancelarVoz();
    atualizarVoz(texto);
  };
  reconhecimento.onend = () => {
    if (voz !== sessao) return;
    voz = undefined;
    liberarAudio(sessao);
    const texto = sessao.transcricao.trim();
    campoMensagem.value = [sessao.rascunho.trimEnd(), texto].filter(Boolean).join(" ");
    atualizarVoz(texto ? "" : "Nenhuma fala foi detectada. Tente novamente.");
    campoMensagem.focus();
    if (sessao.enviar && texto) porId("escrever").requestSubmit();
  };
  try {
    sessao.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (voz !== sessao) { liberarAudio(sessao); return; }
    sessao.audio = new (window.AudioContext ?? window.webkitAudioContext)();
    await sessao.audio.resume();
    if (voz !== sessao) { liberarAudio(sessao); return; }
    sessao.analisador = sessao.audio.createAnalyser();
    sessao.analisador.fftSize = 256;
    sessao.audio.createMediaStreamSource(sessao.stream).connect(sessao.analisador);
    reconhecimento.start();
    sessao.iniciada = true;
    atualizarVoz("Ouvindo… Transcrição pelo navegador.");
    desenharVoz(sessao);
  } catch {
    if (voz !== sessao) return;
    cancelarVoz();
    atualizarVoz("Não foi possível acessar o microfone. Confira a permissão do navegador.");
  }
}

function concluirVoz(enviar) {
  if (!voz || voz.finalizando) return;
  if (!voz.iniciada) { cancelarVoz(); return; }
  voz.enviar = enviar;
  voz.finalizando = true;
  liberarAudio(voz);
  atualizarVoz("Finalizando transcrição…");
  voz.reconhecimento.stop();
}

porId("microfone").addEventListener("click", iniciarVoz);
porId("cancelar-voz").addEventListener("click", cancelarVoz);
porId("parar-voz").addEventListener("click", () => concluirVoz(false));
porId("enviar-voz").addEventListener("click", () => concluirVoz(true));
porId("enviar").addEventListener("click", () => {
  if (geracoes.has(chatAtivo)) pararResposta();
  else porId("escrever").requestSubmit();
});
addEventListener("pagehide", cancelarVoz);

porId("escrever").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (voz) { concluirVoz(true); return; }
  if (lendoAnexos) { avisar("Aguarde a leitura dos arquivos."); return; }
  const mensagem = campoMensagem.value.trim();
  const texto = [mensagem || (anexos.length ? "Analise os arquivos anexados." : ""),
    ...anexos.map((arquivo) => "--- Arquivo: " + arquivo.nome + " ---\n" + arquivo.conteudo)].filter(Boolean).join("\n\n");
  if (!texto || geracoes.has(chatAtivo)) return;
  if (!await verificarServidor()) return;
  if (geracoes.has(chatAtivo)) return;
  const existente = dados.chats.find((item) => item.id === chatAtivo);
  const chat = existente ?? novoChat(false);
  if (!chat.mensagens.length && !chat.renomeado) {
    const titulo = texto.replace(/\s+/g, " ");
    chat.titulo = titulo.length > 52 ? titulo.slice(0, 52) + "…" : titulo;
  }
  chat.mensagens.push(texto);
  chat.momento = Date.now();
  salvar();
  limparAnexos();
  campoMensagem.value = "";
  if (existente) renderizar();
  else selecionar(chat);
  porId("mensagens").lastElementChild?.scrollIntoView({ block: "nearest" });
  campoMensagem.focus({ preventScroll: true });

  if (location.protocol === "file:") return;
  const esforco = esforcoWork.valueAsNumber;
  const modelo = modo === "chat" ? "padrao" : modeloWork.value;
  errosIa.delete(chat.id);
  const controle = new AbortController();
  controlesGeracao.set(chat.id, controle);
  geracoes.set(chat.id, modo === "work" ? "Gerando resposta · " + niveis[esforco][0] : "Gerando resposta…");
  atualizarEstadoIa();
  try {
    const resposta = await fetch("/api/ideon", {
      method: "POST",
      signal: controle.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ modo, modelo, esforco, mensagens: historicoParaEnvio(chat.mensagens) }),
    });
    if (!resposta.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Abra o site pelo servidor do Ideon para gerar respostas.");
    }
    const resultado = await resposta.json();
    if (controle.signal.aborted || !dados.chats.includes(chat)) return;
    if (!resposta.ok) throw new Error(resultado.erro);
    chat.mensagens.push(resultado);
    salvar();
  } catch (erro) {
    if (controle.signal.aborted || !dados.chats.includes(chat)) return;
    errosIa.set(chat.id, erro instanceof TypeError ? "A conexão com o servidor foi interrompida. Mantenha o terminal do ideon aberto e execute npm.cmd start se ele tiver sido fechado." : erro.message);
  } finally {
    if (controlesGeracao.get(chat.id) !== controle) return;
    controlesGeracao.delete(chat.id);
    geracoes.delete(chat.id);
    if (chatAtivo === chat.id) {
      renderizar();
      porId("mensagens").lastElementChild?.scrollIntoView({ block: "nearest" });
    }
  }
});

addEventListener("hashchange", lerRota);
campoMensagem.addEventListener("keydown", (evento) => {
  if (evento.key !== "Enter" || evento.shiftKey || evento.isComposing) return;
  evento.preventDefault();
  if (!geracoes.has(chatAtivo)) porId("escrever").requestSubmit();
});
addEventListener("focus", atualizarSaudacao);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) atualizarSaudacao();
});
function reposicionarPaineis() {
  if (espacosIdeon.matches(":popover-open")) posicionarEspacos();
  if (painelWork.matches(":popover-open")) posicionarPainelWork();
  if (opcoes.matches(":popover-open")) opcoes.hidePopover();
}
addEventListener("resize", reposicionarPaineis);
window.visualViewport?.addEventListener("resize", reposicionarPaineis);
addEventListener("scroll", () => {
  if (espacosIdeon.matches(":popover-open")) posicionarEspacos();
  if (painelWork.matches(":popover-open")) posicionarPainelWork();
}, true);
lerRota();
porId("tentar-conexao").addEventListener("click", verificarServidor);
verificarServidor();
