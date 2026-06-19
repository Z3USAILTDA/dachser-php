Sistema analisado: **DACHSER/Z3US** (raiz do repositório). Sem código a alterar — entrega é o inventário em texto.

--- ALERTAS DE ACESSO E PRIVILÉGIO ---

1. **Autenticação própria fora do Supabase Auth, sem MFA.**
   - Evidência: `src/pages/Login.tsx` chama edge `mariadb-proxy` e persiste o usuário em `localStorage` (`useAuth.ts`, `useUserRole.ts`). Não há fluxo de OTP/TOTP/WebAuthn.
   - Impacto: credenciais comprometidas dão acesso direto à aplicação.
   - Recomendação: habilitar MFA (TOTP) obrigatório, ao menos para ADMIN/SUPERVISOR/FINANCEIRO, ou migrar autenticação para Supabase com `password_hibp_enabled` + MFA.

2. **Sessão sensível em `localStorage`.**
   - Evidência: `localStorage.setItem("user", ...)` em `Login.tsx`/`useAuth.ts`; flag `is_admin` lida do storage em `useUserRole.ts`.
   - Impacto: XSS = roubo de sessão + escalonamento, pois `is_admin` no client é confiado em fluxos de UI.
   - Recomendação: tokens httpOnly + validação server-side de papel a cada ação privilegiada.

3. **RLS permissivo por design (anon/authenticated com USING(true)).**
   - Evidência: memória `mem://infrastructure/...` e `security/no-supabase-auth-rls-restrictions.md`. Política do projeto: app usa auth MariaDB; tabelas Supabase ficam abertas a `anon`.
   - Impacto: qualquer um com a `SUPABASE_PUBLISHABLE_KEY` (exposta no bundle) consulta/escreve nas tabelas públicas via PostgREST.
   - Recomendação: restringir Data API ao mínimo necessário, mover dados sensíveis para tabelas acessadas só via edge functions com `service_role`, e/ou emitir JWT customizado para o usuário MariaDB validado por RLS.

4. **`SUPABASE_SERVICE_ROLE_KEY` disponível no ambiente das edge functions.**
   - Evidência: `<supabase-configuration>` lista o secret; várias funções (`create-user`, `mariadb-proxy`, `demurrage-invite-user`) o utilizam.
   - Impacto: bypass total de RLS se uma função tiver SSRF/prompt injection/log leakage.
   - Recomendação: revisar logs de cada função, evitar refletir input do usuário, restringir uso a operações que realmente exigem bypass.

5. **Credenciais de 4 bancos MariaDB de produção em secrets compartilhados.**
   - Evidência: `MARIADB_{AIR,SEA,OPS,FIN,CHARGES}_{HOST,USER,PASSWORD,DATABASE,PORT}` em Supabase secrets.
   - Impacto: comprometimento de uma edge function expõe 5 bases produtivas com usuário potencialmente amplo.
   - Recomendação: confirmar que cada usuário tem apenas SELECT/INSERT/UPDATE necessário (menor privilégio); criar usuários distintos read-only para funções de leitura (dashboards) vs write (sync/cron).

6. **`.env` com host/porta/usuário/senha do MariaDB AIR no projeto local.**
   - Evidência: `.env` (não exemplo) contém `MARIADB_AIR_PASSWORD` para o `server/index.js`.
   - Impacto: se versionado ou compartilhado, expõe DB de produção.
   - Recomendação: verificar `.gitignore`, rotacionar a senha, manter apenas `.env.example` no repo.

7. **Destinatário hardcoded `devs@z3us.ai` em emails de produção.**
   - Evidência: `supabase/functions/send-container-status-email/index.ts:281`, `regua-send-emails/index.ts:544`.
   - Impacto: vazamento de dados para mailbox compartilhada; conta compartilhada não-rastreável.
   - Recomendação: mover para variável e tratar `devs@z3us.ai` como conta de equipe com revisão de acesso.

8. **Múltiplas API keys de IA/3os sem rotação documentada.**
   - Evidência: `ANTHROPIC_API_KEY`, `CHB_ANTHROPIC_API_KEY`, `ANTHROPIC_FINANCEIRO_API_KEY`, `OPENAI_API_KEY`, `CHB_OPENAI_API_KEY`, `GEMINI_API_KEY`, `FIRECRAWL_API_KEY`, `HAPAG_API_KEY`, `LH_CARGO_APIKEY`, `JSONCARGO_API_KEY`, `FLIGHTRADAR_API_KEY`, `AZUL_API_PASSWORD`, `LEADCOMEX_API_TOKEN`, `MAPBOX_PUBLIC_TOKEN`.
   - Impacto: superfície ampla, custo financeiro em caso de leak.
   - Recomendação: catalogar dono/escopo de cada uma, rotacionar trimestralmente, preferir Lovable AI Gateway (`LOVABLE_API_KEY`) onde possível (memória já exige isso).

