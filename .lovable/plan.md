## Mudança de lógica e visual: "Necessita Fiscal?" no lugar de "Cobrança em nome de"

### Resumo

- Trocar o conceito **"Cobrança em nome de Dachser/Cliente"** por **"É necessário contabilização com o fiscal?"** (Sim/Não), que é o que de fato decide o roteamento `RASCUNHO → FISCAL` ou `RASCUNHO → FINANCEIRO`.
- Remover toda exibição visível de "Cobrança em nome de" (formulários, coluna, filtros, badges).
- Adicionar, em todos os formulários de voucher, um modal **"Lista de fornecedores que não necessitam de ação fiscal"** (botão ao lado do novo campo).
- Manter compatibilidade total com a estrutura existente do MariaDB usando a coluna atual `cobranca_em_nome_de` como armazenamento interno (`DACHSER` = precisa fiscal, `CLIENTE` = não precisa). **Sem mudança de schema.**

### 1. Mapeamento da regra (sem mudar DB)

A coluna `t_vouchers.cobranca_em_nome_de` continua existindo, porém deixa de ser exposta como "cobrança". Passa a ser tratada na UI como flag `necessitaFiscal`:


| UI nova                      | Valor armazenado em `cobranca_em_nome_de` |
| ---------------------------- | ----------------------------------------- |
| Sim → enviar para Fiscal     | `DACHSER`                                 |
| Não → enviar para Financeiro | `CLIENTE`                                 |


Toda a lógica de roteamento já existente em `VoucherRascunhoActions.tsx` e `VoucherOperacaoActions.tsx` continua funcionando sem alteração:

```ts
} else if (voucher.cobrancaEmNomeDe === "DACHSER") {
  proximaEtapa = "FISCAL";
} else {
  proximaEtapa = "FINANCEIRO";
}
```

### 2. Tipos (`src/types/voucher.ts`)

- Adicionar getter de conveniência: `necessitaFiscal: boolean` derivado de `cobrancaEmNomeDe === "DACHSER"` (ou expor helper `getNecessitaFiscal(v)`).
- Manter `CobrancaEmNomeDe` como tipo interno (não removido para não quebrar persistência).

### 3. Formulários — substituir o select e adicionar o modal

Arquivos:

- `src/components/esteira/CreateVoucherDialog.tsx`
- `src/components/esteira/EditVoucherDialog.tsx`
- `src/components/esteira/VoucherMasterForm.tsx`

Mudanças em cada um:

- Renomear o campo do form para `necessitaFiscal: "SIM" | "NAO"`.
- Label: **"É necessário contabilização com o fiscal?"** com asterisco obrigatório.
- Opções:
  - `Sim — enviar para o Fiscal` → grava `cobranca_em_nome_de = "DACHSER"`
  - `Não — enviar diretamente para o Financeiro` → grava `cobranca_em_nome_de = "CLIENTE"`
- Ao lado do campo: botão `ⓘ Ver fornecedores que não precisam de ação fiscal` que abre um modal com a lista (componente novo abaixo).
- No `submit`, manter a gravação em `cobranca_em_nome_de` (mapear `SIM→DACHSER`, `NAO→CLIENTE`).
- Pré-preenchimento: ao editar, mapear `DACHSER→SIM`, `CLIENTE→NAO`.

### 4. Novo componente: `FornecedoresSemFiscalDialog.tsx`

Local: `src/components/esteira/FornecedoresSemFiscalDialog.tsx`.

- Modal (`Dialog`) com:
  - Título: "Fornecedores que não necessitam de ação fiscal"
  - Descrição curta
  - Campo de busca por CNPJ ou nome
  - Tabela: CNPJ | Razão Social
  - Lista hardcoded em `src/data/fornecedoresSemFiscal.ts` (array de `{ cnpj, nome }`) com os ~37 itens fornecidos pelo usuário (deduplicando o LECHMAN duplicado).
- Reutilizado pelos 3 formulários acima.

### 5. Tela principal e filtros — remover "Cobrança"

- `**src/components/voucher/VoucherTable.tsx**`:
  - Remover `Select` de filtro `cobrancaEmNomeDe` (linhas 107-117).
  - Remover `<TableHead>Cobrança</TableHead>` e a `<TableCell><Badge>{voucher.cobrancaEmNomeDe}` (linhas 142, 181-183). Coluna deixa de existir.
  - Remover `cobrancaEmNomeDe` do tipo `FilterValues` exportado.
