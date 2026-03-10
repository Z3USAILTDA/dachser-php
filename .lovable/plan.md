

## Plano: Demonstrativo de Cobrança como Anexo PDF no E-mail

### Contexto
O demonstrativo de cobrança (planilha com containers, custos, períodos) deve ser enviado como **anexo** no e-mail, não embutido no corpo HTML. O corpo do e-mail será a notificação simples (alerta de free time), e o demonstrativo vai como arquivo Excel ou PDF anexado.

### Abordagem
Gerar o demonstrativo como **arquivo Excel (.xlsx)** diretamente na Edge Function usando a biblioteca `xlsx` (disponível via esm.sh no Deno). O Resend suporta anexos via a propriedade `attachments` com conteúdo base64.

### Alterações

#### 1. Edge Function `demurrage-send-alert/index.ts`
- Importar biblioteca `xlsx` (esm.sh)
- Criar função `generateDemonstrativoXlsx()` que gera um arquivo Excel seguindo o modelo DACHSER:
  - Header: logo texto "DACHSER BRASIL LOGISTICA LTDA", endereço, CNPJ
  - Título: "DEMONSTRATIVO DE COBRANÇA - DEMURRAGE"
  - Campos: Consignee, Partner ID, House BL, Shipment, Origem, Destino, Data
  - Tabela: Container, Medida, Tipo, Descarga, Free Time, Limite de Devolução, Devolução, Dias em Posse, Dias Incidentes, Valor Diária USD (1° e 2° Período)
  - Rodapé: TOTAL USD, TAXA USD, TOTAL BRL
  - Texto de contestação (48h úteis)
- Retornar como buffer base64
- No envio via Resend, incluir `attachments: [{ filename: 'Demonstrativo_Demurrage_<container>.xlsx', content: base64 }]`
- O corpo do e-mail (HTML) passa a ser apenas a notificação simples com assinatura DACHSER, sem a tabela de custos embutida

#### 2. Expandir `AlertRequest` (na edge function)
Adicionar campos para popular o demonstrativo:
- `containers`: array com `number`, `type`, `size`, `discharge_date`, `free_time_days`, `return_deadline`, `return_date`, `days_possession`, `days_incident`, `rate_period1_usd`, `rate_period2_usd`
- `house_bl`, `partner_id`, `origin_port`, `destination_port`, `exchange_rate`, `total_usd`, `total_brl`

#### 3. `useSendTestAlert` em `useDemurrageData.ts`
Atualizar o mutation para enviar os dados completos da `PreInvoice` e seus `items` ao edge function, mapeando para a estrutura esperada.

#### 4. `SendTestEmailDialog.tsx`
Atualizar para passar `preInvoice` completa (com items) ao hook, para que o demonstrativo contenha dados reais do processo.

### Arquivos Afetados
| Arquivo | Ação |
|---|---|
| `supabase/functions/demurrage-send-alert/index.ts` | Reescrever: corpo simples + anexo Excel |
| `src/hooks/useDemurrageData.ts` | Expandir payload do `useSendTestAlert` |
| `src/components/demurrage/SendTestEmailDialog.tsx` | Passar dados completos da pré-fatura |

