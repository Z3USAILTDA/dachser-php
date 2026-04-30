## Objetivo

Duas frentes cirúrgicas no `/fin/esteira` (criação de Voucher Master) + estabilização do edge `fetch-tracking-aereo` que está estourando CPU (erro 546) após a nova query de discrepância.

---

## Frente 1 — Voucher Master: campos obrigatórios + Tipo de Documento

**Arquivo único**: `src/components/esteira/VoucherMasterForm.tsx`

### Mudanças no schema Zod

Tornar obrigatórios e adicionar `tipoDocumento` como select obrigatório:

- `valorTotal`: string com `.min(1, "Obrigatório")` + validação de número > 0
- `vencimento`: `z.date({ required_error: "Obrigatório" })`
- `formaPagamento`: `.min(1, "Obrigatório")` (já tem default `BOLETO`, mas reforçar)
- `cobrancaEmNomeDe`: já é enum, manter — é o campo "É necessário contabilização com o fiscal?"
- `tipoDocumento`: `.min(1, "Obrigatório")` (hoje é opcional e sem UI)

### UI — adicionar campo Tipo de Documento

Inserir no bloco `CollapsibleContent` (logo após o grid de 3 colunas com Valor/Moeda/Vencimento, antes de Forma de Pagamento) um novo `FormField` para `tipoDocumento` com `Select`:

- VOUCHER
- SPO
- ICMS
- ARMAZENAGEM
- ADF
- OUTROS

### UX

- Como os campos obrigatórios estão dentro de um `Collapsible` fechado por padrão, abrir automaticamente o "Editar Dados Consolidados" (`setDadosExpanded(true)`) quando o submit falhar a validação, para o usuário ver os erros.
- Adicionar marcador `*` vermelho nos labels obrigatórios (Valor Total, Vencimento, Forma de Pagamento, Tipo de Documento, contabilização fiscal).
- O `FormMessage` do shadcn já mostra o erro Zod abaixo de cada campo — apenas garantir que está presente em cada `FormItem`.

### Backend

`tipoDocumento` já é enviado no payload `create_voucher_master` (linha 214). Não muda nada no edge function `mariadb-proxy`. A coluna `tipo_documento` já é gravada no MariaDB.

---

## Frente 2 — Erro 546 (CPU exceeded) em `fetch-tracking-aereo`

**Causa raiz**: A nova `discrepancySql` adicionou 4 CTEs com window functions (`ROW_NUMBER`, `SUM OVER`) sobre `JSON_TABLE` em cima de `t_dados_aereo × t_fato_aereo`. Combinada com o resto do pipeline (visibilidade, 996, fato_aereo, master_dados), passou do limite de 2s de CPU do edge runtime.

**Arquivo único**: `supabase/functions/fetch-tracking-aereo/index.ts`

### Mitigações cirúrgicas (sem alterar o contrato da query)

1. **Restringir o universo da query** já no `base_disc`:
   - Adicionar predicado para limitar HAWBs apenas àqueles que aparecem no resultado principal `Query returned 958 rows` (já carregamos os AWBs do dia/janela). Hoje o `WHERE` filtra só por `master_insert >= '2026-03-20'` — isso traz centenas de HAWBs irrelevantes.
   - Como a lista de AWBs ativos já está em memória após `Step 3` da função, passar essa lista como `WHERE tda.awb_number IN (...)` reduz drasticamente o `JSON_TABLE` (custo dominante).

2. **Cache em memória do edge** (escopo do módulo, TTL curto):
   - Variável `let discrepancyCache: { at: number; data: typeof discrepancyMap } | null = null;`
   - Reusar se `Date.now() - at < 60_000` (1 minuto). A página é polled a cada poucos segundos por vários usuários — hoje cada chamada refaz a query inteira.

3. **Fallback resiliente**: se a query exceder 1 retry no `queryWithRetry`, logar warning e seguir com `discrepancyMap` vazio, em vez de derrubar a função inteira (atualmente já está dentro de `try/catch`, manter — o problema é o CPU exceeded matar o worker antes do catch).

### Por que isso resolve

- O log mostra `Executing discrepancy query...` seguido de `CPU Time exceeded` — a query é o gatilho.
- Filtrar pelos AWBs já conhecidos transforma o `JSON_TABLE` de "explorar todos os timelines de março/2026 em diante" para "explorar só os ~958 AWBs em tela".
- Cache de 60s elimina o re-trabalho em chamadas concorrentes/rápidas.

---

## NÃO altera

- Lógica de classificação (`DIS_ULTIMO_EVENTO`, `DISCREPANCIA_REAL`, baseline, soma normalizada) — preservada.
- Manual overrides, prefixo 996, visibilidade, master_dados — preservados.
- Tipos no front, badges, contagens — preservados.
- Fluxo de criação do Voucher Master no backend — preservado (apenas validação no front e novo select).
- Outros formulários da esteira (`CreateVoucherDialog`, `EditVoucherDialog`) — fora do escopo.

## Validação após deploy

- Voucher Master: tentar criar sem preencher Valor/Vencimento/Forma/Fiscal/Tipo — deve mostrar erros Zod e abrir o collapsible automaticamente.
- `/air/tracking-aereo`: erro 546 deve sumir; logs devem mostrar `Loaded N discrepancy records` consistentemente.
- AWB `045-21167731` continua marcado como discrepância de peças.
