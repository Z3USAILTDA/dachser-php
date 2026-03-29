

## Alteração pontual: hierarquia completa de eventos no tracking aéreo

### Arquivos alterados

**1 arquivo:** `supabase/functions/fetch-tracking-aereo/index.ts`

Nenhuma alteração no frontend — o campo `last_event` continua sendo retornado com o mesmo nome, a tela consome normalmente.

---

### Alteração 1 — Substituir o SELECT (linhas 48-111)

Trocar o SQL atual pelo novo SELECT fornecido, que adiciona:
- Joins para `b` (antepenúltimo) e `c` (antes do antepenúltimo) na `t_eventos_awb`
- Join para `teau` na `t_eventos_awb` (correção do último evento)
- Campos: `antepenultimo_code`, `antes_antepenultimo_code`, `antepenultimo_evento`, `antes_antepenultimo_evento`
- Remover o `CASE ... AS last_event` do SELECT externo (a lógica passa para o JavaScript)

O SELECT externo fica `SELECT * FROM (...) x` conforme fornecido.

---

### Alteração 2 — Substituir a lógica de `last_event` no map (linha 151)

Trocar a linha:
```typescript
last_event: row.last_event || row.ultimo_code || row.last_status_code || '',
```

Por lógica que implementa a regra de negócio:

```typescript
// 1. DLV prevalece em qualquer posição
let lastEvent = '';
if (row.ultimo_code === 'DLV' || row.penultimo_code === 'DLV' || 
    row.antepenultimo_code === 'DLV' || row.antes_antepenultimo_code === 'DLV') {
  lastEvent = 'DLV';
} else {
  // 2. Maior ID entre os eventos não-null
  const candidates = [
    { id: row.ultimo_evento, code: row.ultimo_code },
    { id: row.penultimo_evento, code: row.penultimo_code },
    { id: row.antepenultimo_evento, code: row.antepenultimo_code },
    { id: row.antes_antepenultimo_evento, code: row.antes_antepenultimo_code },
  ].filter(c => c.id != null);

  if (candidates.length > 0) {
    const winner = candidates.reduce((a, b) => (Number(a.id) >= Number(b.id) ? a : b));
    lastEvent = winner.code || '';
  } else {
    // 3. Fallback
    lastEvent = row.ultimo_code || row.last_status_code || '';
  }
}
```

E usar `lastEvent` no retorno: `last_event: lastEvent,`

---

### O que NÃO muda

- Nenhum arquivo frontend
- Nenhum layout, estilo, filtro, ordenação, paginação, badge ou cor
- Nenhum nome de variável, função ou tipo existente
- Nenhuma lógica além do SELECT e da derivação do `last_event`
- A tela continua consumindo `last_event` exatamente como antes

