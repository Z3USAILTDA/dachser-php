

## Corrigir detecção de fee changes para HMM, ONE, ZIM (e MSC)

### Causa raiz

A lógica atual (linha 1987) busca registros de history com data **anterior** ao registro current:
```
if (h._dt_key < cDt || (h._dt_key === cDt && (h.id || 0) < (c.id || 0)))
```

Para HMM, ONE e ZIM, as tabelas de history foram populadas com `data_atualizacao` igual ou posterior à tabela current, fazendo com que a condição nunca seja satisfeita e nenhuma alteração seja detectada.

### Arquivo alterado

**1 arquivo:** `supabase/functions/mariadb-proxy/index.ts` — apenas dentro do `case 'get_fee_changes'`

### Alteração proposta

Substituir a lógica de matching (linhas 1977-2023) por uma abordagem bidirecional:

1. **Agrupar current por key** (mesmo `keyOf`) em um mapa
2. **Agrupar history por key** em um mapa
3. Para cada key que existe em AMBOS os mapas:
   - Pegar o registro current mais recente (por `_dt_key`)
   - Pegar o registro history com fee diferente (qualquer direção temporal)
   - Se encontrar fee diferente, emitir a alteração
4. Também processar keys que existem APENAS no history (com mais de 1 registro de fee diferente) para capturar alterações históricas entre snapshots

### Detalhes técnicos

Substituir o bloco `// Find previous fee for each current row` (linhas 1977-2023) por:

```typescript
// Group current rows by key - keep the one with latest date
const currByKey: Record<string, any> = {};
for (const c of currRows) {
  const k = keyOf(c, fallbackEmpresa);
  if (!currByKey[k] || c._dt_key > currByKey[k]._dt_key) {
    currByKey[k] = c;
  }
}

// For each current key, find the most recent history record with a different fee
let changesForPair = 0;
for (const k in currByKey) {
  const c = currByKey[k];
  const list = histByKey[k] || [];
  if (!list.length) continue;
  
  const cFee = parseFloat(c.fee);
  
  // Find the most recent history record with a different fee (any date)
  let prev = null;
  for (const h of list) {
    const hFee = parseFloat(h.fee);
    if (!isNaN(hFee) && !isNaN(cFee) && hFee !== cFee) {
      prev = h;
      break; // list is sorted by date desc, so first different-fee match is most recent
    }
  }
  
  if (!prev) continue;
  
  const feeAnterior = parseFloat(prev.fee) || 0;
  const feeAtual = cFee || 0;
  const diffAbs = feeAtual - feeAnterior;
  const diffPct = feeAnterior !== 0 ? ((feeAtual - feeAnterior) / feeAnterior) * 100 : null;
  
  changes.push({
    chave: c.chave || null,
    empresa: c.empresa || fallbackEmpresa || null,
    charge_description: c.charge_description || null,
    charge_code: c.charge_code || null,
    container_type: c.container_type || null,
    currency: c.currency || null,
    unit_of_measure: c.unit_of_measure || null,
    fee_anterior: feeAnterior,
    fee_atual: feeAtual,
    diff_abs: diffAbs,
    diff_pct: diffPct,
    effective_anterior: prev.effective || null,
    effective_atual: c.effective || null,
    dt_chave_anterior: prev.data_atualizacao_chave || null,
    dt_chave_atual: c.data_atualizacao_chave || null,
    dt_ordenacao_anterior: prev._dt_key,
    dt_ordenacao_atual: c._dt_key,
    src_anterior: pair.hist,
    src_atual: pair.main,
  });
  changesForPair++;
}

console.log(`[fee_changes] ${pair.main}: found ${changesForPair} changes for this pair`);
```

### O que muda

- Remove a exigência de `h._dt_key < cDt` que impedia o matching
- Agrupa por key para evitar duplicatas (1 alteração por charge/container/currency)
- Mantém os logs diagnósticos existentes

### O que NÃO muda

- Nenhum arquivo frontend
- Nenhum outro case do mariadb-proxy
- Queries SQL (mesmas colunas, mesmo LIMIT)
- Lógica de `keyOf`, `normalizeDt`, fallbackEmpresa
- Lógica de sorting, latest marking e latestMarked (linhas 2032-2088)
- Layout, filtros, paginação da tela

