const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

class Elemento {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this._texto = ""; }
  set textContent(texto) { this._texto = String(texto); this.children = []; }
  get textContent() { return this._texto + this.children.map((c) => c.textContent).join(""); }
  append(...elementos) { this.children.push(...elementos); }
  addEventListener(tipo, acao) { this.listeners[tipo] = acao; }
  setAttribute(nome, valor) { this.attributes[nome] = valor; }
}
function encontrar(elemento, tag) { return [elemento, ...elemento.children.flatMap((c) => encontrar(c, tag))].filter((e) => e.tag === tag); }
let copiado;
const contexto = vm.createContext({ document: { createElement: (tag) => new Elemento(tag), createTextNode: (texto) => {
  const no = new Elemento("#text"); no.textContent = texto; return no;
} }, navigator: { clipboard: { writeText: async (texto) => { copiado = texto; } } }, setTimeout: () => {} });
vm.runInContext(readFileSync(join(__dirname, "..", "renderizador.js"), "utf8"), contexto);
const renderizar = (texto) => contexto.renderizarResposta(texto);

test("identifica prévia sem API e permite tentar novamente sem descartar a mensagem", async () => {
  const app = readFileSync(join(__dirname, "..", "app.js"), "utf8");
  const elementos = { "conexao-servidor": { hidden: true }, "mensagem-conexao": {}, mensagem: { value: "Minha pergunta" } };
  let saudavel = false;
  const ambiente = vm.createContext({
    porId: (id) => elementos[id], location: { protocol: "file:" }, AbortSignal,
    fetch: async () => ({ ok: true, json: async () => { if (!saudavel) throw new SyntaxError("HTML em vez de API"); return { aplicacao: "ideon" }; } }),
  });
  vm.runInContext(app.slice(app.indexOf("let verificacaoServidor;"), app.indexOf("function lerDados()")), ambiente);
  assert.equal(await ambiente.verificarServidor(), false);
  assert.equal(elementos["conexao-servidor"].hidden, false);
  ambiente.location.protocol = "http:";
  assert.equal(await ambiente.verificarServidor(), false);
  assert.equal(elementos.mensagem.value, "Minha pergunta");
  saudavel = true;
  assert.equal(await ambiente.verificarServidor(), true);
  assert.equal(elementos["conexao-servidor"].hidden, true);
});

test("copia apenas o código, mantendo espaços e quebras de linha", async () => {
  const resposta = renderizar('Veja a correção:\n```javascript\nfunction soma(a, b) {\n  return a + b;\n}\n```\n**Pronto.**');
  assert.equal(encontrar(resposta, "pre").length, 1);
  assert.equal(encontrar(resposta, "strong")[0].textContent, "Pronto.");
  await encontrar(resposta, "button")[0].listeners.click();
  assert.equal(copiado, "function soma(a, b) {\n  return a + b;\n}");
});
test("HTML é texto inerte e links só permitem HTTP ou HTTPS", () => {
  const resposta = renderizar('<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n[ruim](javascript:alert(1))\n[bom](https://example.com)');
  assert.equal(encontrar(resposta, "script").length, 0);
  assert.equal(encontrar(resposta, "img").length, 0);
  assert.equal(encontrar(resposta, "a").length, 1);
  assert.equal(encontrar(resposta, "a")[0].href, "https://example.com");
  assert.match(resposta.textContent, /<script>/);
});
test("formata títulos, listas, tabelas e bloco de código não encerrado", () => {
  const resposta = renderizar('# Título\n- Um\n- Dois\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```py\nprint(1)');
  assert.equal(encontrar(resposta, "h2").length, 1); assert.equal(encontrar(resposta, "li").length, 2);
  assert.equal(encontrar(resposta, "table").length, 1); assert.equal(encontrar(resposta, "th").length, 2);
  assert.equal(encontrar(resposta, "pre")[0].textContent, "print(1)");
});
test("saudação cobre todas as faixas e usa apenas o primeiro nome", () => {
  const app = readFileSync(join(__dirname, "..", "app.js"), "utf8");
  const inicio = app.indexOf("function saudacaoLocal(");
  const fim = app.indexOf("function atualizarSaudacao(", inicio);
  const contexto = vm.createContext({ dados: { perfil: {} } }); vm.runInContext(app.slice(inicio, fim), contexto);
  for (const [hora, esperado] of [[0,"Ainda acordado por aí?"],[3,"Ainda acordado por aí?"],[4,"Já de pé a essa hora?"],[5,"Já de pé a essa hora?"],[6,"Bom dia!"],[9,"Bom dia!"],[10,"Como vai a manhã?"],[11,"Como vai a manhã?"],[12,"Boa tarde!"],[17,"Boa tarde!"],[18,"Boa noite!"],[23,"Boa noite!"]]) {
    assert.equal(contexto.saudacaoLocal({ getHours: () => hora }, ""), esperado);
  }
  assert.equal(contexto.saudacaoLocal({ getHours: () => 12 }, " Arthur Silva "), "Boa tarde, Arthur!");
});
