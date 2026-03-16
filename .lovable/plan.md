

## Plano: AWBs com DLV vão para HIDDEN_AWBS (permanente)

### Objetivo
Quando um AWB atinge o status `DLV`, ele deve ser adicionado permanentemente à lista de ocultos, impedindo que reapareça mesmo que uma atualização futura retorne falha de rastreio ou outro status.

### Situação Atual
- Linha 2444-2445: AWBs com `DLV`/`DELIVERED` são filtrados da visualização, mas apenas por verificação de status atual
- Se numa atualização seguinte o rastreio falha ou retorna outro status, o AWB pode reaparecer
- `HIDDEN_AWBS` é uma lista estática no código

### Solução
Criar uma tabela no banco de dados para armazenar AWBs que atingiram DLV, e consultá-la na edge function para tratá-los como ocultos permanentes.

1. **Nova tabela `air_hidden_awbs`** com colunas: `id`, `awb` (unique), `reason` (ex: 'DLV'), `created_at`
2. **Na edge function `fetch-status-aereo`**: após processar os rows, identificar AWBs com status DLV/DELIVERED e inserir na tabela (upsert). No início da função, carregar os AWBs da tabela e adicioná-los ao `HIDDEN_AWBS` set
3. O filtro existente na linha 2442 (`HIDDEN_AWBS.has(awb)`) já cuida de ocultar — basta popular o set com os dados da tabela

### Mudanças Técnicas

**Migração SQL:**
```sql
CREATE TABLE public.air_hidden_awbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  awb text NOT NULL UNIQUE,
  reason text DEFAULT 'DLV',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.air_hidden_awbs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON public.air_hidden_awbs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role can insert" ON public.air_hidden_awbs FOR INSERT WITH CHECK (true);
```

**Edge function `fetch-status-aereo/index.ts`:**
- Antes do filtro: consultar `air_hidden_awbs` via Supabase client e adicionar todos os AWBs ao set `HIDDEN_AWBS`
- Após processar rows: identificar AWBs com DLV/DELIVERED (exceto override-protected) e fazer upsert na tabela `air_hidden_awbs`
- O filtro existente na linha 2442 já oculta automaticamente

### Comportamento Resultante
- AWB atinge DLV → gravado em `air_hidden_awbs` → nunca mais aparece
- Se o MariaDB retornar falha ou status diferente para esse AWB, ele continua oculto
- AWBs com override manual ativo continuam protegidos e visíveis

### Arquivos Afetados
- Nova migração SQL (tabela `air_hidden_awbs`)
- `supabase/functions/fetch-status-aereo/index.ts`

