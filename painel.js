const painelConfiguracoes = porId("configuracoes");
let estadoLocal;
let temporizadorModelos;
let controleComparacao;
const preferenciaSistema = matchMedia("(prefers-color-scheme: dark)");

function aplicarTema() {
  const tema = dados.tema ?? "claro";
  document.documentElement.dataset.tema = tema === "sistema" ? (preferenciaSistema.matches ? "escuro" : "claro") : tema;
}
aplicarTema();
preferenciaSistema.addEventListener("change", aplicarTema);

function aplicarBarraRolagem() {
  document.documentElement.dataset.barraRolagem = dados.barraRolagem ?? "discreta";
}
aplicarBarraRolagem();

async function apiLocal(caminho, dadosPedido, sinal) {
  const resposta = await fetch(caminho, dadosPedido === undefined ? { signal: sinal } : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dadosPedido), signal: sinal,
  });
  if (!resposta.headers.get("content-type")?.includes("application/json")) throw new Error("Abra o site pelo servidor local do Ideon.");
  const retorno = await resposta.json();
  if (!resposta.ok) throw new Error(retorno.erro ?? "Não foi possível concluir.");
  return retorno;
}

function erroConfiguracoes(erro) {
  porId("aviso-configuracoes").textContent = erro instanceof TypeError ? "Servidor local indisponível. Execute node servidor.js na pasta do projeto." : erro.message;
}

function opcaoModelo(valor, nome) {
  const opcao = document.createElement("option"); opcao.value = valor; opcao.textContent = nome; return opcao;
}

function preencherModelos() {
  const nomes = estadoLocal.modelos.map((m) => m.name);
  for (const id of ["modelo-principal", "modelo-codigo", "comparacao-a", "comparacao-b"]) {
    const campo = porId(id);
    const antigo = campo.value;
    const padrao = id.startsWith("modelo-");
    campo.replaceChildren(...(padrao ? [opcaoModelo("", "Automático · modelo local recomendado")] : []),
      ...nomes.map((nome) => opcaoModelo(nome, nome)));
    campo.value = nomes.includes(antigo) ? antigo : padrao ? "" : nomes[0] ?? "";
  }
  porId("modelo-principal").value = estadoLocal.configuracao.principal;
  porId("modelo-codigo").value = estadoLocal.configuracao.codigo;
  porId("processamento").value = estadoLocal.configuracao.processamento ?? "cpu";
  porId("usar-personalizada").checked = estadoLocal.configuracao.personalizada;
  porId("usar-personalizada").disabled = !nomes.includes("ideon:latest");
  porId("criar-modelo").disabled = !nomes.some((nome) => nome !== "ideon:latest");
  porId("catalogo-modelos").replaceChildren(...estadoLocal.catalogo.map((tag) => {
    const linha = document.createElement("div"); linha.className = "linha-modelo";
    const texto = document.createElement("span"); texto.textContent = tag;
    const botao = document.createElement("button"); botao.type = "button";
    botao.textContent = nomes.includes(tag) ? "Instalado ✓" : "Baixar";
    botao.disabled = nomes.includes(tag) || Boolean(estadoLocal.tarefa?.executando);
    botao.addEventListener("click", () => prepararModelo(tag, false)); linha.append(texto, botao); return linha;
  }));
  if (porId("comparacao-a").value === porId("comparacao-b").value && nomes.length > 1) porId("comparacao-b").value = nomes[1];
}

function mostrarTarefa() {
  const tarefa = estadoLocal?.tarefa;
  porId("estado-modelos").textContent = tarefa ? tarefa.erro ?? tarefa.status : "Downloads precisam de internet. Após instalar, a conversa funciona localmente.";
  porId("progresso-modelos").hidden = !tarefa?.executando;
  if (tarefa?.progresso === undefined) porId("progresso-modelos").removeAttribute("value");
  else porId("progresso-modelos").value = tarefa.progresso;
  porId("criar-modelo").disabled = Boolean(tarefa?.executando) || !estadoLocal?.modelos.some((m) => m.name !== "ideon:latest");
  clearTimeout(temporizadorModelos);
  if (tarefa?.executando && painelConfiguracoes.open) temporizadorModelos = setTimeout(async () => {
    try {
      estadoLocal = await apiLocal("/api/estado");
      mostrarTarefa();
      if (!estadoLocal.tarefa?.executando) preencherModelos();
    } catch (erro) { erroConfiguracoes(erro); }
  }, 1800);
}

