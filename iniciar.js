const { spawn } = require("node:child_process");
const { join } = require("node:path");
const portaIdeon = Number(process.env.IDEON_PORT ?? 41983);
const urlIdeon = `http://127.0.0.1:${portaIdeon}`;

async function estaAtivo(url, validar) {
  try {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return resposta.ok && validar(await resposta.json());
  } catch { return false; }
}

(async () => {
  console.log(`\nideon IA: ${urlIdeon}`);
  console.log(`Aplicativo: ${urlIdeon}/app`);
  console.log("No VS Code: Ctrl+Shift+P > Simple Browser: Show > cole o endereço acima.\n");
  if (await estaAtivo(urlIdeon + "/api/saude", (r) => r.aplicacao === "ideon")) {
    console.log("O servidor do ideon já está aberto. Use o endereço acima.");
    return;
  }
  const urlOllama = process.env.IDEON_OLLAMA ?? "http://127.0.0.1:11434";
  if (!await estaAtivo(urlOllama + "/api/tags", (r) => Array.isArray(r.models))) {
    if (!process.env.IDEON_OLLAMA) {
      console.log("Iniciando o Ollama local…");
      const ollamaLocal = spawn("ollama", ["serve"], { windowsHide: true, detached: true, stdio: "ignore" });
      ollamaLocal.on("error", () => console.error("Abra o aplicativo Ollama para receber respostas da IA."));
      ollamaLocal.unref();
    } else console.log("Ollama indisponível no endereço configurado. Confira IDEON_OLLAMA.");
  }
  console.log("Mantenha este terminal aberto enquanto usa o ideon.");
  const servidorLocal = spawn(process.execPath, [join(__dirname, "servidor.js")], { stdio: "inherit", windowsHide: true });
  servidorLocal.on("error", (erro) => { console.error("Não foi possível iniciar o servidor:", erro.message); process.exitCode = 1; });
  servidorLocal.on("exit", (codigo) => { process.exitCode = codigo ?? 0; });
})().catch((erro) => { console.error(erro.message); process.exitCode = 1; });
