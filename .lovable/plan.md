

# Ajustes no Módulo de Demurrage — Plano de Implementação

Este plano cobre 6 alterações solicitadas no módulo de Demurrage.

---

## 1. Base de dados igual ao monitoramento de tracking (filtro por ciclo operacional)

**Situação atual**: A sync (`demurrage_sync_from_tracking` no `mariadb-proxy`) carrega todos os containers ativos da `t_tracking_sea`, sem filtrar por ciclo operacional.

**Alteração**: Ajustar a query de sync para carregar apenas containers no ciclo relevante:
- **Importação**: Container visível desde Atracação (`ARRIVED`/`Discharged`) até Devolução de vazio (`RETURNED`/`Empty returned`)
- **Exportação**: Container visível desde Retirada de vazio (`Empty to shipper`/Gate-out) até Gate-in no porto

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (case `demurrage_sync_from_tracking`, ~linha 13498)
- Adicionar filtro WHERE que exclui containers fora do ciclo operacional
- Para importação: excluir se `container_status` não atingiu ao menos `ARRIVED/Discharged` (containers em trânsito ficam fora)
- Para exportação: excluir se não há evento de retirada de vazio

---

## 2. Incluir HBL e Tipo de Operação no Excel exportado

**Situação atual**: O Excel (`demurrageExcelExport.ts`) não inclui HBL nem tipo de operação.

**Alterações**:
- **`DemurrageContainer` interface** (`useDemurrageData.ts`): Confirmar que `tipo_processo` já existe (sim, linha 11). Precisamos adicionar `hbl` ao tipo e à query do backend.
- **Backend** (`mariadb-proxy`, ação `demurrage_get_containers`): Adicionar JOIN com `t_sea_master` ou `t_master_dados` para buscar o HBL correspondente ao MBL.
- **`demurrageExcelExport.ts`**: Adicionar colunas "HBL" e "Tipo Operação" no mapeamento de dados (após "MBL").

---

## 3. Campo "Taxa de Conversão" no Pré-Faturamento (dialog de informações)

**Situação atual**: O `PreInvoiceInfoDialog` possui campos Status, Othello, MISK e Observação. O campo `exchange_rate` já existe na tabela `t_dachser_demurrage_pre_invoices` mas não é editável.

**Alterações**:
- **`PreInvoiceInfoDialog.tsx`**: Adicionar campo Input numérico "Taxa de Conversão" com state `exchangeRate`, inicializado a partir de `pi.exchange_rate`. Incluir no `handleSave` como `exchange_rate`.
- **Backend** (`useUpdatePreInvoice`): Garantir que `exchange_rate` é aceito no update da pré-fatura.

---

## 4. Coluna "Total BRL" na tela principal (Monitor)

**Situação atual**: A tabela do DemurrageMonitor mostra apenas "Demurrage" (USD). 

**Alterações**:
- **`DemurrageMonitor.tsx`**: Adicionar coluna "Total BRL" ao lado de "Demurrage" (USD). O cálculo é `expected_cost_usd * exchange_rate` (ou usar uma taxa padrão se não houver exchange_rate definido).
- Pode ser necessário trazer `exchange_rate` do pre-invoice vinculado ao container ou usar um valor padrão do sistema.
- **`DemurrageContainer` interface**: Pode precisar de campo `exchange_rate` populado via backend.

---

## 5. Input manual de e-mail para envio de teste no Pré-Faturamento

**Situação atual**: Existe `useSendTestAlert` que chama `demurrage-send-alert` com `test_mode: true`, mas não há UI para definir o destinatário na tela de pré-faturamento.

**Alterações**:
- **Novo componente**: `SendTestEmailDialog.tsx` em `src/components/demurrage/`
  - Input para e-mail destinatário (editável)
  - Botão "Enviar E-mail de Teste"
  - Usa `useSendTestAlert` passando o e-mail definido e os dados da pré-fatura selecionada
- **`DemurragePreInvoicing.tsx`**: Adicionar opção "Enviar E-mail" no dropdown de ações de cada pré-fatura, que abre o dialog acima.

---

## 6. Cadastro de Free Time na tela de Demurrage (modal remodelado)

**Situação atual**: O `RegisterFreeTimeDialog` é usado na tela de monitoramento marítimo. Na Demurrage (`DemurrageFreeTimes`) existe apenas edição/exclusão, sem botão de criação com o modal.

**Alterações no modal (novo `DemurrageFreeTimeDialog.tsx`)**:
- Baseado no `RegisterFreeTimeDialog` existente, com as seguintes mudanças:
  1. **Código Cliente (Customer Number) + CNPJ**: Ao digitar o nome do cliente, buscar na `t_clientes_base` (autocomplete similar ao já usado no cadastro SEA via `olimpo-proxy`). Quando selecionado, preencher automaticamente CNPJ e guardar o `customer_number` (partner_id).
  2. **"Por tipo de container"**: Adicionar campo Select de tipo de container em AMBOS os tipos (CONTRATO e PROCESSO), não apenas em um.
  3. **Remover campo "Armador"**: Excluir o select de Armador do formulário.
- **`DemurrageFreeTimes.tsx`**: Adicionar botão "Cadastrar Free Time" que abre o novo dialog.
- **Backend** (`client-freetime-crud`): Ajustar para aceitar `customer_number` e `tipo_conteiner` nos campos de criação.
- **Backend** (`mariadb-proxy` ou `olimpo-proxy`): Reutilizar a busca de clientes existente (`t_clientes_base`) para o autocomplete.

---

## Resumo de Arquivos

| # | Arquivo | Tipo |
|---|---------|------|
| 1 | `supabase/functions/mariadb-proxy/index.ts` | Backend (sync + get_containers) |
| 2 | `src/hooks/useDemurrageData.ts` | Interface + hooks |
| 3 | `src/utils/demurrageExcelExport.ts` | Excel export |
| 4 | `src/components/demurrage/PreInvoiceInfoDialog.tsx` | Dialog taxa conversão |
| 5 | `src/pages/demurrage/DemurrageMonitor.tsx` | Coluna BRL |
| 6 | `src/components/demurrage/SendTestEmailDialog.tsx` | Novo - envio email teste |
| 7 | `src/pages/demurrage/DemurragePreInvoicing.tsx` | Integrar email dialog |
| 8 | `src/components/demurrage/DemurrageFreeTimeDialog.tsx` | Novo - cadastro FT |
| 9 | `src/pages/demurrage/DemurrageFreeTimes.tsx` | Integrar FT dialog |
| 10 | `supabase/functions/client-freetime-crud/index.ts` | Backend FT (ajustes) |

