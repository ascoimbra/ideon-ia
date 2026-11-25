// Renderização local: nenhum HTML retornado pelo modelo é executado.
function textoFormatado(destino, texto) {
  const partes = texto.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g);
  for (const parte of partes) {
    let elemento;
    if (parte.startsWith("`") && parte.endsWith("`")) {
      elemento = document.createElement("code"); elemento.textContent = parte.slice(1, -1);
    } else if (parte.startsWith("**") && parte.endsWith("**")) {
      elemento = document.createElement("strong"); elemento.textContent = parte.slice(2, -2);
    } else {
      const link = parte.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      if (link) {
        elemento = document.createElement("a"); elemento.textContent = link[1]; elemento.href = link[2];
        elemento.target = "_blank"; elemento.rel = "noopener noreferrer";
      }
    }
    destino.append(elemento ?? document.createTextNode(parte));
  }
}

function renderizarResposta(texto) {
  const conteudo = document.createElement("div");
  conteudo.className = "texto-resposta";
  const linhas = String(texto ?? "").replace(/\r\n/g, "\n").split("\n");
  for (let i = 0; i < linhas.length;) {
    const linha = linhas[i];
    const abertura = linha.match(/^\s*(`{3,}|~{3,})([^\s]*)\s*$/);
    if (abertura) {
      const cerca = abertura[1];
      const codigo = [];
      i++;
      while (i < linhas.length && !linhas[i].trim().startsWith(cerca)) codigo.push(linhas[i++]);
      if (i < linhas.length) i++;
      const bloco = document.createElement("section"); bloco.className = "bloco-codigo";
      const barra = document.createElement("div"); barra.className = "cabecalho-codigo";
      const linguagem = document.createElement("span"); linguagem.textContent = abertura[2] || "Código";
      const copiar = document.createElement("button"); copiar.type = "button"; copiar.textContent = "Copiar código";
      copiar.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(codigo.join("\n")); copiar.textContent = "Copiado ✓";
          setTimeout(() => { copiar.textContent = "Copiar código"; }, 1800);
        } catch { copiar.textContent = "Selecione e copie o código"; }
      });
      barra.append(linguagem, copiar);
      const pre = document.createElement("pre"); const code = document.createElement("code");
      code.textContent = codigo.join("\n"); pre.append(code); bloco.append(barra, pre); conteudo.append(bloco);
    } else if (!linha.trim()) { i++; }
    else if (i + 1 < linhas.length && linha.includes("|") && /^\s*\|?\s*:?-{3,}/.test(linhas[i + 1])) {
      const wrapper = document.createElement("div"); wrapper.className = "tabela-resposta";
      const tabela = document.createElement("table");
      const celulas = (s) => s.trim().replace(/^\||\|$/g, "").split("|");
      const adicionarLinha = (s, tipo) => {
        const tr = document.createElement("tr");
        for (const valor of celulas(s)) { const td = document.createElement(tipo); textoFormatado(td, valor.trim()); tr.append(td); }
        tabela.append(tr);
      };
      adicionarLinha(linha, "th"); i += 2;
      while (i < linhas.length && linhas[i].includes("|") && linhas[i].trim()) adicionarLinha(linhas[i++], "td");
      wrapper.append(tabela); conteudo.append(wrapper);
    } else {
      const titulo = linha.match(/^(#{1,6})\s+(.+)$/);
      const lista = linha.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
      if (lista) {
        const ordenada = /^\s*\d/.test(linha);
        const ul = document.createElement(ordenada ? "ol" : "ul");
        while (i < linhas.length) {
          const item = linhas[i].match(ordenada ? /^\s*\d+[.)]\s+(.+)$/ : /^\s*[-*+]\s+(.+)$/);
          if (!item) break;
          const li = document.createElement("li"); textoFormatado(li, item[1]); ul.append(li); i++;
        }
        conteudo.append(ul);
      } else {
        const p = document.createElement(titulo ? "h" + Math.min(titulo[1].length + 1, 6) : linha.startsWith("> ") ? "blockquote" : "p");
        textoFormatado(p, titulo ? titulo[2] : linha.replace(/^> /, "")); conteudo.append(p); i++;
      }
    }
  }
  return conteudo;
}