async function atualizarConexao() {
  porId("conexao-ollama").textContent = "Consultando o Ollama…";
  try {
    estadoLocal = await apiLocal("/api/estado"); preencherModelos(); mostrarTarefa();
    porId("conexao-ollama").textContent = `Ollama conectado · ${estadoLocal.modelos.length} modelo(s) instalado(s) · uma resposta por vez`;
  } catch (erro) {
    porId("conexao-ollama").textContent = "Não foi possível conectar ao Ollama."; erroConfiguracoes(erro);
  }
}

async function prepararModelo(modelo, criar) {
  porId("aviso-configuracoes").textContent = "";
  porId("criar-modelo").disabled = true;
  try {
    await apiLocal(criar ? "/api/modelos/criar" : "/api/modelos/baixar", { modelo });
    await atualizarConexao();
  } catch (erro) { erroConfiguracoes(erro); porId("criar-modelo").disabled = false; }
}

function selecionarAbaPessoal(destino) {
  for (const aba of document.querySelectorAll("[data-aba]")) aba.setAttribute("aria-pressed", String(aba.dataset.aba === destino));
  for (const painel of document.querySelectorAll("[data-painel]")) painel.hidden = painel.dataset.painel !== destino;
}

function abrirConfiguracoes(destino) {
  porId("menu-pessoal").hidePopover();
  porId("nome-perfil").value = dados.perfil?.primeiroNome ?? dados.perfil?.nome ?? "";
  porId("tema").value = dados.tema ?? "claro";
  porId("barra-rolagem").value = dados.barraRolagem ?? "discreta";
  porId("aviso-configuracoes").textContent = "";
  selecionarAbaPessoal(destino);
  painelConfiguracoes.showModal(); mostrarArquivados(); mostrarPerguntas(); mostrarComparacoes(); atualizarConexao();
}
for (const botao of document.querySelectorAll("[data-destino-pessoal]")) botao.addEventListener("click", () => abrirConfiguracoes(botao.dataset.destinoPessoal));

function atualizarNomePessoal() {
  const nome = dados.perfil?.primeiroNome ?? dados.perfil?.nome ?? "";
  porId("nome-menu-pessoal").textContent = nome.trim() || "Meu espaço";
  porId("abrir-menu-pessoal").querySelector(".avatar").textContent = nome.trim().charAt(0).toLocaleUpperCase("pt-BR") || "I";
}
function posicionarMenuPessoal() {
  const menu = porId("menu-pessoal");
  const botao = porId("abrir-menu-pessoal").getBoundingClientRect();
  menu.style.left = `${Math.max(8, Math.min(botao.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(botao.top - menu.offsetHeight - 8, (window.visualViewport?.height ?? innerHeight) - menu.offsetHeight - 8))}px`;
}
porId("menu-pessoal").addEventListener("toggle", (evento) => {
  porId("abrir-menu-pessoal").setAttribute("aria-expanded", String(evento.newState === "open"));
  if (evento.newState === "open") posicionarMenuPessoal();
});
addEventListener("resize", () => {
  if (porId("menu-pessoal").matches(":popover-open")) posicionarMenuPessoal();
});
window.visualViewport?.addEventListener("resize", () => {
  if (porId("menu-pessoal").matches(":popover-open")) posicionarMenuPessoal();
});
atualizarNomePessoal();

