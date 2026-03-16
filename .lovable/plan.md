

## Plano: Corrigir badge "Sem IMO" para só aparecer quando realmente não há IMO

### Problema
O badge "Sem IMO" aparece mesmo quando o IMO já foi resolvido e salvo no banco. Isso ocorre porque a query SQL que busca os dados do monitoramento (`get_sea_tracking`) obtém o `vessel_imo` apenas da CTE `latest_vessel`, que pega a linha com o `navio` mais recente (por `last_check DESC`). Se essa linha específica não tem `vessel_imo` preenchido, o campo volta NULL — mesmo que outra linha do mesmo MBL tenha o IMO resolvido.

### Solução

**1. Corrigir a query SQL no `olimpo-proxy` (get_sea_tracking)**

Na seleção final (linha ~1923), trocar:
```sql
MAX(lv.vessel_imo) as vessel_imo,
```
Por uma lógica que busca o `vessel_imo` de qualquer container do MBL que tenha o valor preenchido, com fallback para o da CTE `latest_vessel`:
```sql
COALESCE(
  MAX(lv.vessel_imo),
  (SELECT vi.vessel_imo FROM dados_dachser.t_tracking_sea vi 
   WHERE vi.mbl_id = ts.mbl_id AND vi.vessel_imo IS NOT NULL AND vi.vessel_imo != '' 
   LIMIT 1)
) as vessel_imo,
```

Isso garante que se qualquer registro do MBL tiver o IMO resolvido, ele será retornado.

**2. Frontend já está correto**

A condição `!mbl.vessel_imo && mbl.navio` no `ContainerTracking.tsx` (linha 2421) já funciona corretamente — só mostra "Sem IMO" quando `vessel_imo` é falsy. O problema é exclusivamente na query que não retorna o IMO quando ele existe.

### Arquivo afetado
- `supabase/functions/olimpo-proxy/index.ts` — alterar a query do `get_sea_tracking` (linha 1923)

