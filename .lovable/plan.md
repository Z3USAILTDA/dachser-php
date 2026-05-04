## Contexto

Você confirmou que os dois vouchers que falharam **foram importados via RM** e possuem `id_rm` no banco — portanto **não deveriam** ter sido tratados como `MANUAL`. Existem dois problemas independentes que se somaram:

### Problema 1 — Bug de runtime (causa imediata do 500)
No handler `check_voucher_rm_ready` (`supabase/functions/mariadb-proxy/index.ts`, ~linha 9905) o `SELECT` é feito com `client.execute(...)`. O driver `deno-mysql` retorna `{ rows, affectedRows, lastInsertId }` para `execute`, **não um array**. Resultado:
- `rows.length === 0` → `false` (undefined)
- `rows[0]` → `undefined`
- `row['documento']` → **TypeError 500**

Todos os outros SELECTs do arquivo usam `client.query(...)`. Esse é o único divergente.

### Problema 2 — Classificação de origem no front
Em `src/pages/esteira/EsteiraVoucherDetails.tsx` linha 129:
```ts
origemCriacao: data.is_master ? "MASTER" : data.id_rm ? "RM" : "MANUAL"
```
Se por qualquer motivo `id_rm` chegar como string vazia `""`, `null`, `0` ou não for retornado pelo backend, o voucher é classificado como `MANUAL` e dispara a verificação `check_voucher_rm_ready` desnecessariamente. Foi exatamente o que aconteceu nos vouchers reportados.

## Plano (2 ajustes cirúrgicos)

### 1. `supabase/functions/mariadb-proxy/index.ts` — handler `check_voucher_rm_ready`
- Trocar `client.execute(...)` por `client.query(...)`.
- Manter exatamente a mesma SQL, validações de campos e formato de retorno (`{ ready, found, missingFields }`).

Resultado: a função para de retornar 500 e responde corretamente `ready/found/missing` em qualquer cenário.

### 2. `src/pages/esteira/EsteiraVoucherDetails.tsx` — derivação de `origemCriacao`
Tornar a detecção de RM tolerante a strings vazias / espaços:
```ts
const idRmStr = String(data.id_rm ?? "").trim();
origemCriacao: data.is_master ? "MASTER" : (idRmStr ? "RM" : "MANUAL"),
```
Assim, vouchers que vieram do RM mas têm `id_rm` salvo de forma inconsistente continuam sendo reconhecidos como `RM` e **não** disparam o bloqueio de integração.

## Validação após o deploy
1. Reabrir um dos vouchers afetados (`/fin/esteira/voucher/c2b734dc-...`) e verificar no console que `origemCriacao === "RM"`.
2. Aprovar como Fiscal — deve avançar direto para `FINANCEIRO`/`SUPERVISOR` sem chamar `check_voucher_rm_ready`.
3. Testar também um voucher genuinamente MANUAL: a chamada deve retornar 200 com `ready: true/false` (sem 500).
4. Conferir `function_edge_logs` para confirmar ausência de `TypeError`.

Nenhuma mudança de schema, RLS ou contrato de API.