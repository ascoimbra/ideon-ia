const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const vm = require("node:vm");

function preparar(aleatorio = () => 0, pixelsRolagem) {
  const eventos = {}, classes = new Set(), desenhos = [], imagens = [];
  const pagina = { scrollTop: 0 };
  let tempo = 0, quadro, angulo = 0, posicao = [0, 0];
  const contexto = {
    setTransform() {}, clearRect() {}, save() {}, restore() {},
    translate(x,y) { posicao = [x,y]; }, rotate(valor) { angulo = valor; },
    drawImage(imagem, ...args) { desenhos.push({imagem, args, angulo, posicao: [...posicao], alfa: this.globalAlpha}); },
    getImageData(x,y,w,h) { return { data: pixelsRolagem ?? new Uint8ClampedArray(w*h*4) }; }, putImageData() {},
  };
  const raiz = {
    classList: { add(...nomes) { nomes.forEach(n => classes.add(n)); }, remove(...nomes) { nomes.forEach(n => classes.delete(n)); } },
    addEventListener(tipo, acao) { eventos[tipo] = acao; },
  };
  const media = { matches: true, addEventListener(tipo, acao) { this.mudar = acao; } };
  const documento = { documentElement: raiz, scrollingElement: pagina, body: { append() {} },
    addEventListener() {}, querySelectorAll() { return []; },
    createElement(tipo) {
      const elemento = { getContext() { return contexto; }, setAttribute() {}, addEventListener(tipo, acao) { this[tipo] = acao; } };
      if (tipo === 'img') { elemento.naturalWidth = 1774; elemento.naturalHeight = 887; imagens.push(elemento); }
      return elemento;
    },
  };
  const ambiente = {
    document: documento,
    window: { addEventListener(tipo, acao) { (eventos[tipo] ??= []).push(acao); } },
    matchMedia(consulta) { return consulta.includes('forced-colors') ? { matches: false, addEventListener() {} } : media; },
    performance: { now() { return tempo; } }, Math: Object.assign(Object.create(Math), { random: aleatorio }),
    getComputedStyle(alvo) { return { cursor: alvo.cursor ?? 'pointer' }; },
    innerWidth: 800, innerHeight: 600, devicePixelRatio: 1,
    requestAnimationFrame(acao) { quadro = acao; return 1; }, cancelAnimationFrame() { quadro = undefined; },
  };
  vm.runInNewContext(readFileSync(require.resolve('../cursor.js'), 'utf8'), ambiente);
  function enviar(tipo, dados = {}, agora = tempo) {
    tempo = agora;
    const evento = { pointerType: 'mouse', pointerId: 1, button: 0, target: { closest() { return null; } }, ...dados };
    const acoes = eventos[tipo];
    for (const acao of Array.isArray(acoes) ? acoes : [acoes]) acao?.(evento);
  }
  return { classes, media, enviar, imagens,
    carregarRolagem() { const img = imagens.find(i => i.src.includes('scroll')); img.naturalWidth=9; img.naturalHeight=3; img.load(); },
    rolar(y,t) { pagina.scrollTop=y; enviar('scroll',{target:documento},t); },
    pintar(agora) { desenhos.length = 0; const acao=quadro; quadro=undefined; acao?.(agora); return [...desenhos]; },
  };
}

const arrastavel = { closest(seletor) {
  return seletor.includes("draggable") ? this : null;
} };

test("cursor alterna clique, arraste e retorno ao soltar ou perder o foco", () => {
  const c = preparar();
  c.enviar("pointerdown", { target: arrastavel, clientX: 100, clientY: 100 });
  assert.ok(c.classes.has("cursor-pressionado"));
  c.enviar("pointermove", { clientX: 110, clientY: 105 });
  assert.ok(c.classes.has("cursor-arrastando"));
  assert.ok(!c.classes.has("cursor-pressionado"));
  c.enviar("pointerup");
  assert.equal(c.classes.size, 0);
  c.enviar("pointerdown", { clientX: 0, clientY: 0 });
  c.enviar("blur");
  assert.equal(c.classes.size, 0);
});