9. **SMTP com credenciais únicas e remetente único.**
   - Evidência: `SMTP_HOST/USER/PASS/PORT/FROM_EMAIL/FROM_NAME`.
   - Impacto: conta SMTP comprometida = phishing em nome do domínio.
   - Recomendação: SPF/DKIM/DMARC enforçados, conta dedicada por aplicação.

10. **Ausência de tabela de auditoria de login/acesso visível.**
    - Evidência: não há tabela `audit_log`/`login_attempts` no schema público listado; `forced_logouts` existe mas é só corte de sessão.
    - Impacto: incidentes de credencial não rastreáveis.
    - Recomendação: persistir login/falha/IP/UA em tabela append-only, com retenção.

11. **`is_admin` como flag única em `t_usuarios` (MariaDB).**
    - Evidência: `useUserRole.ts` confia em `parsed.is_admin` do localStorage.
    - Impacto: contradiz regra do prompt-base ("roles em tabela separada") — possível escalonamento.
    - Recomendação: migrar para tabela `user_roles` (Supabase já tem) como fonte da verdade, validada server-side.

12. **`server/index.js` (Node local) usa MariaDB de produção em desenvolvimento.**
    - Evidência: `.env` aponta `MARIADB_AIR_HOST` produtivo para o `SERVER_PORT` local.
    - Impacto: dev errado = corrupção em produção.
    - Recomendação: ambiente de homologação separado.

--- TABELA 02 - INVENTÁRIO DE ACESSOS E USUÁRIOS ---

