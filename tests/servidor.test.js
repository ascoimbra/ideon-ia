const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");
const { spawn } = require("node:child_process");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { once } = require("node:events");

let falso, processo, url, pasta, ambienteServidor;
let ativos = 0, maximoAtivos = 0, chamadas = [], descarregados = [];
const instalados = ["qwen3.5:4b", "qwen3.5:2b", "qwen2.5-coder:1.5b"];
let carregados = [{ name: "modelo-anterior:latest" }];

before(async () => {
  pasta = await mkdtemp(join(tmpdir(), "ideon-teste-"));
  falso = createServer(async (req, res) => {
    const partes = []; for await (const p of req) partes.push(p);
    const body = partes.length ? JSON.parse(Buffer.concat(partes)) : {};
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/tags") res.end(JSON.stringify({ models: instalados.map((name) => ({ name })) }));
    else if (req.url === "/api/ps") res.end(JSON.stringify({ models: carregados }));
    else if (req.url === "/api/generate") { descarregados.push(body.model); carregados = []; res.end("{}"); }
    else if (req.url === "/api/chat") {
      chamadas.push(body); ativos++; maximoAtivos = Math.max(ativos, maximoAtivos);
      await new Promise((r) => setTimeout(r, 80)); ativos--;
      res.end(JSON.stringify({ message: { content: "Resposta local de teste." }, eval_count: 12 }));
    } else if (req.url === "/api/create" || req.url === "/api/pull") {
      if (body.model === "ideon") instalados.push("ideon:latest");
      else instalados.push(body.model);
      res.end('{"status":"success"}\n');
    } else { res.statusCode = 404; res.end("{}"); }
  });
  falso.listen(0, "127.0.0.1"); await once(falso, "listening");
  // O servidor do projeto valida o Host; uma porta temporária evita tocar no app aberto.
  const reserva = createServer(); reserva.listen(0, "127.0.0.1"); await once(reserva, "listening");
  const porta = reserva.address().port; await new Promise((r) => reserva.close(r));
  url = "http://127.0.0.1:" + porta;
  ambienteServidor = { ...process.env, IDEON_PORT: String(porta), IDEON_DATA_DIR: pasta,
    IDEON_OLLAMA: "http://127.0.0.1:" + falso.address().port };
  processo = spawn(process.execPath, [join(__dirname, "..", "servidor.js")], {
    env: ambienteServidor, stdio: ["ignore", "pipe", "pipe"],
  });
  await Promise.race([once(processo.stdout, "data"), new Promise((_, reject) => setTimeout(() => reject(new Error("Servidor não iniciou")), 5000).unref())]);
});
after(async () => {
  if (processo) { const terminou = once(processo, "exit"); processo.kill(); await terminou; }
  await new Promise((r) => falso?.close(r)); await rm(pasta, { recursive: true, force: true });
});

async function post(caminho, dados) {
  const resposta = await fetch(url + caminho, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dados) });
  return { status: resposta.status, dados: await resposta.json() };
}
const pergunta = (modo = "chat", outros = {}) => ({ modo, modelo: "padrao", esforco: 1, mensagens: ["Olá"], ...outros });

