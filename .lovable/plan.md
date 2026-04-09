
## Plano: Edge Function Serve HTML Diretamente (Sem Redirect)

### Problema
O redirect para `dachser.z3us.app/supervisor-confirmacao` não funciona publicamente porque o app requer autenticação ou o SPA não carrega corretamente fora do contexto do app. Além disso, ao rejeitar, o supervisor precisa informar o motivo.

### Solução
Eliminar o redirect. A edge function `supervisor-email-action` vai servir HTML diretamente com o design Z3US polido. Para rejeição, vai mostrar um formulário antes de processar.

### Fluxo

```text
APROVAR:
  GET ?token=X&action=approve
  → valida token → processa aprovação → retorna HTML "Voucher Aprovado" ✓

REJEITAR (2 etapas):
  GET ?token=X&action=reject
  → valida token → retorna HTML com formulário "Motivo da Rejeição"
  → supervisor preenche e clica "Confirmar Rejeição"
  
  POST ?token=X&action=reject  (form submit)
  → processa rejeição com motivo → retorna HTML "Voucher Rejeitado" ✗
```

### Alterações

**`supabase/functions/supervisor-email-action/index.ts`**
- Remover função `redirect()` — não redireciona mais
- Criar função `renderPage(status, message)` que retorna HTML completo inline com:
  - Logo Z3US, gradiente escuro, card com sombra, ícone SVG, animação fade-in
  - Mesmo design que já existe em `SupervisorConfirmacao.tsx`
- Para `action=reject` com método GET: retornar HTML com formulário (textarea para motivo + botão "Confirmar Rejeição")
- Para `action=reject` com método POST: ler o motivo do body, processar rejeição, salvar motivo no log e no campo `ajuste_operacao`
- Para `action=approve`: processar e retornar página de sucesso diretamente
- Content-Type: `text/html; charset=utf-8`

**`src/pages/SupervisorConfirmacao.tsx`** e rota em `App.tsx`
- Podem ser removidos ou mantidos (não serão mais usados pelo fluxo de e-mail)

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/supervisor-email-action/index.ts` | Servir HTML diretamente com formulário de rejeição |
