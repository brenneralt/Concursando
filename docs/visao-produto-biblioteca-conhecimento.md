# Visão de produto: biblioteca comunitária de conhecimento

> **Propósito:** centralizar, organizar, relacionar e compartilhar conhecimento para que as pessoas não precisem encontrar e organizar o mesmo material separadamente.

Este documento registra a direção do produto e as decisões discutidas para orientar o desenvolvimento futuro. Ele é um guia vivo, não uma autorização para implementar todas as etapas de uma vez. Atualize-o quando uma decisão mudar e marque as etapas concluídas somente depois de validar a implementação.

## 1. Visão

O Concursando começou como uma plataforma de estudo por questões. A direção desejada é evoluir, gradualmente, para uma plataforma em que questões, assuntos, explicações, aulas, documentos e referências possam ser encontrados e relacionados em uma biblioteca compartilhada.

A questão deve ser uma porta de entrada para o conhecimento, não o único centro da aplicação. Uma pessoa pode chegar a um conteúdo por uma questão, pela busca de um assunto ou pela própria biblioteca.

Princípio central:

**Em vez de três pessoas organizarem o mesmo conteúdo separadamente, a comunidade constrói uma biblioteca compartilhada.**

Exemplo: uma pessoa cadastra uma aula sobre crase; outra associa a mesma aula a uma questão diferente; uma terceira acrescenta um PDF de exercícios. O recurso é cadastrado uma vez e pode ser relacionado a muitos assuntos e questões, respeitando sua visibilidade e as permissões de uso.

## 2. Escopo inicial e princípios

- **Grupo inicial:** uso pessoal e compartilhado com aproximadamente até 10 pessoas. Não projetar agora para milhares de usuários nem criar complexidade de produto comercial.
- **Acesso controlado:** cadastro por e-mail, confirmação do endereço e aprovação manual do administrador antes de utilizar a plataforma.
- **Free first:** priorizar ferramentas, planos e serviços gratuitos. Não introduzir serviços pagos ou dependências externas sem necessidade comprovada.
- **Privacidade por padrão:** recursos pessoais e links privados não devem ser publicados por acidente.
- **Fonte independente:** a biblioteca não deve depender de YouTube, Drive ou Telegram. Cada serviço é apenas uma possível origem de um recurso.
- **Reutilização:** cadastrar um recurso uma vez e permitir relacioná-lo a muitos assuntos e questões.
- **Compartilhamento responsável:** registrar autoria, proveniência, licença e permissões. Ter acesso a um curso ou arquivo não significa ter direito de redistribuí-lo.
- **Implementação incremental:** primeiro autorização; depois biblioteca e compartilhamento; integrações mais sofisticadas somente quando o núcleo estiver funcionando.

## 3. Ordem de prioridade

A ordem abaixo é intencional. Não implementar a biblioteca de cursos ou expor materiais privados antes de existir controle de acesso confiável.

### Etapa 0 — Registrar a direção do produto

**Estado:** documentado neste arquivo.

- Preservar a visão, os princípios e a ordem das próximas etapas.
- Revisar este roadmap quando decisões de produto ou arquitetura mudarem.

### Etapa 1 — Cadastro com aprovação administrativa

**Prioridade imediata — ainda não implementada.**

Fluxo esperado:

1. A pessoa cria uma conta com e-mail, senha e apelido.
2. A pessoa confirma o e-mail, conforme a configuração do Supabase Auth.
3. A conta recebe o estado `pending` e não pode utilizar as áreas protegidas.
4. O administrador consulta a solicitação no painel e aprova ou bloqueia o acesso.
5. Uma conta aprovada pode utilizar a plataforma; uma conta bloqueada perde o acesso sem precisar ser excluída.
6. O administrador pode reativar uma conta bloqueada.

Estados iniciais:

- `pending`: cadastro concluído, aguardando análise.
- `approved`: acesso liberado.
- `blocked`: acesso suspenso pelo administrador.

Painel administrativo mínimo:

- Listar usuários e seus estados.
- Filtrar solicitações pendentes, aprovadas e bloqueadas.
- Aprovar uma solicitação.
- Bloquear e reativar uma conta.
- Exibir e-mail, apelido, data de cadastro e data da última decisão, quando disponível.

Decisões de segurança obrigatórias:

