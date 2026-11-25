# Cursores do ideon

Gerados com a ferramenta integrada de geração de imagens, com fundo transparente.
Referência usada: `cursor-ideon-navegar.png` que já existia no projeto. A foto
mencionada na solicitação não estava anexada à mensagem.

Os três originais nesta pasta têm 1254 × 1254 pixels. As versões na raiz
(`cursor-ideon-navegar.png`, `cursor-ideon-clicar.png`, `cursor-ideon-segurar.png`)
foram reduzidas para 32 × 32 pixels, preservando o canal alfa para uso no navegador.
O ponto de interação é o mesmo nos três estados para manter a posição da luva.

## Prompts usados

- Navegar: usar o cursor existente como referência principal; uma luva branca
  arredondada, contorno preto uniforme, punho largo, indicador quase vertical
  levemente inclinado à esquerda, outros dedos recolhidos e polegar visível.
  Silhueta completa, margem transparente, sem texto, sombra ou traços de movimento.
- Clicar: usar a imagem Navegar gerada como referência; preservar escala,
  contorno, palma e posição do punho; mudar apenas o indicador, dobrando-o
  para baixo para representar o botão pressionado. Mesmo fundo transparente.
- Segurar: usar a imagem Navegar gerada como referência; mesma escala, contorno
  e posição do punho; mão fechada vista de cima, dorso visível, quatro nós
  arredondados, pequenas separações entre eles e polegar totalmente escondido.
  Sem palma exposta, texto, sombras ou traços de movimento.

Os efeitos são desenhados exclusivamente por `cursor.js`, na camada existente
`rastro-cursor`, com `pointer-events: none`:

- `ideon-vento-e-fumaca.png`: oito recortes, quatro por linha. A primeira linha
  fornece as variações de vento durante movimentos rápidos; a segunda fornece
  a fumaça da freada. Cada emissão conserva sua variação até desaparecer.
- `ideon-scroll-dois-dedos.png`: três poses horizontais, exibidas individualmente
  na proporção original. A mão se desloca alguns pixels na direção da rolagem,
  retorna ao repouso e desaparece. Eventos próximos compartilham a animação.
  O fundo quadriculado opaco é removido uma vez em memória, pelas bordas,
  preservando o branco interno da luva e o PNG original.

O gesto usa o listener passivo de rolagem já compartilhado pela seleção de texto.
Movimento reduzido desativa os efeitos, preservando os estados estáticos.
Para conferir, reinicie o servidor, recarregue a apresentação e role para baixo
e para cima com o ponteiro sobre a página. O gesto aparece próximo do ponteiro.