porId("sair-ideon").addEventListener("click", () => {
  porId("menu-pessoal").hidePopover();
  cancelarVoz();
  for (const controle of controlesGeracao.values()) controle.abort();
  controlesGeracao.clear(); geracoes.clear();
  controleComparacao?.abort();
  atualizarEstadoIa();
  porId("sessao-encerrada").showModal();
});
porId("sessao-encerrada").addEventListener("cancel", (evento) => evento.preventDefault());
porId("voltar-ideon").addEventListener("click", () => porId("sessao-encerrada").close());
porId("fechar-configuracoes").addEventListener("click", () => painelConfiguracoes.close());
painelConfiguracoes.addEventListener("close", () => clearTimeout(temporizadorModelos));
for (const botao of document.querySelectorAll("[data-aba]")) botao.addEventListener("click", () => {
  selecionarAbaPessoal(botao.dataset.aba);
});
porId("preferencias-pessoais").addEventListener("submit", (evento) => {
  evento.preventDefault();
  dados.perfil = { ...dados.perfil, primeiroNome: porId("nome-perfil").value.trim().split(/\s+/)[0] };
  atualizarSaudacao(); atualizarNomePessoal();
  if (salvar()) porId("aviso-configuracoes").textContent = "Perfil salvo.";
});
porId("preferencias-aparencia").addEventListener("submit", (evento) => {
  evento.preventDefault();
  dados.tema = porId("tema").value;
  dados.barraRolagem = porId("barra-rolagem").value;
  aplicarTema();
  aplicarBarraRolagem();
  if (salvar()) porId("aviso-configuracoes").textContent = "Personalização salva.";
});
porId("preferencias-ia").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  try {
    await apiLocal("/api/configuracao", { principal: porId("modelo-principal").value, codigo: porId("modelo-codigo").value,
      personalizada: porId("usar-personalizada").checked, processamento: porId("processamento").value });
    porId("aviso-configuracoes").textContent = "Modelos salvos. A escolha vale para as próximas mensagens no modo Padrão.";
  } catch (erro) { erroConfiguracoes(erro); }
});
porId("criar-modelo").addEventListener("click", () => {
  const base = porId("modelo-principal").value || estadoLocal?.modelos.find((m) => m.name === "qwen3.5:4b")?.name ||
    estadoLocal?.modelos.find((m) => m.name !== "ideon:latest")?.name;
  if (base) prepararModelo(base, true);
});

function mostrarPerguntas() {
  porId("perguntas-salvas").replaceChildren(...(dados.perguntasTeste ?? []).map((pergunta, indice) => {
    const linha = document.createElement("div"); linha.className = "pergunta-salva";
    const usar = document.createElement("button"); usar.type = "button"; usar.textContent = pergunta;
    usar.addEventListener("click", () => { porId("pergunta-teste").value = pergunta; });
    const remover = document.createElement("button"); remover.type = "button"; remover.textContent = "×"; remover.setAttribute("aria-label", "Remover pergunta");
    remover.addEventListener("click", () => { dados.perguntasTeste.splice(indice, 1); salvar(); mostrarPerguntas(); });
    linha.append(usar, remover); return linha;
  }));
}
porId("guardar-pergunta").addEventListener("click", () => {
  const texto = porId("pergunta-teste").value.trim(); if (!texto) return;
  dados.perguntasTeste ??= [];
  if (!dados.perguntasTeste.includes(texto)) dados.perguntasTeste.unshift(texto);
  dados.perguntasTeste = dados.perguntasTeste.slice(0, 30); salvar(); mostrarPerguntas();
});