- A autorização deve ser aplicada no banco de dados/RLS e nas rotas da aplicação. Esconder páginas ou botões no frontend não constitui controle de acesso suficiente.
- Não guardar `role` ou `status` em metadados editáveis pelo próprio usuário.
- Preferir uma tabela de autorização separada (por exemplo, `user_access`) ou mecanismo equivalente, com políticas que impeçam usuários comuns de alterar o próprio papel ou estado.
- O administrador inicial deve ser promovido por procedimento manual e seguro no banco, após a criação da conta. Não criar um botão público para se tornar administrador.
- Ações administrativas devem verificar o papel do administrador no servidor/banco; nunca confiar em um valor enviado pelo navegador.
- Nunca colocar a chave Supabase `service_role` no frontend, em arquivos públicos ou em variáveis `VITE_*`.
- Registrar quem aprovou/bloqueou e quando, para manter rastreabilidade.
- A interface deve informar claramente quando o acesso está aguardando aprovação ou foi bloqueado.

Capacidade inicial:

- Planejar o grupo inicial para até 10 pessoas.
- Não espalhar o número 10 como constante pelo código. Caso se deseje impor o limite, fazê-lo por configuração administrativa no banco.
- Definir durante a implementação se a vaga do administrador conta ou não no limite total.

Observações sobre o estado atual:

- O projeto já utiliza Supabase Auth, possui a tabela `profiles`, a tabela `progresso` e a rota `RotaProtegida.jsx`.
- O fluxo atual verifica apenas a existência de sessão; ainda não há aprovação administrativa.
- A migration inicial `supabase/migrations/0001_schema_rls.sql` deve ser preservada. A autorização deve entrar em uma nova migration versionada, por exemplo `0002_user_access.sql`.
- Revisar cuidadosamente as permissões de atualização em `profiles`: usuários não podem conseguir alterar campos de autorização.
- O catálogo de questões é atualmente JSON estático. O controle de acesso à aplicação não torna esse arquivo privado. Acesso privado aos dados do catálogo é uma questão separada e deverá ser avaliada antes de publicar conteúdo que realmente precise de confidencialidade.

**Critérios de conclusão:** cadastro e confirmação de e-mail funcionam; usuário pendente não acessa as áreas protegidas; usuário aprovado acessa; usuário bloqueado perde acesso inclusive ao tentar reutilizar uma sessão; usuários comuns não conseguem promover a si mesmos nem alterar permissões; somente o administrador consegue aprovar, bloquear e reativar; as políticas RLS foram testadas.

### Etapa 2 — Biblioteca de recursos (MVP)

**Dependência:** Etapa 1 concluída.

Criar uma biblioteca independente das questões e dos materiais de leitura já existentes.

Não reutilizar `materiais`/`material_id` para vídeos e links. Essa estrutura atual representa textos de apoio associados às questões. Recursos de estudo têm outro ciclo de vida e outros metadados.

Modelo conceitual inicial:

- **Assunto:** entidade estável do catálogo de conhecimento, com nome, identificador/slug e possível relação pai-filho.
- **Recurso:** conteúdo externo ou referência cadastrada uma única vez; possui título, descrição, tipo, provedor/origem, URL, autor/contribuidor, proveniência, licença, visibilidade e estado de revisão.
- **Recurso ↔ assunto:** relação muitos-para-muitos. Uma aula pode abordar vários assuntos e um assunto pode ter muitos recursos.
- **Recurso ↔ questão:** relação muitos-para-muitos opcional. Um recurso pode ajudar em diversas questões e uma questão pode ter vários recursos.

Tipos e origens devem ser campos distintos. Exemplo: tipo `video`, origem `youtube`; tipo `document`, origem `google_drive`; tipo `video`, origem `telegram`.

Visibilidade inicial sugerida:

- `private`: somente o proprietário/admin autorizado.
- `shared`: compartilhado com pessoas autorizadas pelo proprietário ou administrador.
- `public`: disponível a todos os usuários aprovados da comunidade.

Estado editorial sugerido:

- `pending`: aguardando revisão, quando a contribuição exigir aprovação.
- `approved`: liberado conforme sua visibilidade.
- `rejected`: não aprovado, mantendo justificativa interna quando apropriado.
- `archived`: removido da descoberta normal, sem perder histórico ou relacionamentos.

