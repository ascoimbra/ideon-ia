// Teste real opcional. Não cria conversas nem altera o histórico do navegador.
const { readFile, writeFile } = require("node:fs/promises");
const { join } = require("node:path");
const endereco = process.env.IDEON_URL ?? "http://127.0.0.1:41983";

(async () => {
  const estado = await (await fetch(endereco + "/api/estado")).json();
  if (!estado.modelos) throw new Error(estado.erro ?? "Servidor indisponível.");
  const instalados = new Set(estado.modelos.map((m) => m.name));
  const testes = [
    { nome: "Contexto do Chat", modo: "chat", tag: "qwen3.5:4b", mensagens: ["Meu nome é Arthur.", { conteudo: "Olá, Arthur!" }, "Qual é meu nome? Responda em uma frase."] },
    { nome: "Organização no Work", modo: "work", tag: "qwen3.5:4b", mensagens: ["Transforme em uma lista de três tarefas: amanhã revisar orçamento, comprar materiais e entregar relatório. Seja breve."] },
    ...["qwen3.5:4b", "ideon:latest", "mimo-v2.6:9b-q4_K_M"].map((tag) => ({ nome: "Correção no Code", modo: "code", tag,
      mensagens: ["Corrija [1,2,3].map(n => { n * 2 }). Responda com um bloco de código JavaScript de uma linha e uma frase explicando o erro."] })),
  ].filter((t) => instalados.has(t.tag) && (!process.argv.includes("--codigo") || t.modo === "code"));
  let resultados = [];
  if (process.argv.includes("--codigo")) {
    try { resultados = JSON.parse(await readFile(join(__dirname, "verificacao-ia.json"), "utf8")).resultados.filter((r) => r.modo !== "code"); } catch {}
  }
  for (const teste of testes) {
    console.log("Testando:", teste.nome, teste.tag);
    const inicio = Date.now();
    try {
      const resposta = await fetch(endereco + "/api/ideon", { method: "POST", headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(300_000), body: JSON.stringify({ modo: teste.modo, modelo: "padrao", modeloTeste: teste.tag, esforco: teste.modo === "code" ? 1 : 0, mensagens: teste.mensagens }) });
      const retorno = await resposta.json();
      resultados.push({ ...teste, status: resposta.status, ...retorno, tempoTotalSegundos: Math.round((Date.now() - inicio) / 100) / 10 });
      console.log(resposta.status, retorno.segundos ?? "—", "s", retorno.conteudo?.slice(0, 160) ?? retorno.erro);
    } catch (erro) { resultados.push({ ...teste, erro: erro.message }); console.error(erro.message); }
    await writeFile(join(__dirname, "verificacao-ia.json"), JSON.stringify({ data: new Date().toISOString(), resultados }, null, 2), "utf8");
  }
  if (resultados.some((r) => r.status !== 200)) process.exitCode = 1;
})().catch((erro) => { console.error(erro); process.exitCode = 1; });