- `**src/components/esteira/VoucherFilters.tsx**`:
  - Remover bloco "Cobrança em nome de" (linhas 90-103) e o campo `cobrancaEmNomeDe` de `FilterValues` e dos defaults.
- `**src/pages/esteira/EsteiraIndex.tsx**`:
  - Remover do estado `filters` o campo `cobrancaEmNomeDe` (l. 569) e o quick filter `quickFilterCobranca` (l. 602, 1483-1486, 2072-2086).
  - Remover o filtro condicional (l. 1331-1334).
  - Manter intactos os mapeamentos de leitura (`cobrancaEmNomeDe: v.cobranca_em_nome_de || "DACHSER"`) — são necessários para o roteamento e a lógica de retorno (l. 1680-1681).

### 6. Outras telas que ainda exibem "Cobrança"

Esconder/remover apenas a **exibição visual** (mantendo dados):

- `src/components/voucher/VoucherDetailsView.tsx` e `src/components/esteira/VoucherDetailsView.tsx`: remover o campo "Cobrança em nome de"
- `src/utils/voucherPdfExport.ts`: remover a coluna "Cobrança" do PDF (l. 46).
- `src/pages/esteira/EsteiraManual.tsx`: atualizar texto do FAQ (l. 71).
- `src/components/tabs/ReportsTab.tsx`: remover qualquer coluna de cobrança da exibição (mantendo o mapeamento interno).

### 7. Backend — sem alteração

- `mariadb-proxy`, `voucher-integrate-rm`, `voucher-mariadb-setup`, `voucher-mariadb-migrate`: **não tocar**. A coluna `cobranca_em_nome_de` continua existindo e sendo populada exatamente como hoje (`DACHSER`/`CLIENTE`). Isso preserva integração RM e logs históricos.

### 8. Memória

Atualizar `mem://vouchers/workflow-logic-and-stages-v6` adicionando:

> A decisão `RASCUNHO → FISCAL` vs `RASCUNHO → FINANCEIRO` é exposta na UI como **"É necessário contabilização com o fiscal?"** (Sim/Não). Internamente persistida em `t_vouchers.cobranca_em_nome_de` como `DACHSER` (Sim) / `CLIENTE` (Não). O termo "Cobrança em nome de" foi removido da UI.

### Arquivos alterados

- `src/types/voucher.ts` (helper)
- `src/data/fornecedoresSemFiscal.ts` (novo)
- `src/components/esteira/FornecedoresSemFiscalDialog.tsx` (novo)
- `src/components/esteira/CreateVoucherDialog.tsx`
- `src/components/esteira/EditVoucherDialog.tsx`
- `src/components/esteira/VoucherMasterForm.tsx`
- `src/components/voucher/VoucherTable.tsx`
- `src/components/esteira/VoucherFilters.tsx`
- `src/pages/esteira/EsteiraIndex.tsx`
- `src/components/voucher/VoucherDetailsView.tsx`
- `src/components/esteira/VoucherDetailsView.tsx`
- `src/utils/voucherPdfExport.ts`
- `src/pages/esteira/EsteiraManual.tsx`
- `src/components/tabs/ReportsTab.tsx`
- `.lovable/memory/vouchers/workflow-logic-and-stages-v6.md`

### Validação

1. Criar voucher novo escolhendo "Sim" → vai para Fiscal. Escolhendo "Não" → vai direto para Financeiro.
2. Editar voucher existente: o estado vem corretamente pré-selecionado (DACHSER→Sim, CLIENTE→Não).
3. Tela principal `/fin/esteira`: nenhuma coluna ou filtro de "Cobrança" visível. Quick filter removido.
4. Modal "Fornecedores que não necessitam de ação fiscal" abre nos 3 formulários, busca funciona.
5. Voucher legado continua roteando corretamente; integração RM e relatórios seguem funcionando.

### Riscos

- Sem mudança de schema. Sem mudança de backend.
- Possível confusão temporária com vouchers antigos cuja decisão foi tomada por critério diferente — mitigação: o significado funcional (`DACHSER ↔ vai pro fiscal`) já era o que acontecia na prática.