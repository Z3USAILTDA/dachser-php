# Vouchers em lote só avançam após todos os anexos obrigatórios

## Regra de roteamento (mesma do voucher individual)

Para cada voucher do lote, a etapa de destino é definida pelos campos da própria linha:

| Condição | Etapa de destino |
|---|---|
| `urgente = URGENTE_REAL` (urgência marcada manualmente) | **Supervisor** |
| `cobranca_em_nome_de = CLIENTE` (sem urgência real) | **Financeiro** |
| `cobranca_em_nome_de = DACHSER` (sem urgência real) | **Fiscal** |

Urgente automático (ICMS / Armazenagem) segue a mesma classificação do voucher individual: vai para Fiscal/Financeiro normalmente, sem desviar para Supervisor — só `URGENTE_REAL` desvia.

## Gate de anexos (vale para todos os destinos acima)

Nenhum voucher do lote sai do estado de espera enquanto não tiver:
- **Fatura** anexada (obrigatória para 100% dos vouchers).
- **Boleto** anexado, **se** `forma_pagamento = BOLETO`.

Sem um desses, o voucher fica retido — não vai para Fiscal, nem para Financeiro, nem para Supervisor.

## Implementação

### Backend (`supabase/functions/mariadb-proxy/index.ts`)

**`create_voucher_batch_import`**
- Calcular `etapaDestino` (Supervisor | Financeiro | Fiscal) pela regra acima.
- Inserir voucher com `etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'` (estado de espera novo, distinto de `A_PROCESSAR`).
- Persistir `etapaDestino` em nova coluna `etapa_destino` na `t_voucher_batch_import_item` (`ALTER TABLE ... ADD COLUMN IF NOT EXISTS etapa_destino VARCHAR(30)` no DDL do handler).
- `status_envio_cliente` continua sendo `AGUARDANDO_CLIENTE` quando `cobranca = CLIENTE`, `NAO_APLICA` caso contrário (igual hoje).

**`finalize_batch_import`**
- Validação atual de pendências (fatura para todos; boleto se `forma_pagamento = BOLETO`) continua sendo a porta de entrada — se houver pendência, retorna 422 e nada se move.
- Quando passar, para cada item válido:
  ```sql
  UPDATE dados_dachser.t_vouchers
     SET etapa_atual = ?,           -- etapa_destino do item
         updated_at = NOW()
   WHERE id = ?
     AND etapa_atual = 'AGUARDANDO_DOCUMENTOS_LOTE'
  ```
  Fallback: se `etapa_destino` estiver vazio (lotes antigos), recomputar pela regra usando `urgencia_tipo` e `cobranca_em_nome_de` do voucher.
- Log `VOUCHER_PROMOVIDO_LOTE` por voucher promovido, com a etapa de destino.

**Filtros das listas (Fiscal / Financeiro / Supervisor / Pagamentos)**
- Hoje filtram por etapa específica, então vouchers em `AGUARDANDO_DOCUMENTOS_LOTE` já ficam invisíveis nessas filas. Conferir e adicionar exclusão explícita onde houver filtro genérico (`etapa_atual != 'A_PROCESSAR'`).

### Frontend

**`BatchVoucherChecklist.tsx`**
- Mostrar a etapa de destino calculada como chip extra (ex.: "→ Fiscal", "→ Financeiro", "→ Supervisor") ao lado do badge de status, para o usuário entender para onde o voucher vai quando o lote for finalizado.
- Manter labels de pendência atuais ("Falta fatura", "Falta boleto", etc.).

**`BatchDocumentBinderDialog.tsx`**
- Sem mudança de fluxo. Botão "Finalizar lote" segue chamando `finalize_batch_import`; o backend agora é quem promove cada voucher para a etapa correta.
- Texto auxiliar no header: "Os vouchers só serão enviados para Fiscal, Financeiro ou Supervisor após todos os anexos obrigatórios e a finalização do lote."

## Resultado

- Lote sem anexos → 100% dos vouchers ficam em `AGUARDANDO_DOCUMENTOS_LOTE`, invisíveis em Fiscal/Financeiro/Supervisor.
- Ao finalizar com tudo anexado:
  - DACHSER + não-urgente real → Fiscal
  - CLIENTE + não-urgente real → Financeiro
  - Urgência real (qualquer cobrança) → Supervisor
