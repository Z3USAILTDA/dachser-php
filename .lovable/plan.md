## Objetivo

Replicar no CCT o padrão da tela de tracking aérea: processos cujo último evento é "Entregue" são persistidos numa **tabela própria** `cct_hidden_hawbs` e ocultados do dashboard **somente após 5 dias** da data do evento de entrega. Antes disso, continuam visíveis normalmente. Reaparecem em qualquer momento via busca explícita.

## Padrão de referência (Air)

`supabase/functions/fetch-status-aereo/index.ts` usa `air_hidden_awbs` (tabela exclusiva do módulo aéreo) com upsert dos AWBs entregues, e a regra de 5 dias é aplicada na filtragem do payload.

Para CCT criaremos tabela **separada** (`cct_hidden_hawbs`) — não reutilizar `air_hidden_awbs`, conforme solicitado.

## Mudança proposta

### 1. Migração — nova tabela `cct_hidden_hawbs`

```sql
CREATE TABLE public.cct_hidden_hawbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hawb text NOT NULL UNIQUE,
  reason text DEFAULT 'ENTREGUE',
  delivered_at timestamptz NOT NULL,   -- data do evento "Entregue" da timeline
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.cct_hidden_hawbs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view"
  ON public.cct_hidden_hawbs FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anyone can insert"
  ON public.cct_hidden_hawbs FOR INSERT WITH CHECK (true);

CREATE INDEX idx_cct_hidden_hawbs_hawb ON public.cct_hidden_hawbs (hawb);
CREATE INDEX idx_cct_hidden_hawbs_delivered_at ON public.cct_hidden_hawbs (delivered_at);
```

A coluna `delivered_at` é o que dispara a regra de 5 dias. Espelha as RLS de `air_hidden_awbs` (sem UPDATE/DELETE).

### 2. Edge Function — `mariadb-proxy` action `get_cct_shipments_cached`

Em `supabase/functions/mariadb-proxy/index.ts`, dentro do `case 'get_cct_shipments_cached'`:

**a) Detectar entregues e gravar `delivered_at`**
Para cada linha de `cachedRows`, varrer `eventos` (já ordenados) e identificar o último evento com descrição contendo "entreg". Se for o último evento da timeline:
```ts
const FIVE_DAYS_MS = 5 * 24 * 60 * 60 * 1000;

const newlyDelivered = cachedRows
  .map(r => ({ row: r, deliveredAt: getDeliveredAtFromTimeline(r.eventos) }))
  .filter(x => x.deliveredAt)
  .map(x => ({
    hawb: x.row.hawb,
    reason: 'ENTREGUE',
    delivered_at: x.deliveredAt
  }));

if (newlyDelivered.length > 0) {
  await supabaseClient.from('cct_hidden_hawbs')
    .upsert(newlyDelivered, { onConflict: 'hawb', ignoreDuplicates: true });
}
```

**b) Carregar ocultos e aplicar regra dos 5 dias**
```ts
const { data: hiddenRows } = await supabaseClient
  .from('cct_hidden_hawbs')
  .select('hawb, delivered_at');

const now = Date.now();
const expiredHidden = new Set(
  (hiddenRows || [])
    .filter(r => now - new Date(r.delivered_at).getTime() > FIVE_DAYS_MS)
    .map(r => r.hawb)
);
```

**c) Filtrar payload**
```ts
const visibleRows = body.includeHidden
  ? cachedRows
  : cachedRows.filter(r => !expiredHidden.has(r.hawb));
```

A action passa a aceitar `{ includeHidden?: boolean, searchHawb?: string }`. Quando `searchHawb` é fornecido, retorna registros mesmo ocultos para suportar busca histórica.

### 3. Frontend — `src/hooks/useCCTData.ts`

Adicionar parâmetro opcional `searchHawb` / `includeHidden`. Em modo busca, repassa ao edge para trazer também HAWBs já fora da janela dos 5 dias.

### 4. Frontend — `src/components/cct/ProcessosTable.tsx`

- Remover o filtro client-side de retenção de 5 dias atual (a lógica passa a viver no edge, com base no `delivered_at` real do evento, não em `updated_at`).
- Quando o usuário digita no campo de busca, disparar refetch do hook passando `searchHawb` para que processos ocultos por 5+ dias reapareçam.

### 5. Memória

Atualizar `mem://cct/visibility-and-retention-rules-v3` ou criar `mem://cct/hidden-hawbs-pattern`:
> Processos CCT entregues são persistidos em `public.cct_hidden_hawbs` (tabela exclusiva do CCT — não reutilizar `air_hidden_awbs`). Coluna `delivered_at` guarda a data do evento "Entregue" da timeline. Filtragem ocorre server-side no edge `mariadb-proxy`/`get_cct_shipments_cached`: o HAWB só é ocultado após **5 dias** desde `delivered_at`. Antes disso permanece visível. Busca explícita por HAWB ignora a ocultação.

## Arquivos afetados

- **Nova migração** criando `public.cct_hidden_hawbs`
- `supabase/functions/mariadb-proxy/index.ts` (case `get_cct_shipments_cached`)
- `src/hooks/useCCTData.ts`
- `src/components/cct/ProcessosTable.tsx`
- `.lovable/memory/cct/visibility-and-retention-rules-v3.md` (atualização)

## Resultado esperado

- HAWB com último evento "Entregue" continua visível no dashboard pelos primeiros 5 dias após a data do evento.
- Após 5 dias, é ocultado automaticamente da listagem padrão.
- Buscar pelo HAWB no campo de busca traz o processo de volta a qualquer momento.
- Tela de detalhe (`ProcessoTimeline`) continua acessível por URL direta.
- Tabela `cct_hidden_hawbs` é totalmente independente de `air_hidden_awbs`.
