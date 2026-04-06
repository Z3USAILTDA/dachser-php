

## Plano: Ocultar AWB 045-21167576 do Tracking Aéreo

### O que será feito

1. **Inserir o AWB na tabela `air_hidden_awbs`** via migration, para que fique persistido no banco.

2. **Adicionar filtro de AWBs ocultos no `fetch-tracking-aereo`**
   - Após conectar ao MariaDB, consultar a tabela `air_hidden_awbs` no Supabase para obter a lista de AWBs ocultos.
   - Filtrar os resultados antes de retornar, removendo qualquer AWB presente na lista.

### Arquivos alterados
- `supabase/functions/fetch-tracking-aereo/index.ts` — adicionar leitura da tabela `air_hidden_awbs` e filtro nos resultados (mesma lógica do `fetch-status-aereo`)

### Migration
```sql
INSERT INTO air_hidden_awbs (awb, reason) 
VALUES ('045-21167576', 'MANUAL') 
ON CONFLICT (awb) DO NOTHING;
```

