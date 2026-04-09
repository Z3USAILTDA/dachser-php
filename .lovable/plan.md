

## Plano: Página de Confirmação Polida + Anexos no E-mail do Supervisor

### Problema 1: Página de confirmação crua
A função `supervisor-email-action` retorna HTML com caracteres quebrados (â em vez de ✓/✗) e visual muito básico. Precisa de uma página profissional com a identidade visual Z3US.

### Problema 2: E-mail sem anexos
O e-mail enviado ao supervisor não inclui os documentos do voucher (faturas, boletos). O supervisor precisa analisar os documentos antes de aprovar/rejeitar.

---

### Alterações

**1. `supabase/functions/supervisor-email-action/index.ts` — Página de confirmação polida**

Redesenhar a função `htmlPage()` com:
- Logo Z3US no topo
- Gradiente sutil no fundo (similar ao design system do app)
- Ícone SVG inline (em vez de emoji ✓/✗ que quebra encoding)
- Tipografia moderna, card com sombra suave
- Animação de entrada (fade-in)
- Cores: verde (#22C55E) para aprovação, vermelho (#DC2626) para rejeição, amarelo (#F5B843) para erros
- Footer com © Z3US.AI estilizado
- Responsivo para mobile

**2. `supabase/functions/send-voucher-notification/index.ts` — Anexos no e-mail**

Quando `toStage === "SUPERVISOR"`:
- Buscar dados completos do voucher via `mariadb-proxy` (`get_voucher_by_id`) incluindo a lista de `anexos` (tipo, file_name, file_url)
- Injetar no HTML do e-mail uma seção "📎 Documentos Anexados" com links clicáveis para cada documento (fatura, boleto, etc.)
- Incluir também dados adicionais do voucher na tabela (CNPJ, filial, centro de custo, motivo urgência, etc.)

**3. Deploy** das duas edge functions após as alterações.

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/supervisor-email-action/index.ts` | Redesign completo da página HTML de confirmação |
| `supabase/functions/send-voucher-notification/index.ts` | Buscar anexos via proxy e incluir links no e-mail do supervisor |

