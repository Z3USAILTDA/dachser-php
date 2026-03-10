

## Plano: Melhorias no Módulo Financeiro (FIN + Olimpo)

Este plano está dividido em 3 blocos: Régua de Cobrança, Esteira de Vouchers e Olimpo Cobrança.

---

### BLOCO 1: RÉGUA DE COBRANÇA — Montante por estágio

**Problema**: A régua exibe apenas a contagem de títulos por estágio, sem mostrar o valor total.

**Solução**:

1. **`mariadb-proxy` — `get_regua_counts`**: Expandir a query SQL para incluir `SUM(t.valor_nf)` por estágio, retornando `counts` e `amounts` (ex: `{ PRE: { count: 10, amount: 150000 }, ... }`).

2. **`ReguaCobranca.tsx`**: Atualizar a interface `StageCounts` para incluir montantes. Exibir o valor formatado abaixo de cada bolha na régua (ex: `R$ 150K`).

**Arquivos**: `supabase/functions/mariadb-proxy/index.ts`, `src/pages/ReguaCobranca.tsx`

---

### BLOCO 2: ESTEIRA DE VOUCHERS

#### 2a. Operacional vê etapa 'A_PROCESSAR'
**Status**: Já implementado (linha 1195-1200 de `EsteiraIndex.tsx`). Verificar se o auto-filtro de etapa (linha 651-663) não está sobrescrevendo — quando `role === "OPERACAO"`, o filtro é setado para `"OPERACAO"`, excluindo `A_PROCESSAR`. 

**Correção**: Quando o role for OPERACAO, não setar filtro de etapa automático (deixar `"all"`) para que o `roleFilteredVouchers` cuide da filtragem.

**Arquivo**: `src/pages/esteira/EsteiraIndex.tsx` (linhas 651-663)

#### 2b. Filtros não funcionam
**Diagnóstico**: Os filtros inline da `VoucherTable` (linhas 320-431) estão mapeados a campos corretos, e o `filterVouchers` (linhas 1207-1394) aplica todos. Possível problema: a `VoucherTable` recebe vouchers já filtrados de `EsteiraIndex`, mas os filtros inline estão duplicados — ou seja, a tabela filtra vouchers que já foram filtrados. 

**Investigação necessária**: Verificar se `VoucherTable` recebe `filteredVouchers` ou `sortedVouchers`. Na chamada da tabela, os vouchers já passaram por `filterVouchers()` em `EsteiraIndex`. Os filtros inline da VoucherTable são apenas visuais (inputs) que atualizam o state de `filters`, que volta ao `EsteiraIndex` via `onFilterChange`. 

**Correção**: Garantir que a `VoucherTable` recebe os vouchers já filtrados E que os inputs de filtro da tabela estão corretamente vinculados aos campos do `FilterValues`.

**Arquivo**: `src/pages/esteira/EsteiraIndex.tsx`, `src/components/esteira/VoucherTable.tsx`

#### 2c. Cor diferente para processo que voltou de outra etapa
**Solução**: Detectar vouchers com `ajusteOperacao` ou `ajusteFiscal` preenchidos (indica devolução). Adicionar classe visual (ex: borda lateral laranja ou fundo amarelo sutil) na `VoucherTable` para essas linhas.

**Arquivo**: `src/components/esteira/VoucherTable.tsx`

#### 2d. Boleto sendo atribuído como Transferência
**Causa raiz identificada**: Em `voucher-integrate-rm/index.ts` (linha 48-55), a função `mapFormaPagamento` tem default `"TRANSFERENCIA_PIX"` e mapeia incorretamente. Quando o valor do RM é `BOL`, ele retorna `TRANSFERENCIA_PIX` porque o mapeamento usa `.includes("BOLETO")` (não captura `"BOL"`).

**Correção**: Atualizar `mapFormaPagamento` em `voucher-integrate-rm/index.ts` para:
- `BOL` → `BOLETO`
- Default: `BOLETO` (em vez de `TRANSFERENCIA_PIX`)
- Alinhar com o mapeamento do `mariadb-proxy` que já está correto

**Arquivo**: `supabase/functions/voucher-integrate-rm/index.ts`

#### 2e. `regras_forma_pag` = 'Boleto' quando forma de pagamento for BOLETO
**Causa raiz**: Em `insert_dados_rm` (mariadb-proxy linhas 7731-7753), a lógica atual determina `regras_forma_pag` baseada no banco (DOC/Crédito CC). Não verifica se é boleto.

