## Plano: Suporte a múltiplas conexões na rota — IMPLEMENTADO ✅

### Alterações realizadas

1. **Backend** (`supabase/functions/fetch-status-aereo/index.ts`):
   - Removido filtro `airport !== originUpper` — aeroportos como GRU são conexões legítimas
   - `connectionAirports.join(',')` em vez de `connectionAirports[0]` — retorna todas as conexões
   - Fallback de segmentos de rota também retorna múltiplas conexões ordenadas cronologicamente

2. **Frontend** (`src/pages/Index.tsx`):
   - Split de `awb.conexao` por vírgula para obter array de conexões
   - Renderiza cada conexão como segmento separado: `FRA → ZRH → GRU → VCP`
   - Highlight dinâmico: última conexão destacada quando status é AT_CONEXAO/DEP