```
ID;Sistema relacionado;Tipo de acesso;Conta/Usuário/Grupo;Ambiente;Perfil/Privilégio;Finalidade do acesso;MFA habilitado?;Menor privilégio?;Conta compartilhada?;Status;Responsável/Aprovador;Evidência;Observações/Recomendações
;DACHSER/Z3US;Humano;Usuários da aplicação (t_usuarios MariaDB);Produção;Operação/Fiscal/Supervisor/Financeiro/Gestor;Login na esteira e módulos operacionais;Não;A verificar;Não;Ativo;A verificar;src/pages/Login.tsx; supabase/functions/mariadb-proxy;Sem MFA; sessão em localStorage; revisar usuários inativos
;DACHSER/Z3US;Administrador;Usuários com is_admin=1 (t_usuarios);Produção;ADMIN (acesso total);Administração de usuários, regras, cron, manuais;Não;Não;A verificar;Ativo;A verificar;useUserRole.ts (is_admin); src/utils/adminAccess.ts;Flag única is_admin; migrar para user_roles; exigir MFA
;DACHSER/Z3US;Humano;Grupo SUPERVISOR (esteira);Produção;Aprovação supervisor, cancelar/voltar etapa;Aprovações de vouchers e exceções;Não;Parcial;Não;Ativo;A verificar;useUserRole.ts (roles);Revisar lista; exigir MFA
;DACHSER/Z3US;Humano;Grupo FINANCEIRO (esteira);Produção;Processar pagamento, baixas, aprovações;Operação financeira de vouchers;Não;Parcial;Não;Ativo;A verificar;useUserRole.ts;Revisar; exigir MFA
;DACHSER/Z3US;Humano;Grupo FISCAL (esteira);Produção;Aprovar etapa fiscal;Validação fiscal de documentos;Não;Sim;Não;Ativo;A verificar;useUserRole.ts;OK em escopo
;DACHSER/Z3US;Humano;Grupo OPERACAO (esteira);Produção;Criar/editar/anexar vouchers;Operação diária;Não;Sim;Não;Ativo;A verificar;useUserRole.ts;OK em escopo
;DACHSER/Z3US;Humano;Grupos GESTOR_* (OPERACAO/FISCAL/SUPERVISOR/FINANCEIRO);Produção;Gestão de área;Visão consolidada e overrides de área;Não;Parcial;A verificar;Ativo;A verificar;useUserRole.ts;Documentar matriz exata
;DACHSER/Z3US;Banco de dados;MARIADB_AIR_USER;Produção;A verificar (provavelmente RW);Leitura/escrita do schema AIR (tracking, AWB);N/A;A verificar;Sim (única conta);Ativo;A verificar;.env; supabase secrets MARIADB_AIR_*;Confirmar grants; criar usuário read-only p/ dashboards
;DACHSER/Z3US;Banco de dados;MARIADB_SEA_USER;Produção;A verificar (RW);Operações marítimas (tracking, demurrage, drafts);N/A;A verificar;Sim;Ativo;A verificar;supabase secrets MARIADB_SEA_*;Confirmar grants
;DACHSER/Z3US;Banco de dados;MARIADB_OPS_USER;Produção;A verificar (RW);Operações gerais / CCT / esteira;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets MARIADB_OPS_*;Confirmar grants
;DACHSER/Z3US;Banco de dados;MARIADB_FIN_USER;Produção;A verificar (RW);Financeiro / régua / vouchers;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets MARIADB_FIN_*;Confirmar grants
;DACHSER/Z3US;Banco de dados;MARIADB_CHARGES_USER;Produção;A verificar (RW);Local charges / fees;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets MARIADB_CHARGES_*;Confirmar grants
;DACHSER/Z3US;Conta técnica;Supabase service_role (SUPABASE_SERVICE_ROLE_KEY);Produção;Service role (bypass RLS);Edge functions privilegiadas (create-user, proxy, sync);N/A;Não (bypass total);Sim;Ativo;Lovable Cloud;supabase secrets;Restringir uso; revisar logs
;DACHSER/Z3US;Conta técnica;Supabase anon (SUPABASE_ANON_KEY / PUBLISHABLE_KEY);Produção;anon / authenticated;Frontend chama PostgREST e edge functions;N/A;Não;Sim;Ativo;Lovable Cloud;src/integrations/supabase/client.ts;Chave pública; depende de RLS — hoje permissivo
;DACHSER/Z3US;Serviço externo;Anthropic API (ANTHROPIC_API_KEY);Produção;API key (escopo conta);LLM para análise CHB / financeiro / geral;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Consolidar nas 3 chaves Anthropic; rotacionar
;DACHSER/Z3US;Serviço externo;Anthropic CHB (CHB_ANTHROPIC_API_KEY);Produção;API key;Análise documental CHB;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Avaliar unificação
;DACHSER/Z3US;Serviço externo;Anthropic Financeiro (ANTHROPIC_FINANCEIRO_API_KEY);Produção;API key;Análise financeira / vouchers;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Avaliar unificação
;DACHSER/Z3US;Serviço externo;OpenAI (OPENAI_API_KEY);Produção;API key;LLM/embeddings;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Migrar p/ Lovable AI Gateway (regra do projeto)
;DACHSER/Z3US;Serviço externo;OpenAI CHB (CHB_OPENAI_API_KEY);Produção;API key;CHB extraction;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Idem
;DACHSER/Z3US;Serviço externo;Google Gemini (GEMINI_API_KEY);Produção;API key;LLM (extração XLSX/HBL);N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Migrar p/ Lovable AI Gateway
;DACHSER/Z3US;Serviço externo;Lovable AI Gateway (LOVABLE_API_KEY);Produção;Managed;LLMs (rota oficial);N/A;Sim;Sim;Ativo;Lovable;supabase secrets;Rotacionar via lovable_api_key tool
;DACHSER/Z3US;Serviço externo;Firecrawl (FIRECRAWL_API_KEY);Produção;API key;Web scraping (tracking aéreo/marítimo);N/A;A verificar;Sim;Ativo;A verificar;supabase secrets; functions firecrawl-monitor-*;Monitorar custo e rate limit
;DACHSER/Z3US;Serviço externo;Hapag-Lloyd API (HAPAG_API_KEY, HAPAG_CLIENT_ID);Produção;API key + Client ID;Tracking marítimo Hapag;N/A;Sim;Sim;Ativo;A verificar;supabase secrets;OK em escopo
;DACHSER/Z3US;Serviço externo;Lufthansa Cargo (LH_CARGO_APIKEY);Produção;API key;Tracking aéreo LH;N/A;Sim;Sim;Ativo;A verificar;supabase secrets;OK
;DACHSER/Z3US;Serviço externo;Azul Cargo (AZUL_API_EMAIL, AZUL_API_PASSWORD);Produção;Usuário/senha;Tracking aéreo Azul;N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Trocar p/ API key se possível; rotacionar
;DACHSER/Z3US;Serviço externo;Flightradar (FLIGHTRADAR_API_KEY);Produção;API key;Posição de voo;N/A;Sim;Sim;Ativo;A verificar;supabase secrets;OK
;DACHSER/Z3US;Serviço externo;JsonCargo (JSONCARGO_API_KEY);Produção;API key;Tracking demurrage;N/A;Sim;Sim;Ativo;A verificar;supabase secrets;OK
;DACHSER/Z3US;Serviço externo;Leadcomex (LEADCOMEX_API_TOKEN);Produção;Bearer token;Consulta MAWB e logs;N/A;Sim;Sim;Ativo;A verificar;supabase secrets; functions leadcomex-*;OK
;DACHSER/Z3US;Serviço externo;Mapbox (MAPBOX_PUBLIC_TOKEN);Produção;Public token (entregue ao client via get-mapbox-token);Mapas (VesselFinder/rotas);N/A;Sim;Sim;Ativo;A verificar;function get-mapbox-token;Restringir domínio (URL allowlist no Mapbox)
;DACHSER/Z3US;Serviço externo;Resend (RESEND_API_KEY);Produção;API key;Envio de e-mails transacionais;N/A;Sim;Sim;Ativo;A verificar;supabase secrets;OK
;DACHSER/Z3US;Serviço externo;SMTP corporativo (SMTP_HOST/USER/PASS/PORT/FROM_*);Produção;Conta SMTP;Envio de e-mails (régua, vouchers, status);N/A;A verificar;Sim;Ativo;A verificar;supabase secrets;Validar SPF/DKIM/DMARC; rotacionar
;DACHSER/Z3US;Compartilhado;devs@z3us.ai;Produção;Destinatário fixo;Recebe alertas e cópias de e-mails de status;N/A;N/A;Sim;Ativo;A verificar;send-container-status-email:281; regua-send-emails:544;Mover para variável; tratar como conta de equipe
;DACHSER/Z3US;Fornecedor;Lovable / Supabase (Cloud);Produção;Owner do projeto;Hospeda backend, edge functions, storage, auth;A verificar (painel);A verificar;A verificar;Ativo;Equipe Lovable;Lovable Cloud;Exigir MFA no painel; revisar membros
;DACHSER/Z3US;Fornecedor;MariaDB host (provedor de infraestrutura dos 5 schemas);Produção;Admin DB / DBA;Hospedagem dos schemas AIR/SEA/OPS/FIN/CHARGES;A verificar;A verificar;A verificar;Ativo;A verificar;supabase secrets MARIADB_*_HOST;Restringir IPs (allowlist do Supabase Functions); auditoria
;DACHSER/Z3US;Conta técnica;Storage bucket voucher-anexos (público);Produção;Public read;Anexos de vouchers;N/A;Não;Sim;Ativo;A verificar;<storage-buckets>;Revisar se realmente precisa ser público; URLs assinadas
;DACHSER/Z3US;Conta técnica;Storage bucket hawb-documents (público);Produção;Public read;Documentos HAWB;N/A;Não;Sim;Ativo;A verificar;<storage-buckets>;Idem
;DACHSER/Z3US;Conta técnica;Storage bucket maritime-files (público);Produção;Public read;Arquivos marítimos (manifest, HBL);N/A;Não;Sim;Ativo;A verificar;<storage-buckets>;Idem
;DACHSER/Z3US;Conta técnica;Storage bucket chb-documents (público);Produção;Public read;Documentos CHB;N/A;Não;Sim;Ativo;A verificar;<storage-buckets>;Idem
;DACHSER/Z3US;Conta técnica;Cron Manager (Supabase pg_cron via function cron-manager);Produção;Service role;Agendamento de jobs (sync, alertas, demurrage);N/A;Sim;Sim;Ativo;A verificar;supabase/functions/cron-manager;Auditar lista de jobs
;DACHSER/Z3US;Serviço externo;Webhook RFB (rfb-webhook);Produção;Endpoint sem JWT;Recebe callbacks RFB;N/A;A verificar;Sim;Ativo;A verificar;supabase/functions/rfb-webhook;Validar assinatura/segredo do callback
;DACHSER/Z3US;Serviço externo;Supervisor email action (supervisor-email-action);Produção;Endpoint sem JWT;Aprovação/rejeição de vouchers urgentes por link;N/A;A verificar;Sim;Ativo;A verificar;supabase/functions/supervisor-email-action; SupervisorApprove/RejectRedirect.tsx;Garantir token assinado e expirável no link (memória já cobre)
;DACHSER/Z3US;A verificar;Domínio dachser.z3us.app / dachser.lovable.app (Cloudflare/DNS);Produção;DNS / TLS;Publicação do app;A verificar;A verificar;A verificar;Ativo;A verificar;project_urls;Confirmar quem administra DNS e MFA
;DACHSER/Z3US;A verificar;Repositório de código (Git);A verificar;Developer/Maintainer;Desenvolvimento;A verificar;A verificar;A verificar;Ativo;A verificar;.env presente no projeto;Verificar .gitignore para .env; auditar membros
```

