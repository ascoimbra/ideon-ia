# ideon IA

O ideon IA é um assistente pessoal que roda neste computador. A interface abre no navegador, enquanto um servidor Node.js conecta o aplicativo ao Ollama instalado localmente. O GitHub Pages pode publicar uma apresentação estática, mas não executa o servidor Node.js nem disponibiliza o Ollama do seu computador.

## Iniciar neste computador

1. Instale o Node.js 22 ou mais recente e o Ollama.
2. Abra o Ollama e baixe ao menos um modelo compatível. O ideon usa por padrão modelos Qwen3.5 locais; Nous, Phos e Versos correspondem a `qwen3.5:4b`, `qwen3.5:2b` e `qwen3.5:0.8b`.
3. Abra esta pasta no VS Code e escolha **Terminal > Novo Terminal**.
4. No Windows, execute `npm.cmd start`. Também pode abrir `Iniciar Ideon.bat`.
5. Acesse http://127.0.0.1:41983 no navegador. Deixe o terminal e o Ollama em execução enquanto usa o app.

A primeira inicialização de um modelo pode levar mais tempo. Os pesos dos modelos ficam no armazenamento do Ollama e não devem ser copiados para este projeto ou enviados ao GitHub. As preferências locais do servidor ficam em `.ideon-config.json`, que é ignorado pelo Git.

## Acompanhar o projeto no GitHub

O código-fonte e o histórico de alterações ficam no repositório público [ascoimbra/ideon-ia](https://github.com/ascoimbra/ideon-ia). Qualquer pessoa pode ver o progresso e baixar os arquivos. Antes de cada publicação, confira a lista de arquivos do commit: `.ideon-config.json`, os arquivos `verificacao-*.json`, pesos de modelos e credenciais locais não devem ser enviados.

O repositório público mostra o código e o progresso, mas não deixa o chat disponível na internet. O GitHub Pages serve arquivos estáticos; ele pode hospedar a apresentação, mas não executa o servidor Node.js nem conecta visitantes ao Ollama deste computador. Para oferecer o chat pela internet seria necessário hospedar um servidor e configurar acesso aos modelos separadamente.

## Dados locais

Conversas e preferências de interface ficam no armazenamento do navegador. Configuração de modelos fica em `.ideon-config.json`. Esse arquivo e os resultados locais de verificação estão excluídos pelo `.gitignore`; confira a lista de arquivos do primeiro commit antes de publicá-lo.
