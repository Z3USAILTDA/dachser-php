

## Plano: Página de Confirmação Funcional via App Publicado

### Causa raiz definitiva
O Supabase Edge Runtime **força** `Content-Type: text/plain` e adiciona `Content-Security-Policy: sandbox` em todas as respostas. Isso é uma restrição da plataforma — **não é possível servir HTML renderizado de uma edge function**. O código está correto, mas o gateway sobrescreve os headers.

### Solução
Usar a URL publicada do app (`stellar-route-hub.lovable.app`) com a rota pública `/supervisor-confirmacao`. A rota já existe e está fora de qualquer guarda de autenticação. O SPA routing do Lovable garante que funciona em acesso direto.

```text
Fluxo:

E-mail do supervisor
  → link: https://stellar-route-hub.lovable.app/supervisor-confirmacao?token=X&action=approve
  → abre página React pública (sem login)
  → página chama edge function como API JSON
  → mostra resultado estilizado (aprovado/rejeitado/erro)

Rejeição:
  → mesma URL com action=reject
  → página mostra formulário de motivo
  → supervisor preenche e envia
  → página chama edge function com motivo
  → mostra confirmação
```

### Alterações

**1. `supabase/functions/supervisor-email-action/index.ts`**
- Remover toda renderização HTML (não funciona na plataforma)
- Retornar apenas **JSON** com status e mensagem
- Manter toda a lógica de negócio (validar token, aprovar, rejeitar com motivo)
- Aceitar POST com `Content-Type: application/json` (body: `{ reason }`)
- Adicionar CORS headers para o app poder chamar

**2. `src/pages/SupervisorConfirmacao.tsx`**
- Transformar de página estática em página funcional:
  - Ler `token` e `action` da URL
  - `action=approve`: chamar a edge function automaticamente ao carregar, mostrar loading → sucesso/erro
  - `action=reject`: validar token primeiro, mostrar formulário de motivo, enviar rejeição
  - Estados visuais: loading, sucesso (verde), rejeitado (vermelho), erro (amarelo)
  - Formulário de rejeição com textarea + botão estilizado
- Manter design Z3US atual (logo, gradiente, card, animações)
- Página 100% pública — sem dependência de auth

**3. `supabase/functions/send-voucher-notification/index.ts`**
- Trocar URL dos botões de `functions/v1/supervisor-email-action?...` para `https://stellar-route-hub.lovable.app/supervisor-confirmacao?token=X&action=approve|reject`
- Links agora abrem a página React diretamente

**4. Deploy** das duas edge functions

### Por que funciona desta vez
- A página `/supervisor-confirmacao` é uma rota React pública no app publicado
- O Lovable hosting tem SPA fallback automático — acesso direto à URL funciona
- A rota já está em `App.tsx` sem auth guard
- A edge function só retorna JSON (sem problemas de Content-Type)
- O visual fica controlado pelo React, não pelo edge runtime

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/supervisor-email-action/index.ts` | Retornar JSON em vez de HTML, adicionar CORS |
| `src/pages/SupervisorConfirmacao.tsx` | Página funcional com chamada à API e formulário de rejeição |
| `supabase/functions/send-voucher-notification/index.ts` | URLs dos botões apontam para o app publicado |

