const { createServer } = require("node:http");
const { readFile, readdir, writeFile } = require("node:fs/promises");
const { join, extname } = require("node:path");

const porta = Number(process.env.IDEON_PORT ?? 41983);
const endereco = "http://127.0.0.1:" + porta;
const ollama = process.env.IDEON_OLLAMA ?? "http://127.0.0.1:11434";
const pastaDados = process.env.IDEON_DATA_DIR ?? __dirname;
const arquivoConfig = join(pastaDados, ".ideon-config.json");
const instrucaoIdeon = "Você é ideon, um assistente pessoal local. Responda em português claro, a menos que o usuário peça outro idioma. Seja preciso, admita incertezas e não invente fontes ou ações realizadas. Ao explicar código, use exemplos executáveis e descreva como testar. Para trabalho, transforme anotações em entregas organizadas. Pergunte quando faltar uma informação essencial.";
const catalogo = ["qwen3.5:4b", "qwen3.5:2b", "qwen3.5:0.8b", "mimo-v2.6:9b-q4_K_M"];
let configuracao = { principal: "", codigo: "", personalizada: false, processamento: "cpu" };
let fila = Promise.resolve();
let pendentes = 0;
let tarefa;
let preparandoModelo = false;

async function exclusivo(acao, sinal) {
  if (pendentes >= 4) throw new ErroHttp(429, "Há várias mensagens aguardando. Tente novamente em instantes.");
  pendentes++;
  const anterior = fila;
  let liberar;
  fila = new Promise((resolve) => { liberar = resolve; });
  try {
    await anterior;
    sinal?.throwIfAborted();
    return await acao();
  } finally { pendentes--; liberar(); }
}
const coder = "qwen2.5-coder:1.5b";
const modelos = {
  nous: { nome: "Nous", tag: "qwen3.5:4b" },
  phos: { nome: "Phos", tag: "qwen3.5:2b" },
  versos: { nome: "Versos", tag: "qwen3.5:0.8b" },
};
const modos = {
  chat: "Converse em linguagem clara e natural. Responda diretamente à pergunta e use o contexto recente sem repetir a apresentação. Se não souber, diga isso.",
  work: "Ajude a desenvolver o trabalho solicitado. Para resumos, preserve as informações e não acrescente fatos. Para planejamento, organize tarefas e prioridades. Só atribua responsáveis e prazos quando fornecidos; caso contrário, apresente-os como sugestões.",
  code: "Ajude a escrever, explicar ou corrigir código. Identifique a causa antes de propor a correção e diferencie erros de sintaxe de erros de comportamento. Use blocos Markdown fechados para código. Explique como verificar o resultado e não afirme ter executado um teste que você não executou.",
};
const esforcos = [
  { tokens: 128, tempo: 60_000, instrucao: "Seja muito breve. Dê só o essencial." },
  { tokens: 384, tempo: 120_000, instrucao: "Responda com equilíbrio entre concisão e detalhe." },
  { tokens: 1024, tempo: 240_000, instrucao: "Analise os pontos relevantes e explique a solução com algum detalhe." },
  { tokens: 2048, tempo: 360_000, instrucao: "Considere alternativas e revise se a solução cobre as condições do pedido." },
  { tokens: 4096, tempo: 600_000, instrucao: "Faça uma análise aprofundada, compare alternativas pertinentes e entregue uma resposta detalhada e organizada." },
];
const tipos = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".woff": "font/woff", ".txt": "text/plain; charset=utf-8" };

class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

function json(resposta, status, dados) {
  resposta.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  resposta.end(JSON.stringify(dados));
}

async function lerPedido(pedido) {
  if (pedido.headers["content-type"]?.split(";")[0] !== "application/json") {
    throw new ErroHttp(415, "Formato de mensagem inválido.");
  }
  let tamanho = 0;
  const partes = [];
  for await (const parte of pedido.iterator({ destroyOnReturn: false })) {
    tamanho += parte.length;
    if (tamanho > 256 * 1024) throw new ErroHttp(413, "A mensagem ou o histórico ocupou espaço demais.");
    partes.push(parte);
  }
  try {
    return JSON.parse(Buffer.concat(partes).toString("utf8"));
  } catch {
    throw new ErroHttp(400, "Não foi possível ler a mensagem.");
  }
}