function mostrarComparacoes() {
  porId("resultados-comparacao").replaceChildren(...(dados.comparacoes ?? []).slice(0, 8).map((teste) => {
    const artigo = document.createElement("article"); artigo.className = "comparacao";
    const titulo = document.createElement("h3"); titulo.textContent = teste.pergunta;
    const data = document.createElement("small"); data.textContent = new Date(teste.data).toLocaleString("pt-BR") + " · " + teste.modo;
    artigo.append(titulo, data);
    for (const resposta of teste.respostas) {
      const secao = document.createElement("section"); const nome = document.createElement("h4");
      nome.textContent = `${resposta.tag} · ${resposta.segundos}s · ${resposta.tokens} tokens`;
      secao.append(nome, renderizarResposta(resposta.conteudo)); artigo.append(secao);
    }
    return artigo;
  }));
}
porId("comparar-modelos").addEventListener("submit", async (evento) => {
  evento.preventDefault(); if (controleComparacao) return;
  const a = porId("comparacao-a").value, b = porId("comparacao-b").value;
  if (!a || !b || a === b) { porId("estado-comparacao").textContent = "Escolha dois modelos diferentes e instalados."; return; }
  const teste = { pergunta: porId("pergunta-teste").value.trim(), modo: porId("comparacao-modo").value, data: Date.now(), respostas: [] };
  controleComparacao = new AbortController();
  porId("executar-comparacao").disabled = true; porId("cancelar-comparacao").hidden = false;
  try {
    for (const tag of [a, b]) {
      porId("estado-comparacao").textContent = "Aguardando resposta de " + tag + "…";
      teste.respostas.push(await apiLocal("/api/ideon", { modo: teste.modo, modelo: "padrao", modeloTeste: tag,
        esforco: 2, mensagens: [teste.pergunta] }, controleComparacao.signal));
    }
    dados.comparacoes = [teste, ...(dados.comparacoes ?? [])].slice(0, 8); salvar(); mostrarComparacoes();
    porId("estado-comparacao").textContent = "Comparação salva. Leia as respostas antes de escolher um modelo.";
  } catch (erro) {
    porId("estado-comparacao").textContent = erro.name === "AbortError" ? "Comparação interrompida." : erro.message;
  } finally { controleComparacao = undefined; porId("executar-comparacao").disabled = false; porId("cancelar-comparacao").hidden = true; }
});
porId("cancelar-comparacao").addEventListener("click", () => controleComparacao?.abort());

function mostrarArquivados() {
  const arquivados = dados.chats.filter((chat) => chat.arquivado);
  const vazio = document.createElement("p"); vazio.textContent = "Nenhuma conversa arquivada.";
  porId("chats-arquivados").replaceChildren(...(arquivados.length ? arquivados.map((chat) => {
    const linha = document.createElement("div"); linha.className = "linha-modelo";
    const nome = document.createElement("span"); nome.textContent = chat.titulo;
    const restaurar = document.createElement("button"); restaurar.type = "button"; restaurar.textContent = "Restaurar";
    restaurar.addEventListener("click", () => { chat.arquivado = false; salvar(); renderizar(); mostrarArquivados(); });
    linha.append(nome, restaurar); return linha;
  }) : [vazio]));
}
porId("exportar-dados").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ versao: 1, exportadoEm: new Date().toISOString(), dados }, null, 2)], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = "ideon-historico-" + new Date().toISOString().slice(0, 10) + ".json";
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
porId("importar-dados").addEventListener("click", () => porId("arquivo-historico").click());
porId("arquivo-historico").addEventListener("change", async (evento) => {
  try {
    const arquivo = evento.target.files[0]; if (!arquivo) return;
    if (arquivo.size > 10 * 1024 * 1024) throw new Error("Use um backup de até 10 MB.");
    const backup = JSON.parse(await arquivo.text());
    const original = backup.dados;
    if (backup.versao !== 1 || !Array.isArray(original?.chats) || !Array.isArray(original.projetos) ||
        !original.chats.every((c) => typeof c?.id === "string" && typeof c.titulo === "string" && Array.isArray(c.mensagens) &&
          Object.hasOwn(apresentacao, c.modo) && c.mensagens.every((m) => typeof m === "string" || typeof m?.conteudo === "string")) ||
        !original.projetos.every((p) => typeof p?.id === "string" && typeof p.nome === "string")) throw new Error("Este arquivo não é um backup válido do Ideon.");
    const chatsAntes = dados.chats, projetosAntes = dados.projetos;
    dados.chats = [...dados.chats, ...original.chats.filter((c) => !dados.chats.some((atual) => atual.id === c.id))];
    dados.projetos = [...dados.projetos, ...original.projetos.filter((p) => !dados.projetos.some((atual) => atual.id === p.id))];
    if (!salvar()) { dados.chats = chatsAntes; dados.projetos = projetosAntes; throw new Error("Não há espaço para importar o histórico neste navegador."); }
    renderizar(); mostrarArquivados(); porId("aviso-configuracoes").textContent = "Conversas importadas. As conversas existentes foram preservadas.";
  } catch (erro) { erroConfiguracoes(erro); }
  finally { evento.target.value = ""; }
});
