

## Plano revisado: Tabela persistente no MariaDB (dados_dachser.t_air_process_visibility)

### Mudança em relação ao plano anterior
A tabela será criada no **MariaDB** (banco `dados_dachser`) com prefixo `t_`, em vez do Supabase.

### 1. Criar tabela no MariaDB via edge function

Nova edge function `air-scan-finalized/index.ts` que:

**a)** Cria a tabela se não existir:
```sql
CREATE TABLE IF NOT EXISTS dados_dachser.t_air_process_visibility (
  id INT AUTO_INCREMENT PRIMARY KEY,
  awb VARCHAR(30) NOT NULL,
  hawb VARCHAR(50),
  hide_reason VARCHAR(30) NOT NULL,  -- 'ARR_DESTINO_5D' ou 'DLV'
  arr_destino_date DATETIME DEFAULT NULL,
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_awb_hawb (awb, hawb)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**b)** Chama `fetch-tracking-aereo` internamente para obter todos os processos, varre os resultados e insere/atualiza registros na tabela para:
- Processos com `arr_destino_date` preenchido e data > 5 dias → `hide_reason = 'ARR_DESTINO_5D'`
- Processos com `last_event = 'DLV'` → `hide_reason = 'DLV'`

### 2. Corrigir extração de IATA no `fetch-tracking-aereo`

Adicionar helper `extractIATA(loc)` que extrai código IATA de formatos como `"Frankfurt Main (FRA)"`, `"FRA"`, `"FRA - Frankfurt"`:
```typescript
function extractIATA(loc: string): string {
  if (!loc) return "";
  const t = loc.trim();
  const paren = t.match(/\(([A-Z]{3})\)/i);
  if (paren) return paren[1].toUpperCase();
  if (/^[A-Z]{3}$/i.test(t)) return t.toUpperCase();
  return t.substring(0, 3).toUpperCase();
}
```
Usar em ambas as comparações (enriquecimento ARR e scan `arr_destino_date`).

### 3. Atualizar `fetch-tracking-aereo` para consultar a tabela

Após montar os dados, fazer um `SELECT awb, hawb, hide_reason FROM dados_dachser.t_air_process_visibility` e adicionar campo `hide_reason` nos objetos retornados.

### 4. Atualizar `TrackingAereo.tsx`

- Mapear `hide_reason` do backend
- No `filteredAwbs`, ocultar processos com `hide_reason` preenchido (a menos que haja `searchTerm`)
- Manter filtro local por `arr_destino_date` como fallback

### Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — `extractIATA()`, consultar `t_air_process_visibility`, adicionar `hide_reason`
- `supabase/functions/air-scan-finalized/index.ts` — nova function para criar tabela e popular dados
- `src/pages/air/TrackingAereo.tsx` — usar `hide_reason` para ocultação