async function consultarOllama(caminho, opcoes) {
  try {
    return await fetch(ollama + caminho, opcoes);
  } catch (erro) {
    if (erro.name === "TimeoutError") throw new ErroHttp(504, "O Ollama demorou para responder. Aguarde a operação atual ou tente um modelo menor.");
    if (erro.name === "AbortError") throw erro;
    throw new ErroHttp(503, "Ollama indisponível. Abra o aplicativo Ollama e tente novamente.");
  }
}

async function escolherModelo(modo, perfil, sinal, teste) {
  const lista = await consultarOllama("/api/tags", { signal: AbortSignal.any([sinal, AbortSignal.timeout(5000)]) });
  if (!lista.ok) throw new ErroHttp(502, "Não foi possível consultar os modelos do Ollama.");
  const informacoes = (await lista.json()).models;
  const instalados = new Set(informacoes.map(({ name }) => name));
  const preferidos = modo === "code"
    ? [configuracao.codigo, configuracao.principal, modelos.nous.tag, modelos.phos.tag, coder, modelos.versos.tag]
    : [configuracao.principal, modelos.nous.tag, modelos.phos.tag, coder, modelos.versos.tag];
  if (configuracao.personalizada && instalados.has("ideon:latest")) preferidos.unshift("ideon:latest");
  const modelo = teste ? { nome: teste, tag: teste } : modelos[perfil] ?? { nome: "Padrão", tag: preferidos.find((tag) => instalados.has(tag)) };
  if (!modelo.tag) throw new ErroHttp(503, "Instale um Qwen local com ollama pull qwen2.5-coder:1.5b.");
  if (!instalados.has(modelo.tag)) {
    throw new ErroHttp(503, modelo.nome + " ainda precisa do modelo local. No terminal, execute ollama pull " + modelo.tag + ".");
  }
  return { ...modelo, pensa: modelo.tag.startsWith("qwen3.5:") || modelo.tag.startsWith("mimo-v2.6:") ||
    informacoes.find((item) => item.name === modelo.tag)?.capabilities?.includes("thinking") ||
    informacoes.find((item) => item.name === modelo.tag)?.details?.family === "qwen35" };
}

async function gerar(pedido, resposta) {
  const dados = await lerPedido(pedido);
  const { modo, modelo: perfil, esforco, mensagens: historico } = dados ?? {};
  if (!Object.hasOwn(modos, modo) || (perfil !== "padrao" && !Object.hasOwn(modelos, perfil)) ||
      !Number.isInteger(esforco) || !esforcos[esforco] || !Array.isArray(historico) ||
      typeof historico.at(-1) !== "string" || !historico.at(-1).trim() ||
      !historico.every((item) => typeof item === "string" || typeof item?.conteudo === "string") ||
      (dados.modeloTeste !== undefined && (typeof dados.modeloTeste !== "string" || dados.modeloTeste.length > 120))) {
    throw new ErroHttp(400, "Modo, modelo, esforço ou mensagens inválidos.");
  }
  const controle = new AbortController();
  resposta.on("close", () => controle.abort());
  await exclusivo(async () => {
  const modelo = await escolherModelo(modo, perfil, controle.signal, dados.modeloTeste);
  const carregados = await consultarOllama("/api/ps", { signal: controle.signal });
  if (!carregados.ok) throw new ErroHttp(502, "Não foi possível verificar os modelos carregados.");
  const naMemoria = (await carregados.json()).models ?? [];
  const margemCarregamento = naMemoria.some((item) => item.name === modelo.tag) ? 0 : 120_000;
  for (const outro of naMemoria) {
    if (outro.name === modelo.tag) continue;
    const liberado = await consultarOllama("/api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controle.signal,
      body: JSON.stringify({ model: outro.name, keep_alive: 0 }),
    });
    if (!liberado.ok) throw new ErroHttp(502, "Não foi possível liberar o modelo anterior.");
  }
  const inicio = performance.now();
  const limite = esforcos[esforco];
  const mensagens = [
    { role: "system", content: instrucaoIdeon + " " + modos[modo] + " " + limite.instrucao +
      " Responda no idioma do usuário. Você só tem acesso ao conteúdo recebido nesta conversa." },
    ...historico.slice(-20).map((item) => typeof item === "string"
      ? { role: "user", content: item }
      : { role: "assistant", content: item.conteudo }),
  ];
  const resultado = await consultarOllama("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.any([controle.signal, AbortSignal.timeout(limite.tempo + margemCarregamento)]),
    body: JSON.stringify({
      model: modelo.tag,
      messages: mensagens,
      stream: false,
      keep_alive: 0,
      ...(modelo.pensa ? { think: esforco >= 3 } : {}),
      options: { num_predict: limite.tokens, num_ctx: 4096, ...(configuracao.processamento === "cpu" ? { num_gpu: 0 } : {}) },
    }),
  });
  if (!resultado.ok) throw new ErroHttp(502, "O Ollama não conseguiu gerar a resposta. Confira se o modelo abre no Ollama.");
  let retorno;
  try {
    retorno = await resultado.json();
  } catch (erro) {
    if (erro.name === "AbortError" && !controle.signal.aborted) {
      throw new ErroHttp(504, "O Ollama atingiu o limite de tempo para este esforço.");
    }
    throw erro;
  }
  const conteudo = retorno.message?.content?.trim();
  if (!conteudo) throw new ErroHttp(502, "O modelo não retornou uma resposta. Tente outro nível de esforço.");
  json(resposta, 200, { conteudo, modelo: modelo.nome === "Padrão" ? "ideon IA" : modelo.nome,
    tag: modelo.tag, segundos: Math.round((performance.now() - inicio) / 100) / 10,
    tokens: retorno.eval_count ?? 0, truncado: retorno.done_reason === "length" });
  }, controle.signal);
}