--- VALIDAÇÕES MANUAIS NECESSÁRIAS ---

- Confirmar matriz completa de roles na tabela `t_usuarios` / `esteira_role` (MariaDB) e listar humanos com `is_admin=1`.
- Verificar grants reais de cada `MARIADB_*_USER` (SELECT/INSERT/UPDATE/DELETE/DDL) em cada schema.
- Verificar se `.env` está no `.gitignore` e se foi commitado em algum momento (histórico).
- Listar membros e MFA no painel Lovable Cloud (Cloud → Users) e no provedor MariaDB.
- Confirmar políticas RLS reais via `supabase--read_query` para cada tabela pública (especialmente `profiles`, `shipments`, `cct_*`).
- Confirmar visibilidade dos 4 buckets de storage e necessidade real de serem públicos.
- Listar jobs do `pg_cron` ativos via `cron-manager` e responsáveis.
- Auditar destinatários hardcoded (`devs@z3us.ai`) e mailing lists internas.
- Validar com fornecedor SMTP/Resend/Mapbox quem tem acesso administrativo às contas.
- Verificar quem possui acesso ao secret store da Lovable Cloud (rotação dos 50+ secrets).

--- AÇÕES PRIORITÁRIAS RECOMENDADAS - NIST PROTECT ---

1. **PR.AA-01 / PR.AA-05**: implementar MFA obrigatório para ADMIN/SUPERVISOR/FINANCEIRO; idealmente migrar autenticação para Supabase Auth com `password_hibp_enabled`.
2. **PR.AA-05 (menor privilégio)**: separar usuários MariaDB em RO (dashboards) e RW (sync), por schema; remover privilégios DDL das contas usadas por edge functions.
3. **PR.AC / PR.DS**: revisar RLS — fechar `anon` por padrão e abrir apenas onde houver requisito explícito; mover dados sensíveis para acesso só via service_role.
4. **PR.AA-04**: substituir flag `is_admin` em localStorage por verificação server-side de papel a cada ação crítica; migrar papéis para `public.user_roles` com `has_role()` (padrão já existente).
5. **PR.DS-01**: rotacionar todos os secrets do inventário (Anthropic, OpenAI, Gemini, Firecrawl, Hapag, LH Cargo, Azul, JsonCargo, Flightradar, Leadcomex, Mapbox, Resend, SMTP, MariaDB, SUPABASE_SERVICE_ROLE_KEY) e definir cadência trimestral.
6. **PR.DS-02**: tornar buckets de storage privados; usar URLs assinadas.
7. **PR.PS-04 (logs/auditoria)**: criar tabela append-only de login/falha (IP, UA, timestamp) e log de ações privilegiadas (criação de usuário, exclusão de voucher, override de etapa).
8. **PR.IR-01**: separar ambientes — homologação real com banco próprio; impedir `server/index.js` local apontar para produção.
9. **PR.AA-01**: revisar lista de usuários humanos trimestralmente (offboarding); marcar inativos.
10. **PR.PS-01**: remover destinatários hardcoded; mover `devs@z3us.ai` para variável e tratá-lo como conta de equipe com revisão.
11. **PR.DS-11**: ativar SPF/DKIM/DMARC no domínio remetente e restringir Mapbox por URL allowlist.
12. **GV.SC-04 (fornecedores)**: cadastro formal dos fornecedores (Lovable, MariaDB host, Resend, Anthropic, OpenAI, Google, Mapbox, Firecrawl, Hapag, Lufthansa, Azul, Leadcomex, JsonCargo, Flightradar) com responsável, contrato e revisão anual de acesso.

Sem alterações de código — quando aprovar, posso (a) salvar este conteúdo como `.csv` + `.md` em `/mnt/documents/`, ou (b) abrir tarefas pontuais de remediação (MFA, RLS, rotação de secrets, buckets privados).