**Correção**: Adicionar verificação prévia: se `formaPag === 'BOLETO'`, setar `regrasFormaPagFinal = "Boleto"` e pular a lógica de banco. Aplicar mesma correção em `sync_baixa_remessa_to_dados_rm`.

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts`

#### 2f. Aba Pagamentos: Soma de vouchers selecionados
**Solução**: Em `PagamentosTab.tsx`, adicionar state para vouchers selecionados via checkbox. Exibir barra de resumo com a soma dos valores quando houver seleção.

**Arquivo**: `src/components/esteira/PagamentosTab.tsx`

#### 2g. Aba Pagamentos: "A vencer" com número de processos e valor total
**Solução**: Filtrar os itens da aba de pagamentos que NÃO possuem vencimento próprio (campo `vencimento` nulo ou padrão). Exibir KPI com contagem e soma de valores.

**Arquivo**: `src/components/esteira/PagamentosTab.tsx`

---

### BLOCO 3: OLIMPO — COBRANÇA

#### 3a. Exportar em Excel
**Solução**: Adicionar botão "Exportar" no header usando a lib `xlsx` já instalada. Exportar a tabela de aging com todas as colunas visíveis.

#### 3b. Agrupar clientes de mesmo nome
**Solução**: Na query `get_aging_by_client`, agrupar por `TRIM(razao_social)` normalizado em vez de razão social + CNPJ individual.

#### 3c. Revisar porcentagens
**Solução**: Adicionar linha de porcentagens na tabela (como na imagem de referência): cada célula mostra `valor / total * 100%`. A imagem mostra: Not Overdue 72.10%, 0-30: 16.67%, etc.

#### 3d. Organizar por quantidade (Maior → Menor)
**Solução**: Na aba Client, ordenar por contagem total de faturas (desc) em vez de valor.

#### 3e. Visualização por cliente (Sheet lateral)
**Solução**: Criar componente `ClientDetailSheet` (Sheet lateral como em Demurrage) que ao clicar em um cliente exibe:
1. Informações de envio automático de e-mail de cobrança (status, último envio, próximo envio)
2. Breakdown por CNPJ quando o cliente tem mais de um CNPJ
3. Campo de observação editável por CNPJ (salvo em nova tabela MariaDB `t_cobranca_observacoes`)

**Nova tabela MariaDB** (via migration no mariadb-proxy):
```sql
CREATE TABLE IF NOT EXISTS dados_dachser.t_cobranca_observacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cnpj VARCHAR(20) NOT NULL,
  observacao TEXT,
  updated_by VARCHAR(100),
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_cnpj (cnpj)
)
```

#### 3f. Adicionar BAD DEBTS
**Solução**: Com base na imagem de referência, adicionar uma linha "Sum of 360+" com destaque (fundo amarelo/vermelho) na tabela. Adicionar coluna ou seção de Bad Debts (> 360 dias), mostrando valor e % do total.

#### 3g. Tirar paginação, usar rolagem
**Solução**: Remover a lógica de paginação na aba Client. Usar `max-height` com `overflow-y: auto` no container da tabela, mantendo o tamanho do card.

#### 3h. Faixa 0-30 como 1%
**Solução**: Adicionar coluna/faixa "0-30" no aging, separando de "< 90". Atualizar query SQL para `BETWEEN 0 AND 30` e `BETWEEN 31 AND 90`. Mostrar 1% como peso de provisão.

#### 3i. Resumo baseado no Excel
**Solução**: Adicionar card de resumo com os dados do modelo Working Capital:
- Total Receivable, Total Overdue, % Overdue
- Tabela tipo o modelo: Not Overdue | 0-30 | 31-60 | 61-90 | 91-120 | 121-180 | 181-240 | 241-365 | 365+
- Linhas: Valor, % do total, % provisão (1%, 1%, 1%, 25%, 25%, 50%, 75%, 100%), Valor provisionado
- Grand Total e Total Overdue à direita

#### 3j. Campo de observação por CNPJ
Coberto no item 3e (dentro da visualização por cliente).

---

### Resumo de Arquivos Afetados

| Arquivo | Alterações |
|---|---|
| `supabase/functions/mariadb-proxy/index.ts` | Régua counts com SUM, insert_dados_rm com Boleto, aging faixas, nova action para observações |
| `src/pages/ReguaCobranca.tsx` | Exibir montantes na régua |
| `src/pages/esteira/EsteiraIndex.tsx` | Fix auto-filtro OPERACAO, garantir filtros corretos |
| `src/components/esteira/VoucherTable.tsx` | Cor para processos devolvidos |
| `src/components/esteira/PagamentosTab.tsx` | Soma selecionados, KPI "A vencer" |
| `supabase/functions/voucher-integrate-rm/index.ts` | Fix mapFormaPagamento (BOL→BOLETO) |
| `src/pages/olimpo/OlimpoCobranca.tsx` | Excel export, scroll, agrupamento, faixas, Bad Debts, resumo, sheet lateral |

### Ordem de Implementação
1. Fixes críticos: Boleto mapping + regras_forma_pag
2. Esteira: filtros, cores, Pagamentos
3. Régua: montantes
4. Olimpo: todas as melhorias