async function estado(resposta) {
  const lista = await consultarOllama("/api/tags", { signal: AbortSignal.timeout(5000) });
  if (!lista.ok) throw new ErroHttp(502, "Não foi possível consultar os modelos.");
  json(resposta, 200, { modelos: (await lista.json()).models, configuracao, catalogo, tarefa,
    pendentes, instrucao: instrucaoIdeon });
}

async function configurar(pedido, resposta) {
  const dados = await lerPedido(pedido);
  const lista = await consultarOllama("/api/tags", { signal: AbortSignal.timeout(5000) });
  if (!lista.ok) throw new ErroHttp(502, "Não foi possível consultar os modelos.");
  const nomes = new Set((await lista.json()).models.map((m) => m.name));
  if (!dados || ![dados.principal, dados.codigo].every((tag) => tag === "" || nomes.has(tag)) ||
      typeof dados.personalizada !== "boolean" || (dados.personalizada && !nomes.has("ideon:latest")) ||
      (dados.processamento !== undefined && !["cpu", "auto"].includes(dados.processamento))) {
    throw new ErroHttp(400, "Escolha modelos instalados. Crie a versão Ideon antes de ativá-la.");
  }
  const nova = { principal: dados.principal, codigo: dados.codigo, personalizada: dados.personalizada,
    processamento: dados.processamento ?? configuracao.processamento };
  await writeFile(arquivoConfig, JSON.stringify(nova, null, 2), "utf8");
  configuracao = nova;
  json(resposta, 200, configuracao);
}

async function iniciarTarefa(pedido, resposta, criar) {
  const dados = await lerPedido(pedido);
  if (tarefa?.executando || preparandoModelo) throw new ErroHttp(409, "Já existe uma preparação de modelo em andamento.");
  preparandoModelo = true;
  try {
  if (!criar && !catalogo.includes(dados?.modelo)) throw new ErroHttp(400, "Modelo fora do catálogo.");
  if (criar) {
    const lista = await consultarOllama("/api/tags", { signal: AbortSignal.timeout(5000) });
    if (!lista.ok || !(await lista.json()).models.some((m) => m.name === dados?.modelo && m.name !== "ideon:latest")) {
      throw new ErroHttp(400, "Selecione um modelo original instalado.");
    }
    if (tarefa?.executando) throw new ErroHttp(409, "Já existe uma preparação de modelo em andamento.");
    await writeFile(join(pastaDados, "Modelfile"), "FROM " + dados.modelo + '\nSYSTEM """' + instrucaoIdeon + '"""\nPARAMETER num_ctx 4096\n', "utf8");
  }
  tarefa = { executando: true, status: criar ? "Criando ideon…" : "Preparando download…", modelo: dados.modelo };
  json(resposta, 202, tarefa);
  const atual = tarefa;
  const executar = async () => {
    const resultado = await consultarOllama(criar ? "/api/create" : "/api/pull", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(30 * 60_000),
      body: JSON.stringify(criar ? { model: "ideon", from: dados.modelo, system: instrucaoIdeon, stream: true }
        : { model: dados.modelo, stream: true }),
    });
    if (!resultado.ok) throw new Error("O Ollama recusou a operação. Confira a versão e o espaço disponível.");
    let restante = "";
    const decodificador = new TextDecoder();
    const lerLinha = (linha) => {
      if (!linha.trim()) return;
      const evento = JSON.parse(linha);
      if (evento.error) throw new Error(evento.error);
      atual.status = evento.status ?? atual.status;
      atual.progresso = evento.total ? Math.round(100 * (evento.completed ?? 0) / evento.total) : undefined;
    };
    for await (const parte of resultado.body) {
      restante += decodificador.decode(parte, { stream: true });
      let fim;
      while ((fim = restante.indexOf("\n")) >= 0) { lerLinha(restante.slice(0, fim)); restante = restante.slice(fim + 1); }
    }
    restante += decodificador.decode();
    lerLinha(restante);
    atual.status = criar ? "Versão ideon criada. Você já pode ativá-la." : "Modelo instalado.";
  };
  (criar ? exclusivo(executar) : executar()).catch((erro) => { atual.erro = erro.message; atual.status = "Não foi possível concluir."; })
    .finally(() => { atual.executando = false; });
  } finally { preparandoModelo = false; }
}

