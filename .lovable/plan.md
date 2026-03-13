

## Plano: Adicionar MSC e ONE ao Tracker da Status Doc Exportação

### Contexto
O projeto "Hapag-Lloyd Tracker" possui edge functions `track-msc` e `track-one` que consultam as APIs da MSC e ONE respectivamente. O painel Tracker na tela "Status Doc Exportação" (`HapagTrackerPanel.tsx`) atualmente só suporta Hapag-Lloyd via `draft-track-hapag-multi`. Precisamos replicar a funcionalidade multi-armador.

### O que será feito

#### 1. Criar Edge Functions `draft-track-msc` e `draft-track-one`
Copiar a lógica exata das funções do outro projeto:
- **`supabase/functions/draft-track-msc/index.ts`** — cópia do `track-msc` (consulta API MSC via `https://www.msc.com/api/feature/tools/TrackingInfo`)
- **`supabase/functions/draft-track-one/index.ts`** — cópia do `track-one` (consulta API ONE via `https://ecomm.one-line.com/api/v1/edh/containers/track-and-trace/...`)

Ambas usam cookies opcionais (`MSC_COOKIE`, `ONE_COOKIE`) como secrets.

#### 2. Adicionar Secrets `MSC_COOKIE` e `ONE_COOKIE`
Solicitar ao usuário os valores dos cookies para as APIs MSC e ONE (mesmos do outro projeto).

#### 3. Atualizar `HapagTrackerPanel.tsx`
Transformar em tracker multi-armador:
- Adicionar seletor de armador (Auto-detectar / Hapag-Lloyd / MSC / ONE) com botões visuais no estilo Dachser (fundo escuro, bordas douradas quando ativo)
- Auto-detecção pelo prefixo do valor digitado: `MEDU`/`EBKG` → MSC, `ONEY` → ONE, default → Hapag
- Rotear a chamada para a edge function correta (`draft-track-hapag-multi`, `draft-track-msc`, `draft-track-one`)
- Adaptar o `handleSave` para enviar `tipo_processo` correto (MSC/ONE/HAPAG) ao `draft-save-tracking`
- A UI de resultados (BookingResultCard, ContainersTable, EventsTable) já é genérica o suficiente — os dados da MSC e ONE seguem a mesma interface

#### 4. Atualizar `src/types/draft.ts`
Adicionar campos opcionais que a MSC/ONE retornam (ex: `vesselFlag`, `vesselFlagName`, `numberOfContainers`, `statusCode` nos eventos) para compatibilidade sem quebrar o existente.

### Arquivos
| Ação | Arquivo |
|---|---|
| Novo | `supabase/functions/draft-track-msc/index.ts` |
| Novo | `supabase/functions/draft-track-one/index.ts` |
| Editar | `src/components/draft/HapagTrackerPanel.tsx` |
| Editar | `src/types/draft.ts` (campos opcionais) |

### Secrets necessários
- `MSC_COOKIE` — cookie de sessão para a API MSC
- `ONE_COOKIE` — cookie de sessão para a API ONE

