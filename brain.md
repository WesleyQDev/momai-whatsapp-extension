🧠 Plano de Reestruturação: MomAI Hybrid Brain

  1. Visão Geral
  Transformar o fluxo atual de "Inferência Sequencial" em um sistema de "Roteamento Semântico Híbrido" com "Recuperação Dinâmica de Ferramentas"
  (Tool RAG). O objetivo é reduzir o tempo de resposta (TTFT) e permitir que o sistema suporte centenas de extensões sem degradação de performance.

  2. Nova Arquitetura de Fluxo
  A entrada do usuário passará pelos seguintes filtros:

   1. Vetorização (Embeddings): A entrada é convertida em vetor usando Qwen3-Embedding-0.6B.
   2. Semantic Router (Caminho Curto):
       * Compara o vetor da entrada com "Intenções Conhecidas" (Ex: comandos de sistema, clima, lembretes).
       * Se a similaridade for > 0.85, pula o Orquestrador e vai direto para o Agente Especialista.
   3. Orquestrador LLM (Caminho Longo - Fallback):
       * Acionado apenas se o roteador estiver em dúvida.
   4. Tool RAG (Seleção Dinâmica):
       * Antes do Agente Especialista ser chamado, o sistema busca no banco de vetores as ferramentas mais relevantes para a consulta atual.
   5. Streaming de Status:
       * Em cada etapa, o backend emite eventos de "Thought" para a UI.

  3. Gestão de Capacidades (O problema de "O que você pode fazer?")
  Para que o sistema saiba descrever suas milhares de capacidades sem ler todas de uma vez, implementaremos:

   * Capability Indexing: Além das ferramentas individuais, indexaremos "Resumos de Extensões".
   * The Help Tool (Meta-Tool): Uma ferramenta especial que, quando o usuário pergunta sobre capacidades, realiza uma busca semântica no banco de
     ferramentas e retorna: "Eu identifiquei que tenho extensões para controlar seu Spotify, gerenciar arquivos e mais 50 funções relacionadas a
     produtividade. O que deseja?"
   * Dynamic System Prompt: O prompt do MomAgent incluirá um resumo dinâmico das extensões ativas, mas não a lista completa de funções.

  4. Implementação Técnica

  Fase 1: Motor de Embeddings e Vetorização
   * Integrar o modelo Qwen3-Embedding-0.6B-GGUF via llama-cpp-python ou similar.
   * Criar um gerenciador de banco vetorial local (FAISS ou LiteLLM) para armazenar:
       * Exemplos de intenções (para o roteador).
       * Manifestos de ferramentas (descrições das extensões).

  Fase 2: O Roteador Híbrido (Hybrid Router)
   * Substituir o nó inicial do LangGraph por um nó de lógica condicional baseado em distância de cosseno (vetores).
   * Implementar o "Streaming Prévio" no orchestrator.py para emitir status como {"status": "Identificando intenção..."}.

  Fase 3: Tool RAG
   * Modificar o carregamento das TOOLS para que sejam "Lazy Loaded".
   * Implementar o ToolRetriever que injeta apenas o top-K ferramentas relevantes no contexto do Agente.

  Fase 4: UX & Status
   * Atualizar a UI (React) para exibir os "Pensamentos/Status" de forma elegante acima da mensagem da assistente.

  5. Exemplo de Fluxo de Trabalho (Workflow)

   1. User: "Aumenta o volume e pesquise o preço do Bitcoin."
   2. Embeddings: Gera vetor da frase.
   3. Router: Identifica SystemAgent (volume) e SearchAgent (bitcoin) com alta confiança.
   4. Status (UI): "Ajustando sistema e pesquisando na web..."
   5. Tool RAG: Busca ferramentas system_control e ddg_search.
   6. Agent: Executa as duas ferramentas em paralelo ou sequência.
   7. Responder: "Volume ajustado, Senhor. O Bitcoin está custando..."

  ---

  Próximos Passos Sugeridos
   1. Criar o diretório apps/core/ai/embeddings para gerenciar o novo modelo.
   2. Indexar as ferramentas atuais do system_actions.py.

  ---

  Deseja que eu salve este plano no repositório agora? Tenho autorização para criar o arquivo docs/BRAIN_RESTRUCTURING.md.