async function iniciar() {
  try { configuracao = { ...configuracao, ...JSON.parse(await readFile(arquivoConfig, "utf8")) }; }
  catch (erro) { if (erro.code !== "ENOENT") console.error("Configurações locais indisponíveis; usando padrão."); }
  const arquivos = new Set(["index.html", "style.css", "app.js", "cursor.js", "renderizador.js", "painel.js", "responsivo.js", "apresentacao.html", "apresentacao.css", "apresentacao.js",
    "assets/cursores/ideon-vento-e-fumaca.png", "assets/cursores/ideon-scroll-dois-dedos.png",
    "fontes/Essays1743.woff", "fontes/Essays1743-Bold.woff", "fontes/Essays1743-Italic.woff", "fontes/Essays1743-BoldItalic.woff", "fontes/OFL.txt",
    ...(await readdir(__dirname)).filter((nome) => extname(nome) === ".png")]);
  createServer(async (pedido, resposta) => {
    try {
      if (pedido.headers.host !== "127.0.0.1:" + porta && pedido.headers.host !== "localhost:" + porta) {
        throw new ErroHttp(403, "Endereço inválido.");
      }
      const origem = pedido.headers.origin;
      if (origem && origem !== "http://" + pedido.headers.host) throw new ErroHttp(403, "Origem inválida.");
      const caminho = new URL(pedido.url, endereco).pathname;
      if (pedido.method === "GET" && caminho === "/app/") { resposta.writeHead(302, { Location: "/app" }); resposta.end(); return; }
      if (pedido.method === "GET" && caminho === "/api/saude") { json(resposta, 200, { aplicacao: "ideon" }); return; }
      if (pedido.method === "GET" && caminho === "/api/estado") { await estado(resposta); return; }
      if (pedido.method === "POST" && caminho === "/api/configuracao") { await configurar(pedido, resposta); return; }
      if (pedido.method === "POST" && caminho === "/api/modelos/baixar") { await iniciarTarefa(pedido, resposta, false); return; }
      if (pedido.method === "POST" && caminho === "/api/modelos/criar") { await iniciarTarefa(pedido, resposta, true); return; }
      if (pedido.method === "POST" && caminho === "/api/ideon") {
        await gerar(pedido, resposta);
        return;
      }
      const nome = caminho === "/" ? "apresentacao.html" : caminho === "/app" ? "index.html" : decodeURIComponent(caminho.slice(1));
      if (pedido.method !== "GET" || !arquivos.has(nome)) throw new ErroHttp(404, "Página não encontrada.");
      const conteudo = await readFile(join(__dirname, nome));
      resposta.writeHead(200, { "Content-Type": tipos[extname(nome)], "Cache-Control": "no-store" });
      resposta.end(conteudo);
    } catch (erro) {
      if (!resposta.destroyed && !resposta.headersSent) {
        json(resposta, erro.status ?? 500, { erro: erro.status ? erro.message : "Erro no servidor do Ideon." });
      }
      if (!erro.status && erro.name !== "AbortError") console.error(erro);
    }
  }).listen(porta, "127.0.0.1", () => console.log("Ideon IA em " + endereco));
}

iniciar().catch(console.error);