test("selecionar texto mantém o cursor de texto até soltar", () => {
  const c = preparar();
  const target = { cursor: 'url("cursor-ideon-caneta.png") 6 2, text' };
  c.enviar("pointerdown", { target, clientX: 100, clientY: 100 });
  c.enviar("pointermove", { clientX: 120, clientY: 100 });
  assert.deepEqual([...c.classes], ["cursor-selecionando"]);
  c.enviar("pointerup");
  assert.equal(c.classes.size, 0);
});

function mover(c, x, y, tempo) {
  c.enviar("pointermove", { clientX: x, clientY: y }, tempo);
}

test('fundo da rolagem fica transparente sem apagar o branco dentro do contorno', () => {
  const pixels = new Uint8ClampedArray(9*3*4);
  for (let i=0;i<27;i++) pixels.set([246,246,246,255],i*4);
  // Contorno fechado em torno do pixel branco central de cada pose.
  for (let pose=0;pose<3;pose++) {
    for (const i of [pose*3+1, 9+pose*3, 9+pose*3+2, 18+pose*3+1]) pixels.set([20,20,20,255],i*4);
    pixels.set([255,255,255,255],(9+pose*3+1)*4);
  }
  const c=preparar(undefined,pixels); c.carregarRolagem();
  assert.equal(pixels[3],0);
  for (let pose=0;pose<3;pose++) {
    assert.equal(pixels[(9+pose*3+1)*4+3],255);
    assert.equal(pixels[(pose*3+1)*4+3],255);
  }
});

const direcoes = [[-60,0],[60,0],[0,-60],[0,60],[-60,-60],[-60,60],[60,-60],[60,60]];
const vento = formas => formas.filter(d => d.args[1] < 400);
const fumaca = formas => formas.filter(d => d.args[1] >= 400);

test('vento fica atrás da mão nas quatro direções e diagonais', () => {
  for (const [dx,dy] of direcoes) {
    const c=preparar(); mover(c,200,200,100); mover(c,200+dx,200+dy,116);
    const desenhos=vento(c.pintar(150)); assert.equal(desenhos.length,1);
    const d=desenhos[0]; assert.equal(d.angulo,Math.atan2(dy,dx));
    assert.deepEqual(d.posicao,[200+dx,200+dy]);
    const [,,,,x,,w]=d.args; assert.ok(x+w < -15); assert.ok(w<=38);
  }
});

test('cada emissão conserva o sorteio e os quatro recortes ficam separados', () => {
  for (let variacao=0;variacao<4;variacao++) {
    let sorteios=0;
    const c=preparar(() => { sorteios++; return (variacao+0.1)/4; });
    mover(c,200,200,100); mover(c,260,200,116);
    const inicial=vento(c.pintar(140))[0]; const posterior=vento(c.pintar(165))[0];
    assert.equal(sorteios,2); assert.deepEqual(inicial.args.slice(0,4),posterior.args.slice(0,4));
    const [sx,sy,sw,sh]=inicial.args;
    assert.ok(sx>=variacao*443 && sx+sw<=(variacao+1)*444);
    assert.ok(sy>=0 && sy+sh<443);
    mover(c,380,200,196); assert.equal(vento(c.pintar(205)).length,2); assert.equal(sorteios,4);
    assert.equal(c.imagens.filter(i=>i.src.includes('vento-e-fumaca')).length,1);
  }
});

test('vento acompanha a mão, inverte o lado e desaparece sem marcas', () => {
  const c=preparar(); mover(c,100,100,100); mover(c,160,100,116); c.pintar(145);
  mover(c,560,100,132); let d=vento(c.pintar(150))[0]; assert.equal(d.posicao[0],560);
  mover(c,500,100,148); d=vento(c.pintar(170))[0]; assert.equal(Math.abs(d.angulo),Math.PI);
  c.enviar('pointerleave'); assert.equal(c.pintar(190).length,0);
});

