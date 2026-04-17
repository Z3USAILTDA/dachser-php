
## Ajuste: formatação de data de vencimento nos e-mails

### Problema
Nos e-mails de notificação (ex.: AJUSTE_SOLICITADO), o campo **Vencimento** aparece como:
`Thu Apr 23 2026 00:00:00 GMT-0300 (Horário Padrão de Brasília)`

Isso ocorre porque a data está sendo renderizada no template HTML usando o valor bruto vindo do payload (`data.vencimento`), que em vários call-sites é um `Date.toString()` (ou um ISO/datetime longo do MariaDB).

### Solução (cirúrgica)
Em `supabase/functions/send-voucher-notification/index.ts`, adicionar um helper `formatVencimentoBR(value)` que:
- Aceita `string | Date | undefined`.
- Tenta `new Date(value)`; se válido, retorna `dd/MM/yyyy` em pt-BR (`toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })`).
- Se inválido (ex.: já vem `"23/04/2026"`), retorna o valor original como string.
- Se vazio, retorna `""`.

Aplicar o helper nos 2 únicos pontos onde `data.vencimento` é renderizado:
1. Linha 146 — bloco `VENCIMENTO_PROXIMO`.
2. Linha 179 — linha da tabela "Vencimento" (usada por todos os tipos de e-mail).

### Arquivo afetado
| Arquivo | Mudança |
|---|---|
| `supabase/functions/send-voucher-notification/index.ts` | Adicionar `formatVencimentoBR` e substituir `${data.vencimento}` por `${formatVencimentoBR(data.vencimento)}` nas 2 ocorrências |

### Não muda
- Frontend (call-sites continuam mandando o valor como vinha — a normalização passa a ser responsabilidade do template do e-mail, ponto único).
- Outros campos (valor, moeda etc.).
- Edge functions de relatório (esse caso é específico do `send-voucher-notification`).

### Resultado esperado
`Vencimento: 23/04/2026`
