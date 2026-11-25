# Entrega do ideon IA

O site pessoal está implementado na pasta do projeto e conectado ao Ollama local. Abra `http://127.0.0.1:41983` enquanto o servidor estiver rodando. Para iniciar novamente, abra `Iniciar Ideon.bat`.

## Funcionalidades entregues

- Chat com contexto recente, boas-vindas, nome do perfil e saudação por horário local.
- Work com instruções para resumos, organização, planejamento e rascunhos.
- ideon Code com instruções para programação, respostas formatadas e cópia de código.
- Histórico local, projetos, fixação, renomeação, arquivamento, restauração e exclusão confirmada.
- Anexos de texto e código, microfone com transcrição, indicador de volume, cancelamento e interrupção da resposta.
- Modelos e cinco esforços dentro do campo de mensagem no Chat e no Work.
- Preferências de nome e tema, backup JSON e seleção de modelos locais.
- Painel para instalar modelos, comparar respostas e tempos e guardar perguntas de avaliação.
- Modelo personalizado `ideon:latest` e `Modelfile`, preservando o Qwen original.
- Fila de geração e descarregamento ao terminar para evitar vários modelos carregados pelo site ao mesmo tempo.

## Instalação e validação

Foram instalados Qwen3.5 de 4B, 2B e 0.8B e MiMo de 9B quantizado. O Qwen2.5 Coder existente foi preservado. Os três modos devolveram respostas reais pelo servidor e pelo Ollama. Os arquivos `verificacao-*.json` registram as amostras e os tempos.

Os 12 testes automatizados passaram, incluindo os cinco esforços, instruções dos modos, fila de geração, persistência de configuração após reiniciar, criação do modelo personalizado, segurança da formatação e faixas da saudação. A verificação de sintaxe também passou.

A comparação de código mostrou explicações incorretas no esforço Médio, inclusive no MiMo e na versão personalizada. O MiMo não demonstrou vantagem nessa amostra. Por isso, o Qwen3.5-4B permanece como padrão e a personalização fica disponível para avaliação, desativada nas preferências iniciais. Essa amostra não é uma avaliação geral da capacidade dos modelos.

Padrão, Phos e Versos também responderam com os modelos esperados em chamadas reais. Um teste adicional de Código com raciocínio ampliado foi cancelado pelo limite de espera do cliente de teste Node, após 300 segundos, sem resposta completa. O registro está em `verificacao-raciocinio.json`; não se considera esse teste aprovado. Os níveis altos podem ser demorados nesta máquina.

## Conferências ainda pendentes

- Conferência visual e interação real em navegador largo e estreito: a ferramenta de navegador não respondeu durante a implementação.
- Teste com a conexão de internet fisicamente desligada; a integração de texto usa endereços locais, mas esse cenário não foi executado.
- Teste do microfone com a sua voz e as permissões do navegador. A transcrição depende do suporte do navegador e pode usar internet.

Anexos processam texto UTF-8 e código; PDF, imagens e DOCX não são interpretados. O site é local, sem publicação pública ou sincronização de contas. A versão personalizada usa instruções próprias, sem treinamento dos pesos. LoRA permanece como experimento opcional posterior, conforme a proposta.

Consulte `README.md` para operação, limites e localização dos dados.
