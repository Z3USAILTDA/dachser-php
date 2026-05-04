
## Ajustes na esteira do voucher

### 1) Tela Pagamentos — Default "Pendente" em vez de "Manual"

**Problema:** Todo voucher novo aparece em Pagamentos com `tipo_execucao_pagamento = MANUAL`. O `INSERT INTO t_vouchers` em `save_voucher_esteira` (linhas 6424–6467 de `mariadb-proxy/index.ts`) **não envia** essa coluna, e o default legado da coluna no MariaDB (herdado do ENUM antigo) é `MANUAL`. Logo, todo voucher novo vira Manual automaticamente.

**Correção:**
- Em `mariadb-proxy/index.ts`, incluir `tipo_execucao_pagamento` no INSERT do `save_voucher_esteira` com valor `'A_DEFINIR'` (Pendente).
- Aplicar o mesmo a todos os outros `INSERT INTO t_vouchers` que omitem a coluna (linhas 11915, 12349, 12444, 15093) — manter exceção apenas se algum fluxo já passa um valor explícito.
- Executar `ALTER TABLE dados_dachser.t_vouchers ALTER COLUMN tipo_execucao_pagamento SET DEFAULT 'A_DEFINIR'` para padronizar inserções futuras.

Resultado: o `Select` da coluna em `PagamentosTab.tsx:1083` exibirá "Pendente" para vouchers novos (sem back-fill em registros existentes).

### 2) Tela Pagamentos — Botão "Atualizar" não atualiza de fato

**Problema:** O botão (linha 723–735 de `PagamentosTab.tsx`) chama `loadPagamentos()`, mas em vários casos a tabela continua exibindo o estado antigo. O hook reage a mudança de filtro via `useEffect` (linha 317–319); cliques no botão sem mudança de filtro às vezes não disparam refetch porque o React deduplica chamadas idênticas.

**Correção (front):**
- Trocar o handler para limpar caches locais antes de re-buscar:
  - `setDadosBancariosCache({})`
  - `setPagamentos([])` (opcional, com `setLoading(true)`)
- Passar um cache-buster no body (`bust: Date.now()`) para forçar uma nova invocação no edge function (mesmo que o backend ignore o campo, evita reuso de resposta no SDK).
- Garantir `setRefreshing(true)` antes da chamada e reset no `finally` (já existe — apenas validar).

Sem alterações no backend.

### 3) Tela Processos — Filtro Etapa: substituir "A Processar" por "Operacional" único

**Problema:** Hoje o filtro tem duas opções separadas: `OPERACAO` (Operacional) e `A_PROCESSAR` (A Processar). Usuário quer apenas **uma** opção `Operacional` que englobe ambos os estados.

**Correção:**
- `src/components/esteira/VoucherTable.tsx` (linha 449): **remover** o `<SelectItem value="A_PROCESSAR">A Processar</SelectItem>`. Manter apenas `OPERACAO`/Operacional.
- `src/pages/esteira/EsteiraIndex.tsx` (linha 1327–1337): adaptar a comparação. Quando `fEtapa === "OPERACAO"`, aceitar voucher cuja `etapaAtual` seja `OPERACAO` **ou** `A_PROCESSAR` (espelhando o mesmo padrão já usado para `FINANCEIRO` que aceita `FINANCEIRO`/`ROBO`).
- `src/components/esteira/VoucherFilters.tsx` (linha 79): aplicar a mesma regra (sem item separado A_PROCESSAR; OPERACAO engloba).

Sem mudança em VoucherFilters interface — já existe apenas `OPERACAO` ali. Foco do trabalho: `VoucherTable.tsx` (remoção do item) e `EsteiraIndex.tsx` (lógica).

### 4) Envio de Voucher Manual — Instrução no campo Nº Voucher/SPO

**Arquivo:** `src/components/esteira/CreateVoucherDialog.tsx` (entrada manual em 895–917; entrada via RM em 922–957).

Adicionar um helper-text logo abaixo do label "Nº do Voucher/SPO", com a instrução:

```
SPO: Filial + número SPO
Voucher: Ano (2026) + número do Voucher
```

Renderizado como `<p className="text-xs text-muted-foreground">…</p>` em ambos os modos (manual e RM).

### 5) Verificação em t_dados_financeiro_voucher — aceitar formato com e sem sufixo

**Problema:** O usuário pode digitar `"105-292964 DIM-BY"` ou `"105-292964"`. As queries atuais fazem match exato em `nd`:
- `voucher-integrate-rm/index.ts` action `fetch` (linha 333–336): `WHERE nd = ?`.
- `mariadb-proxy/index.ts` `check_voucher_rm_ready` (linha 10039–10045): `WHERE nd COLLATE … = ? COLLATE …`.

Resultado: variação de formato falha o lookup e o voucher é tratado como "não existe espelho no RM".

**Correção (backend):**
- Normalizar o input antes da query nos dois handlers:
  1. `trim()`.
  2. Gerar até **dois candidatos**: o valor completo e a primeira parte antes do espaço (ex.: `"105-292964 DIM-BY"` → `["105-292964 DIM-BY", "105-292964"]`).
  3. Query: `WHERE nd COLLATE utf8mb4_unicode_ci IN (?, ?)` (deduplicar quando idênticos).
- Aplicar mesma normalização em `find_voucher_by_nd` (linha 11334+) para coerência com Comprovante Robô (já documentada em `mem://vouchers/comprovante-robot-matching-rules`).

### Memória
Atualizar `mem://vouchers/check-rm-ready-only-blocks-manual.md` registrando a regra de normalização de `nd` (aceitar `"105-292964"` e `"105-292964 DIM-BY"`) na verificação de existência em `t_dados_financeiro_voucher`.

### Arquivos editados
- `supabase/functions/mariadb-proxy/index.ts`
  - INSERT de `t_vouchers` em `save_voucher_esteira` e demais (default `A_DEFINIR`)
  - ALTER da coluna `tipo_execucao_pagamento` (default `A_DEFINIR`)
  - `check_voucher_rm_ready`: normalização de `nd` (2 candidatos, IN)
  - `find_voucher_by_nd`: mesma normalização
- `supabase/functions/voucher-integrate-rm/index.ts`
  - action `fetch`: normalização de `nd`
- `src/components/esteira/PagamentosTab.tsx`
  - Botão Atualizar com cache-bust e limpeza de cache local
- `src/components/esteira/VoucherTable.tsx`
  - Remover item `A_PROCESSAR` do select de Etapa
- `src/pages/esteira/EsteiraIndex.tsx`
  - Filtro `OPERACAO` engloba `OPERACAO` + `A_PROCESSAR`
- `src/components/esteira/CreateVoucherDialog.tsx`
  - Helper-text de instrução abaixo do campo Nº Voucher/SPO
- `.lovable/memory/vouchers/check-rm-ready-only-blocks-manual.md`
  - Registrar normalização de `nd`

### Validação pós-implementação
1. Criar voucher manual → coluna Tipo Exec. exibe "Pendente" (não "Manual").
2. Em Pagamentos, clicar "Atualizar" e verificar que dados realmente são re-buscados (logs do edge function mostram nova chamada).
3. Filtro Etapa não exibe mais "A Processar"; "Operacional" lista vouchers com `etapaAtual` em `OPERACAO` ou `A_PROCESSAR`.
4. Diálogo de criação manual: helper-text visível.
5. Digitar `"105-292964 DIM-BY"` quando existe `nd = "105-292964"` em `t_dados_financeiro_voucher` → match encontrado, voucher segue para próxima etapa.
