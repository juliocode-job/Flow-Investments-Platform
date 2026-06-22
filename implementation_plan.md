# Plano de Implementação: Histórico de Conversas, Cache Semântico, Observabilidade e Protocolo de Deploy

Este plano descreve o design técnico para as 5 melhorias solicitadas na plataforma **Flow Investment**:
1. Ajuste de opacidade e legibilidade no botão flutuante do Flow AI.
2. Histórico persistente de conversas do usuário com o agente.
3. Capacidade de apagar sessões de chat.
4. Mecanismo de Cache Normal (exato) e Cache Semântico (similaridade de cosseno) para respostas do agente, com invalidação automática em caso de transações.
5. Protocolo de Observabilidade (OpenTelemetry e Langfuse) e Protocolo de Deploy.

---

## User Review Required

> [!IMPORTANT]
> **Persistência de Histórico Multi-Sessão**:
> - Adicionaremos tabelas de banco de dados (`ChatSession` e `ChatMessage`) para que os usuários possam criar múltiplos tópicos de chat (como no ChatGPT), carregá-los a partir de uma lista no painel do agente e excluí-los.
> - O endpoint do agente `/agent/chat` será modificado para aceitar um `session_id` opcional. Se não for informado, uma nova sessão de chat será criada automaticamente baseando-se no primeiro termo da pergunta do usuário.
>
> **Cache Semântico em Python Puro (Sem Dependências Pesadas)**:
> - Para manter o ambiente enxuto, implementaremos um algoritmo vetorizado em Python Puro baseado em **Frequência de Termos (TF) e Similaridade de Cosseno**.
> - Se o usuário enviar uma pergunta com similaridade de cosseno `>= 0.82` em relação a uma pergunta anterior já respondida (ex: *"como está meu saldo?"* vs *"qual o meu saldo atual?"*), a resposta será obtida do cache semântico.
> - **Invalidação de Cache**: O cache de um usuário será completamente deletado sempre que uma transação de compra/venda de ativos for enviada com sucesso, garantindo que saldos e métricas financeiras nunca mostrem dados antigos e obsoletos.
>
> **Observabilidade com Langfuse e OpenTelemetry**:
> - Criaremos um módulo `observability.py` que inicializa o suporte a logs estruturados no formato OpenTelemetry e suporta callbacks da Langfuse caso as chaves `LANGFUSE_PUBLIC_KEY` e `LANGFUSE_SECRET_KEY` estejam presentes no arquivo `.env`.

---

## Proposed Changes

### Componente de Banco de Dados

#### [MODIFY] [database.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/database.py)
- Criar modelos SQLAlchemy:
  - `ChatSession`: `id`, `user_id`, `title`, `created_at`.
  - `ChatMessage`: `id`, `session_id`, `role`, `content`, `timestamp`.
  - `ChatCache`: `id`, `user_id`, `query`, `response`, `created_at`.
- Adicionar relacionamentos entre `User` e `ChatSession`, bem como `ChatSession` e `ChatMessage`.

### Lógica de Caching e Observabilidade no Backend

#### [NEW] [cache.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/modules/agent/cache.py)
- Implementar algoritmo de similaridade de cosseno para o cache semântico.
- Criar funções utilitárias:
  - `get_cached_response(db, user_id, query)`: Verifica cache exato e, se falhar, executa a busca de similaridade semântica `>= 0.82`.
  - `set_cache_response(db, user_id, query, response)`: Salva no banco.
  - `invalidate_user_cache(db, user_id)`: Limpa todo o cache do usuário (chamado após transações).

#### [NEW] [observability.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/observability.py)
- Implementar o logger estruturado compatível com o formato OpenTelemetry (OTel Trace/Span format).
- Suportar integrações com a API do Langfuse caso configurado no `.env` (registrando spans de chamadas do agente).

#### [MODIFY] [main.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/main.py)
- Incluir configurações adicionais de log ou middleware de telemetria base se necessário.

### Endpoints do Backend

#### [MODIFY] [router.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/modules/agent/router.py)
- Modificar o payload de `ChatRequest` para aceitar um `session_id` opcional.
- Integrar a checagem de cache (exato e semântico) no endpoint `/agent/chat`.
- Salvar automaticamente as mensagens do usuário e as respostas do agente nas tabelas `ChatSession` e `ChatMessage`.
- Criar novos endpoints de gerenciamento de chat:
  - `GET /agent/sessions`: Lista as sessões de chat do usuário logado.
  - `GET /agent/sessions/{session_id}/messages`: Recupera mensagens de uma sessão.
  - `DELETE /agent/sessions/{session_id}`: Apaga uma sessão e suas mensagens.

#### [MODIFY] [router.py](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/backend/app/modules/portfolio/router.py)
- Integrar a limpeza automática de cache (`invalidate_user_cache`) no endpoint de inserção de transações (`POST /portfolio/transactions`).

### Interface Frontend

#### [MODIFY] [AgentPanel.tsx](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/frontend/src/components/AgentPanel.tsx)
- Corrigir a opacidade no estilo do botão `floatingToggle` (alterar `background` para `rgba(30, 41, 59, 0.9)` ou similar para maior destaque).
- Adicionar menu lateral ou cabeçalho retrátil dentro do painel do agente para listar chats passados.
- Implementar botão "Novo Chat" no cabeçalho do painel do agente para limpar o chat atual e iniciar uma nova conversa.
- Integrar a exclusão de sessões (ícone de lixeira ao lado de cada chat no histórico).
- Enviar o `session_id` ativo no payload de envio de chat e atualizar o estado do componente com o id do chat ativo.

---

## Protocolo de Deploy

Criaremos um arquivo com as instruções e scripts de deploy:

#### [NEW] [DEPLOYMENT.md](file:///c:/Users/lemos/OneDrive/Área de Trabalho/AI Platform Embedded Agent/DEPLOYMENT.md)
- Especificar os requisitos de produção (PostgreSQL ao invés de SQLite, variáveis de ambiente necessárias).
- Incluir arquivo `Dockerfile` e `docker-compose.yml` para implantação simplificada em um servidor.
- Documentar etapas para deploy na AWS/DigitalOcean ou serviços como Render/Vercel.

---

## Verification Plan

### Automated Tests
- Executar `npm run build` no frontend para verificar conformidade.
- Executar validação de chamadas REST de histórico de chat e caching através de um script de teste em python no backend.

### Manual Verification
1. Abrir a aplicação, autenticar-se e verificar se o botão flutuante "Flow AI" está brilhante, visível e não-opaco.
2. Iniciar um chat, enviar uma mensagem. Confirmar que uma sessão foi criada no histórico.
3. Clicar em "Novo Chat", iniciar outro assunto, verificar se ambos aparecem listados e se é possível alternar entre eles.
4. Excluir uma das sessões de chat e confirmar que ela sumiu da lista.
5. Perguntar *"como está minha carteira?"* (a primeira resposta deve demorar o tempo normal do agente).
6. Limpar o chat e perguntar *"como está o meu portfólio?"* (deve obter resposta instantânea pelo cache semântico).
7. Fazer uma transação de compra na tabela e enviar novamente a pergunta do portfólio. Confirmar que o cache foi invalidado e a resposta foi recalculada com os dados atualizados da carteira.