Funcionalidades mínimas:

- Cadastrar, editar e arquivar um recurso.
- Pesquisar e filtrar por disciplina/assunto, tipo e origem.
- Exibir os recursos associados a um assunto.
- Exibir os recursos associados a uma questão.
- Abrir o conteúdo na plataforma de origem; não copiar nem hospedar os vídeos no Concursando.
- Mostrar autoria, fonte e indicação de licença/permissão.
- Evitar duplicação do mesmo recurso, usando URL canônica normalizada quando possível.

A primeira versão pode permitir cadastro manual de links. Não precisa de API do YouTube, integração OAuth com Drive ou MCP para funcionar.

### Etapa 3 — Contribuição e biblioteca compartilhada

**Dependência:** Etapa 2 concluída.

Permitir que os usuários aprovados proponham recursos para a biblioteca comunitária.

Fluxo recomendado:

1. Um colaborador cadastra um recurso e informa origem, assunto, autoria e condição de uso.
2. O recurso fica pendente de revisão se a política da comunidade exigir moderação.
3. O administrador aprova, rejeita ou pede correção.
4. Depois de aprovado, o recurso aparece para os membros conforme sua visibilidade.
5. A página do recurso identifica quem contribuiu e permite relacioná-lo a outros assuntos e questões.

Começar com moderação simples pelo administrador. Não construir sistema complexo de reputação, votação ou denúncias para um grupo de até 10 pessoas.

**Regra essencial:** conteúdo público deve ser aberto ou ter autorização expressa para compartilhamento. Links de acesso a cursos privados, convites de grupos, arquivos protegidos e materiais de terceiros não devem ser transformados em recursos públicos apenas porque um membro consegue acessá-los.

### Etapa 4 — Integrações com provedores

**Dependência:** Etapas 1 e 2 concluídas; Etapa 3 conforme a necessidade.

As integrações devem ser adaptadores que alimentam o modelo genérico de recursos. O núcleo da biblioteca não deve conter regras específicas de cada provedor.

- **YouTube:** a pesquisa por URL pode continuar sem API e sem custo de cota. Melhorar a geração de termos a partir do assunto catalogado. Compartilhar o mesmo componente de recursos entre treino e simulado.
- **Google Drive:** começar aceitando links de visualização fornecidos pelo usuário. Avaliar OAuth/API somente se cadastro manual se tornar um problema. Respeitar permissões do arquivo original e não presumir que um link privado será acessível por todos.
- **Telegram:** começar com cadastro manual de links de mensagens/canais e metadados. Uma futura ferramenta local pode ajudar o próprio titular da conta a organizar conteúdo a que tem acesso, mas precisa de avaliação específica de segurança, privacidade e termos da plataforma.
- **Importação/backup:** considerar importação e exportação de metadados para que a biblioteca não fique presa a um único fornecedor.

Cuidados específicos do Telegram:

- Não assumir que um bot convencional consegue ler todo o histórico de grupos.
- Não criar raspagem indiscriminada de grupos, download em massa ou republicação de cursos.
- Não enviar mensagens ou arquivos de conversas a serviços externos de IA sem uma base legítima, autorização e revisão dos termos aplicáveis.
- Antes de qualquer automação, revisar a documentação e os termos vigentes do Telegram, as permissões da conta e os direitos sobre os materiais.
- Preferir referências às mensagens originais quando isso for adequado e permitido; não armazenar cópias de arquivos protegidos sem autorização.

### Etapa 5 — Descoberta e inteligência sobre o conhecimento

**Futuro; não é requisito para o MVP.**

Quando houver uma biblioteca útil e dados suficientes:

- Busca melhor por sinônimos, tags e assuntos relacionados.
- Sugestões de recursos a partir de questões e assuntos.
- Mapa/grafo navegável de assuntos, questões e recursos.
- Identificação assistida de possíveis duplicatas.
- Busca semântica, somente quando houver benefício claro, custo previsível e uma política de dados adequada.

Não introduzir embeddings, banco vetorial ou IA generativa antes de validar a busca tradicional e a taxonomia. A IA deve ajudar a organizar e descobrir conhecimento, não ser dependência para abrir a biblioteca.

## 4. Arquitetura desejada

Separar três responsabilidades:

