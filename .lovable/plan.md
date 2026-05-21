## Objetivo

Na esteira de vouchers (`/fin/esteira`), trocar os filtros de coluna **Enviado por** e **Criado por** — hoje campos de texto livre — por **multi-seleção via Popover + Checkbox com campo de busca interno**, no mesmo padrão visual já usado pelo filtro de **Etapa Atual**. As opções disponíveis são geradas dinamicamente a partir dos vouchers carregados.

## Mudanças

Somente UI/frontend. Sem backend, migration ou alteração de tipos do payload.

### 1. `src/components/esteira/VoucherTable.tsx`

- Aceitar duas novas props opcionais:
  - `enviadoPorOptions: string[]`
  - `criadoPorOptions: string[]`
- Substituir o `<Input>` da coluna **Enviado por** (linhas 417–424) por um `Popover` com checkboxes, espelhando o padrão do filtro de Etapa Atual (linhas 460–507), com os seguintes acréscimos:
  - **Campo de busca** (`<Input>` pequeno) no topo do Popover, com `useState` local, que filtra a lista por `includes` case-insensitive.
  - Lista rolável (`max-h-72 overflow-auto`) abaixo, mostrando apenas os itens que casam com a busca.
  - Valor armazenado em `filters.enviadoPor` como CSV (`"João,Maria"`) ou `""` (todos).
  - Trigger mostra "Todos" / nome único / "N selecionados".
  - Botão "Limpar" quando há seleção.
  - Mensagem "Nenhum resultado" quando a busca não retorna nada.
- Idem para **Criado por** (linhas 425–432), usando `criadoPorOptions`.

### 2. `src/pages/esteira/EsteiraIndex.tsx`

- Calcular as opções únicas a partir da lista completa de vouchers (antes da filtragem), via `useMemo`:
  - `enviadoPorOptions` = união de `enviadoPorUserName` e `criadoPorUserName`, sem vazios, ordenado alfabeticamente.
  - `criadoPorOptions` = únicos de `criadoPorDfv`, sem vazios, ordenado.
- Atualizar a lógica de filtragem (linhas 1506–1516) para tratar CSV:
  - Se `filters.enviadoPor` vazio → não filtra.
  - Caso contrário, dividir por vírgula e exigir match exato (case-insensitive) com `enviadoPorUserName` **ou** `criadoPorUserName` (mantém o comportamento atual de buscar nos dois campos).
  - Mesmo tratamento para `filters.criadoPor` contra `criadoPorDfv`.
- Passar as listas como props para `<VoucherTable>`.
- Estado inicial e botão "Limpar filtros" (linhas 591–592 e 2205–2206) permanecem com `""`.

## Fora de escopo

- Backend, edge functions, queries MariaDB.
- Outros filtros da tela.
- Persistência dos filtros entre sessões.
