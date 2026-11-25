// Reaproveita os mesmos controles e dados em todas as larguras.
(() => {
  const compacto = matchMedia("(max-width: 1023px)");
  const lateral = document.getElementById("navegacao-mobile");
  const abrir = document.getElementById("abrir-navegacao");
  const fechar = document.getElementById("fechar-navegacao");
  const fundo = document.getElementById("fundo-navegacao");
  const conteudo = document.getElementById("inicio");
  const topo = document.getElementById("topo-mobile");
  let aberto = false;

  function alternar(valor, devolverFoco = true) {
    aberto = compacto.matches && valor;
    lateral.classList.toggle("navegacao-aberta", aberto);
    lateral.inert = compacto.matches && !aberto;
    conteudo.inert = aberto;
    topo.inert = aberto;
    fundo.hidden = !aberto;
    abrir.setAttribute("aria-expanded", String(aberto));
    if (aberto) {
      lateral.setAttribute("role", "dialog");
      lateral.setAttribute("aria-modal", "true");
      fechar.focus();
    } else {
      lateral.removeAttribute("role");
      lateral.removeAttribute("aria-modal");
      // Um popover ligado ao menu não deve permanecer flutuando após fechá-lo.
      lateral.querySelectorAll(":popover-open").forEach((painel) => painel.hidePopover());
      if (devolverFoco && compacto.matches) abrir.focus();
    }
  }
  abrir.addEventListener("click", () => alternar(true));
  fechar.addEventListener("click", () => alternar(false));
  fundo.addEventListener("click", () => alternar(false));
  document.getElementById("novo-chat-mobile").addEventListener("click", () => {
    document.getElementById("novo-chat").click();
    document.getElementById("mensagem").focus();
  });
  lateral.addEventListener("click", (evento) => {
    const alvo = evento.target.closest("button, a");
    if (!aberto || !alvo) return;
    // Projetos ficam abertos para permitir escolher uma conversa dentro deles.
    if (alvo.matches('#novo-chat, [data-atalho], [data-abrir-conversa], [data-espaco], [data-destino-pessoal], #sair-ideon')) {
      alternar(false, !document.querySelector("dialog[open]"));
    }
  });
  document.addEventListener("keydown", (evento) => {
    if (!aberto || document.querySelector("dialog[open], :popover-open")) return;
    if (evento.key === "Escape") { evento.preventDefault(); alternar(false); }
    if (evento.key !== "Tab") return;
    const itens = [...lateral.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), [tabindex="0"]')]
      .filter((item) => item.getClientRects().length && !item.closest("[inert]"));
    const primeiro = itens[0], ultimo = itens.at(-1);
    if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo?.focus(); }
    else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro?.focus(); }
  });
  compacto.addEventListener("change", () => {
    const focoNaLateral = lateral.contains(document.activeElement);
    alternar(false, false);
    if (compacto.matches && focoNaLateral) abrir.focus();
  });
  function ajustarAltura() {
    const altura = Math.round(window.visualViewport?.height ?? innerHeight);
    document.documentElement.style.setProperty("--altura-visivel", altura + "px");
    document.body.classList.toggle("janela-baixa", compacto.matches && altura < 500);
  }
  window.visualViewport?.addEventListener("resize", ajustarAltura);
  window.addEventListener("resize", ajustarAltura);
  alternar(false, false);
  ajustarAltura();
})();