1. **Aplicação Concursando:** experiência de estudo, questões, simulados, catálogo, biblioteca e contribuições.
2. **Base de conhecimento:** assuntos, recursos, autores, proveniência, permissões, revisões e relações entre entidades.
3. **Conectores:** mecanismos opcionais para pesquisar, importar ou atualizar metadados de serviços externos.

Fluxo conceitual:

`YouTube / Drive / Telegram / Cadastro manual`
→ `Conectores ou cadastro`
→ `Biblioteca de recursos`
↔ `Assuntos`
↔ `Questões`
→ `Experiência de estudo`

Regras de arquitetura:

- O modelo de recurso deve ser independente do provedor.
- A mesma entidade de recurso deve ser reutilizada por várias questões e assuntos.
- A fonte original deve ser preservada; o Concursando cataloga e relaciona, não precisa hospedar o arquivo.
- Dados privados e permissões devem ser controlados no banco, não por convenções de frontend.
- Não armazenar tokens, cookies, sessões do Telegram, links privados ou segredos no repositório.
- Segredos de integração ficam em ambiente seguro, nunca em código entregue ao navegador.
- Cada integração deve poder ser desativada sem quebrar a biblioteca.
- Manter capacidade de exportar metadados e relacionamentos.

## 5. Custos e operação

O objetivo é manter o projeto gratuito para o grupo inicial sempre que viável.

Diretrizes:

- Priorizar o plano gratuito do Supabase e serviços com camada gratuita.
- Não hospedar vídeos no banco ou no frontend.
- Armazenar metadados e links para as fontes originais.
- Evitar APIs pagas quando uma busca por URL ou cadastro manual resolve.
- Não assumir que planos gratuitos são ilimitados ou permanentes: verificar limites, pausa por inatividade, cotas e termos antes de cada integração.
- Fazer estimativa de armazenamento/tráfego antes de ampliar o número de usuários.
- Manter uma alternativa de exportação/backup para dados da biblioteca.

O plano gratuito reduz o custo, mas não elimina os limites operacionais, de armazenamento, tráfego ou termos de uso dos provedores.

## 6. Fora do escopo inicial

Não implementar agora:

- Pagamentos, assinaturas ou planos comerciais.
- Suporte a milhares de usuários.
- Hospedagem própria de vídeos.
- Download automático de todos os cursos ou históricos do Telegram.
- Múltiplos níveis complexos de moderação.
- Reputação, pontos ou gamificação de contribuidores.
- Busca vetorial ou agentes de IA como requisito para o funcionamento básico.
- Integrações OAuth completas antes de validar a biblioteca manual.

## 7. Decisões ainda abertas

Registrar uma decisão nesta seção quando o tema for necessário, em vez de antecipar complexidade:

- O limite inicial de 10 contas inclui a conta administradora?
- Recursos `shared` serão compartilhados pelo próprio autor ou somente pelo administrador?
- Todas as contribuições da comunidade exigirão aprovação prévia ou apenas as públicas?
- Qual será a política de retenção para contribuições rejeitadas ou removidas?
- O catálogo de questões continuará público em JSON estático ou precisará de proteção no banco?
- Quais dados do Drive/Telegram podem ser armazenados e compartilhados segundo permissões e termos vigentes?

## 8. Como atualizar este roadmap

- Marcar uma etapa como concluída somente depois de implementação, testes e validação de segurança.
- Atualizar o estado e os critérios de conclusão quando houver mudança de escopo.
- Decisões novas devem ser registradas aqui ou em um documento de decisão arquitetural (ADR) quando forem relevantes.
- Não implementar automaticamente todas as etapas ao ler este documento.
- Antes de começar uma etapa, revisar se as premissas continuam válidas e se o grupo, os custos ou os provedores mudaram.

## 9. Referências internas e externas

- Autenticação e progresso atuais: `src/features/conta/`, `src/features/desempenho/useProgress.js` e `src/services/supabase.js`.
- Proteção de rotas atual: `src/components/RotaProtegida.jsx`.
- Schema atual do Supabase: `supabase/migrations/0001_schema_rls.sql`.
- Textos de apoio às questões: `src/features/questoes/enunciado.js` e `docs/dados.md`.
- Direitos de uso do catálogo atual: `docs/dados.md`.
- Telegram API Terms: https://telegram.org/tos
- Telegram API documentation: https://core.telegram.org/api
- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