test('uma freada dispara uma fumaça, alterna formas e dissipa na última direção', () => {
  for (const [dx,dy] of direcoes) {
    const c=preparar(); mover(c,200,200,100); mover(c,200+dx,200+dy,116);
    const inicio=fumaca(c.pintar(210)); assert.equal(inicio.length,2);
    const fim=fumaca(c.pintar(440)); assert.equal(fim.length,2);
    for (const d of fim) { assert.equal(d.angulo,Math.atan2(dy,dx)); assert.ok(d.args[4]+d.args[6]<-15); }
    assert.ok(inicio[0].alfa>inicio[1].alfa); assert.ok(fim[1].alfa>fim[0].alfa);
    assert.ok(fim[1].args[6]>inicio[0].args[6]);
    assert.equal(c.pintar(700).length,0); assert.equal(c.pintar(800).length,0);
    mover(c,200,200,850); mover(c,200+dx,200+dy,866);
    const segunda=fumaca(c.pintar(960)); assert.notEqual(segunda[0].args[0],inicio[0].args[0]);
    for (const d of [...inicio,...segunda]) { const [x,y,w,h]=d.args; assert.ok(x>=0 && x+w<=1774 && y>=443 && y+h<=887); }
  }
});

test('desacelerar gradualmente não dispara fumaça; parar dispara apenas uma', () => {
  for (const [deslocamento,esperado] of [[2,true],[20,false]]) {
    const c=preparar(); mover(c,200,200,100); mover(c,260,200,116); mover(c,260+deslocamento,200,148);
    assert.equal(fumaca(c.pintar(248)).length>0,esperado);
    mover(c,261+deslocamento,200,264);
    assert.equal(c.pintar(750).length,0);
  }
});

test('movimento lento, toque e movimento reduzido não geram efeitos', () => {
  const c=preparar(); c.carregarRolagem(); mover(c,100,100,100); mover(c,102,100,116);
  assert.equal(c.pintar(150).length,0);
  c.enviar('pointermove',{pointerType:'touch',clientX:600,clientY:100},132); assert.equal(c.pintar(160).length,0);
  mover(c,500,100,148); c.pintar(170); c.media.matches=false; c.media.mudar();
  mover(c,700,100,180); c.rolar(60,190); assert.equal(c.pintar(210).length,0);
  c.enviar('pointerdown',{target:arrastavel,clientX:100,clientY:100}); mover(c,120,100,220);
  assert.ok(c.classes.has('cursor-arrastando'));
});

test('botão comum não inicia arraste e Esc restaura a mão', () => {
  const c=preparar(); c.enviar('pointerdown',{clientX:100,clientY:100}); mover(c,160,100,116);
  assert.ok(!c.classes.has('cursor-arrastando')); assert.ok(c.classes.has('cursor-pressionado'));
  c.enviar('keydown',{key:'Escape'}); assert.equal(c.classes.size,0);
});

test('rolagem agrupa eventos, mostra uma pose e volta ao repouso antes de sumir', () => {
  const c=preparar(); c.carregarRolagem(); c.rolar(20,100);
  const repouso=c.pintar(130); assert.equal(repouso.length,1); assert.equal(repouso[0].args[0],0);
  c.rolar(40,150); const pressionada=c.pintar(180); assert.equal(pressionada.length,1); assert.equal(pressionada[0].args[0],3);
  assert.ok(pressionada[0].args[5]>repouso[0].args[5]);
  const final=c.pintar(300); assert.equal(final.length,1); assert.equal(final[0].args[0],6);
  assert.ok(final[0].alfa<pressionada[0].alfa); assert.equal(c.pintar(500).length,0);
});

test('rolagem para cima desloca a mão para cima e preserva a proporção', () => {
  const c=preparar(); c.carregarRolagem(); c.rolar(100,100); c.pintar(500);
  c.rolar(80,600); const inicial=c.pintar(620)[0]; c.rolar(60,650); const ativa=c.pintar(690)[0];
  assert.ok(ativa.args[5]<inicial.args[5]);
  assert.equal(ativa.args[6]/ativa.args[7],ativa.args[2]/ativa.args[3]);
});

