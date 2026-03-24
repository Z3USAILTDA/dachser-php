

## Plano: Corrigir dados da Notificação de Cobrança (Demurrage)

### Problemas

1. **Título do email** diz "NOTIFICAÇÃO ( ALERTA DE FREE TIME)" — deveria ser "NOTIFICAÇÃO DE COBRANÇA"
2. **Partner ID** não é enviado — o hook `useSendTestAlert` não recebe dados do `DemurrageContainer` que tem o `partner_id` enriquecido
3. **House BL** usa `preInvoice.bl_number` — deveria usar o `hbl` enriquecido dos containers (vem de `t_sea_master`)
4. **Dados dos containers no XLSX** — `size` (MEDIDA) está vazio (hardcoded `''`), deveria usar `tipo_conteiner`; `return_deadline` (LIMITE DE DEVOLUÇÃO) está vazio, deveria ser `free_time_end_date`

### Alterações

**1. Edge Function `supabase/functions/demurrage-send-alert/index.ts`**
- Linha 66: trocar `NOTIFICAÇÃO ( ALERTA DE FREE TIME)` por `NOTIFICAÇÃO DE COBRANÇA`
- Linha 399: trocar subject de `Notificação - Alerta de Free Time` por `Notificação de Cobrança`

**2. Hook `src/hooks/useDemurrageData.ts` — função `useSendTestAlert` (linhas 719-769)**
- Adicionar parâmetro opcional `containers: DemurrageContainer[]` na interface do mutation
- Extrair `partner_id` do primeiro container que tenha valor
- Extrair `hbl` do primeiro container para usar como `house_bl`
- No mapeamento dos items para `containers[]`:
  - `size` → usar `tipo_conteiner` do DemurrageContainer correspondente (match por `container_number` = `numero`)
  - `return_deadline` → usar `free_time_end_date` do DemurrageContainer correspondente

**3. Componente `src/components/demurrage/SendTestEmailDialog.tsx`**
- Adicionar prop `containers: DemurrageContainer[]`
- Passar ao `sendMutation.mutateAsync`

**4. Página `src/pages/demurrage/DemurragePreInvoicing.tsx`**
- Buscar os containers do grid filtrando pelo MBL da pré-fatura selecionada
- Passar ao `SendTestEmailDialog` via nova prop `containers`

### Resultado

| Campo XLSX | Antes | Depois |
|---|---|---|
| Título email | Alerta de Free Time | Notificação de Cobrança |
| Partner ID | vazio | `dchr_customer_number` do cliente |
| House BL | `bl_number` da pré-fatura (vazio) | `hbl` enriquecido do container |
| MEDIDA | vazio | `tipo_conteiner` (ex: 20DV, 40HC) |
| LIMITE DE DEVOLUÇÃO | vazio | `free_time_end_date` |