test("serve todos os scripts e bloqueia arquivos privados e origens externas", async () => {
  assert.deepEqual(await (await fetch(url + "/api/saude")).json(), { aplicacao: "ideon" });
  for (const nome of ["/", "/app", "/app.js", "/painel.js", "/renderizador.js", "/style.css", "/apresentacao.css", "/apresentacao.js", "/responsivo.js", "/assets/cursores/ideon-vento-e-fumaca.png", "/assets/cursores/ideon-scroll-dois-dedos.png"]) assert.equal((await fetch(url + nome)).status, 200);
  assert.equal((await fetch(url + "/servidor.js")).status, 404);
  assert.equal((await fetch(url + "/api/estado", { headers: { Origin: "https://outro.example" } })).status, 403);
});
test("a apresentação abre o aplicativo e ambas as páginas usam a logo original na aba", async () => {
  const apresentacao = await (await fetch(url + "/")).text();
  const aplicativo = await (await fetch(url + "/app")).text();
  assert.match(apresentacao, /Uma equipe de uma pessoa/);
  assert.match(apresentacao, /href="\/app#modo=work"/);
  assert.match(apresentacao, /href="\/app#modo=code"/);
  assert.match(aplicativo, /<textarea id="mensagem"/);
  for (const html of [apresentacao, aplicativo]) {
    const logo = html.match(/rel="icon" type="image\/png" href="([^"]+)"/)[1];
    const resposta = await fetch(url + "/" + encodeURIComponent(logo));
    assert.equal(resposta.status, 200);
    assert.equal(resposta.headers.get("content-type"), "image/png");
  }
  const redirecionamento = await fetch(url + "/app/", { redirect: "manual" });
  assert.equal(redirecionamento.status, 302);
  assert.equal(redirecionamento.headers.get("location"), "/app");
});
test("consulta modelos e usa o Qwen principal, contexto recente e instruções de cada modo", async () => {
  for (const modo of ["chat", "work", "code"]) {
    const retorno = await post("/api/ideon", pergunta(modo, { mensagens: [...Array.from({ length: 22 }, (_, i) => "mensagem " + i), "última"] }));
    assert.equal(retorno.status, 200); assert.equal(retorno.dados.tokens, 12);
    const chamada = chamadas.at(-1);
    assert.equal(chamada.model, "qwen3.5:4b");
    assert.equal(chamada.messages.length, 21); assert.equal(chamada.messages.at(-1).content, "última");
    assert.equal(chamada.keep_alive, 0); assert.match(chamada.messages[0].content, /assistente pessoal local/);
    assert.equal(chamada.options.num_gpu, 0);
  }
  assert.deepEqual(descarregados, ["modelo-anterior:latest"]);
});
test("os cinco esforços são aceitos e têm limites progressivos", async () => {
  const limites = [];
  for (let esforco = 0; esforco < 5; esforco++) {
    assert.equal((await post("/api/ideon", pergunta("work", { esforco }))).status, 200);
    limites.push(chamadas.at(-1).options.num_predict);
    assert.equal(chamadas.at(-1).think, esforco >= 3);
  }
  assert.deepEqual(limites, [128, 384, 1024, 2048, 4096]);
});
test("serializa duas gerações simultâneas", async () => {
  await Promise.all([post("/api/ideon", pergunta()), post("/api/ideon", pergunta())]);
  assert.equal(maximoAtivos, 1);
});
test("recusa parâmetros inválidos e modelos não instalados", async () => {
  assert.equal((await post("/api/ideon", pergunta("inexistente"))).status, 400);
  assert.equal((await post("/api/ideon", pergunta("chat", { esforco: 5 }))).status, 400);
  assert.equal((await post("/api/ideon", pergunta("chat", { mensagens: [] }))).status, 400);
  assert.equal((await post("/api/ideon", pergunta("chat", { modeloTeste: "inexistente:latest" }))).status, 503);
  assert.equal((await post("/api/modelos/baixar", { modelo: "arbitrario" })).status, 400);
});
test("salva seleção de modelos no disco e respeita a configuração", async () => {
  assert.equal((await post("/api/configuracao", { principal: "qwen3.5:2b", codigo: "qwen3.5:4b", personalizada: false })).status, 200);
  assert.equal(JSON.parse(await readFile(join(pasta, ".ideon-config.json"))).principal, "qwen3.5:2b");
  await post("/api/ideon", pergunta()); assert.equal(chamadas.at(-1).model, "qwen3.5:2b");
  await post("/api/ideon", pergunta("code")); assert.equal(chamadas.at(-1).model, "qwen3.5:4b");
});
test("cria versão personalizada preservando o original e permite compará-la", async () => {
  assert.equal((await post("/api/modelos/criar", { modelo: "qwen3.5:4b" })).status, 202);
  for (let i = 0; i < 30; i++) {
    const estado = await (await fetch(url + "/api/estado")).json();
    if (!estado.tarefa.executando) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  assert.match(await readFile(join(pasta, "Modelfile"), "utf8"), /^FROM qwen3\.5:4b/);
  assert(instalados.includes("qwen3.5:4b")); assert(instalados.includes("ideon:latest"));
  assert.equal((await post("/api/configuracao", { principal: "", codigo: "", personalizada: true })).status, 200);
  await post("/api/ideon", pergunta()); assert.equal(chamadas.at(-1).model, "ideon:latest");
  await post("/api/ideon", pergunta("code", { modeloTeste: "qwen3.5:4b" })); assert.equal(chamadas.at(-1).model, "qwen3.5:4b");
});

test("recupera preferências depois de reiniciar o servidor", async () => {
  const terminou = once(processo, "exit"); processo.kill(); await terminou;
  processo = spawn(process.execPath, [join(__dirname, "..", "servidor.js")], {
    env: ambienteServidor, stdio: ["ignore", "pipe", "pipe"],
  });
  await once(processo.stdout, "data");
  const estado = await (await fetch(url + "/api/estado")).json();
  assert.equal(estado.configuracao.personalizada, true);
  assert.equal(estado.configuracao.processamento, "cpu");
  await post("/api/ideon", pergunta()); assert.equal(chamadas.at(-1).model, "ideon:latest");
});
