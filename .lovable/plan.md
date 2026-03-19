

## Plano: Suporte a múltiplas conexões na rota

### Entendimento

O AWB 724-07783392 tem a rota **FRA → ZRH → GRU → VCP**. São **duas conexões** (ZRH e GRU), mas o sistema só suporta uma (`conexao` é um campo string único). Resultado: só mostra uma conexão e perde informação da rota completa.

### Alterações

#### 1. Backend — `supabase/functions/fetch-status-aereo/index.ts`

Mudar o campo `conexao` de string única para string com múltiplas conexões separadas por vírgula (ex: `"ZRH,GRU"`).

- **Linha 1281:** Em vez de `return connectionAirports[0]`, retornar `connectionAirports.join(',')` (todas as conexões encontradas via ARR)
- **Linha 1308:** No fallback de segmentos de rota, ordenar os aeroportos pela ordem de aparição nos segmentos e retornar todos: `return [...routeAirports].join(',')`
- **Remover filtro `airport !== originUpper`** da linha 1277 — como vimos, GRU é uma conexão legítima neste caso. O filtro correto é apenas `airport !== dest` (o destino final nunca é conexão)

**Lógica de ordenação:** Usar a ordem cronológica dos eventos ARR para garantir que ZRH vem antes de GRU.

#### 2. Frontend — `src/pages/Index.tsx`

Adaptar a exibição da rota para suportar múltiplas conexões:

- **Linhas 2748-2786:** Fazer split de `awb.conexao` por vírgula para obter array de conexões
- Renderizar: `FRA → ZRH → GRU → VCP` (cada conexão como span separado)
- **Highlight dinâmico:** Determinar qual segmento está ativo baseado no status:
  - `POST_DESTINO` → destino amarelo
  - `AT_CONEXAO` → última conexão amarela (a mais próxima do destino)
  - `DEP` com conexões → última conexão amarela
  - Senão → origem amarela

#### 3. Tipo — `src/pages/Index.tsx` (interface AWBProcess)

Nenhuma mudança necessária — `conexao` já é `string | null`, e strings com vírgula são compatíveis.

### Resultado esperado

- AWB 724-07783392: `FRA → ZRH → GRU → VCP` (duas conexões visíveis)
- AWBs com uma conexão: continuam funcionando normalmente (`FRA → ZRH → GRU`)
- AWBs sem conexão: continuam como `FRA → GRU`

### Arquivos modificados

1. `supabase/functions/fetch-status-aereo/index.ts` — retornar todas as conexões separadas por vírgula
2. `src/pages/Index.tsx` — renderizar múltiplas conexões na rota

