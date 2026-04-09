
Objetivo: corrigir os dois problemas sem refatoração ampla, mantendo a estrutura atual.

1. Corrigir anexos reais no e-mail
- O problema atual não é só visual: a função `send-voucher-notification` hoje apenas lista links no HTML e não envia arquivos como anexos reais.
- Além disso, ela lê os anexos no lugar errado:
  - `mariadb-proxy/get_voucher_by_id` retorna `anexos` em `voucherRes.anexos`
  - o código atual procura em `voucherRes.data.anexos`
  - por isso os logs mostram `0 anexos found`
- Ajuste planejado em `supabase/functions/send-voucher-notification/index.ts`:
  - ler anexos do payload correto retornado pelo proxy
  - manter a seção visual “Documentos Anexados” no HTML
  - baixar cada arquivo público de `file_url`
  - montar `attachments` no formato aceito pelo envio de e-mail
  - anexar nome correto do arquivo e conteúdo binário/base64
  - limitar aos documentos reais do voucher e ignorar URLs inválidas para não quebrar o envio inteiro

2. Corrigir a abertura “crua” após aprovar/rejeitar
- O `supervisor-email-action` já responde com `Content-Type: text/html`, então o comportamento de mostrar código-fonte tende a vir do contexto do clique no cliente de e-mail.
- Para eliminar isso com robustez, a melhor correção é parar de depender da renderização direta do HTML da edge function.
- Ajuste planejado:
  - após processar aprovação/rejeição, a função fará redirect para uma rota web do app, com status e mensagem na querystring
  - essa rota renderizará uma página polida dentro do próprio frontend, evitando exibição de HTML bruto pelo cliente de e-mail
- Implementação mínima:
  - criar uma página pública simples de confirmação com visual Z3US
  - adicionar rota em `src/App.tsx`
  - trocar os retornos finais de sucesso/erro em `supabase/functions/supervisor-email-action/index.ts` para redirecionamentos

3. Preservar o comportamento atual
- Os botões do e-mail continuam funcionando do mesmo jeito
- A ação continua sendo uso único por token
- O override para `larissa@z3us.ai` permanece como está
- Não mexer na lógica de aprovação/rejeição além do necessário para a navegação final e anexos reais

Arquivos a alterar
- `supabase/functions/send-voucher-notification/index.ts`
  - corrigir leitura dos anexos
  - anexar arquivos reais no envio
- `supabase/functions/supervisor-email-action/index.ts`
  - substituir resposta HTML final por redirect para página do app
- `src/App.tsx`
  - registrar rota pública de confirmação
- novo componente/página de confirmação
  - tela polida para aprovado, rejeitado, erro, expirado, já utilizado

Validação planejada
- criar um voucher urgente com fatura/boleto
- confirmar em logs que agora os anexos são encontrados
- confirmar que o e-mail chega com arquivos anexados, não só links
- clicar em Aprovar/Rejeitar pelo e-mail e validar que abre uma página bonita do app, sem mostrar código HTML bruto

Detalhes técnicos
```text
Fluxo corrigido

send-voucher-notification
  -> mariadb-proxy get_voucher_by_id
  -> usa result.anexos
  -> baixa arquivos de file_url
  -> resend.emails.send({ html, attachments })

supervisor-email-action
  -> valida token
  -> processa ação
  -> redirect 302/303 para rota pública do app
  -> frontend mostra página final estilizada
```

Risco principal
- Alguns anexos podem estar em formatos variados ou com URLs indisponíveis; por isso o envio deve tolerar falha individual de arquivo sem bloquear o e-mail inteiro.
