

## Plano: Fixar alerta de discrepância permanente para 996-14370731

### O que o usuário quer
- **NÃO** forçar a timeline — deixar os dados virem do banco (firecrawl) naturalmente
- **SIM** forçar o alerta de discrepância de peças para que apareça sempre, mesmo que os dados mudem

### Problema atual
1. O override no `fetch-status-aereo` tem `last_event_date: '2026-03-16'`, mas o banco já tem eventos de `2026-03-19` — logo o override é **ignorado** (regra de prevalência cronológica)
2. O `FORCED_TIMELINES` no `mariadb-proxy` também tem `last_event_date` antiga — é igualmente ignorado
3. A timeline automática do firecrawl provavelmente não está parseando as peças variáveis (26, 15, 11, 6, 5) corretamente, então a discrepância natural não aparece

### Solução

#### 1. `supabase/functions/mariadb-proxy/index.ts`
- **Remover** a entrada `996-14370731` do `FORCED_TIMELINES` (não forçar mais a timeline)
- **Criar** um novo mapa `FORCED_DISCREPANCIES` com uma entrada para esse AWB:
  ```typescript
  const FORCED_DISCREPANCIES: Record<string, { field: string; values: number[]; min: number; max: number }> = {
    '996-14370731': { field: 'pecas', values: [26, 15, 11, 6, 5], min: 5, max: 26 },
  };
  ```
- Na linha ~7909 (construção do resultado), após a detecção automática de discrepância: verificar se o AWB está em `FORCED_DISCREPANCIES` e usar esse valor como fallback (ou override) caso a detecção automática não encontre discrepância

#### 2. `supabase/functions/fetch-status-aereo/index.ts`
- **Remover** a `force_timeline` e atualizar o override para manter apenas `force_origem: 'CDG'`, `force_destino: 'GRU'` (se necessário para a rota), sem `last_event_date` para que o override de status não interfira com dados automáticos
- Ou remover completamente o override se o status automático já está correto

### Resultado esperado
- Timeline vem do banco naturalmente (dados do firecrawl)
- Banner âmbar de discrepância: "⚠ Discrepância de peças detectada: valores encontrados 26, 15, 11, 6 e 5"
- Persiste permanentemente independente de atualizações futuras

### Arquivos modificados
1. `supabase/functions/mariadb-proxy/index.ts` — remover forced timeline, adicionar `FORCED_DISCREPANCIES` com fallback na detecção
2. `supabase/functions/fetch-status-aereo/index.ts` — limpar override (remover timeline forçada)

