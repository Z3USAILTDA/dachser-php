## Refatoração visual: "Importar SPO em Lote" (revisado)

Reorganização da UI/UX do modal de importação em lote, **mantendo toda a lógica de leitura, validação, integração com backend e criação de vouchers**. Apenas dois arquivos de apresentação são editados, mais um novo componente de drawer.

### Arquivos afetados

- `src/components/esteira/BatchImportVoucherDialog.tsx` — header, toolbar, footer, **estado de seleção/filtros**
- `src/components/esteira/BatchImportPreviewTable.tsx` — tabela limpa (somente leitura, sem inputs inline)
- `src/components/esteira/BatchImportRowEditor.tsx` (novo) — drawer lateral de edição por linha

`validate`, `handleFile`, `applyFillAndContinue`, `confirm`, `updateItem`, parsing e chamadas ao `mariadb-proxy` permanecem inalterados.

### 1. Header Summary

- Layout horizontal, ícones h-5 w-5
- **Total**: `FileSpreadsheet`, `bg-card/50`, borda neutra
- **Válidas**: `CheckCircle2`, `border-emerald-500/40`, número `text-emerald-400`
- **Com Erro**: `AlertCircle`, `border-red-500/40`, número `text-red-400`, **clicável** → alterna `filter="errors"`
- Barra de progresso fina (`h-1.5 rounded-full`) com proporção válidas/erros
- Texto: `"{validCount} de {items.length} registros prontos para importação"`

### 2. Toolbar de ações em lote

- Checkbox "Selecionar todos" (estado: nenhum / parcial / todos) — opera sobre o conjunto visível filtrado
- Pills: `Todos | Com Erro | Válidos` (controla `filter`)
- Input busca por SPO/Processo (controla `search`)
- Dropdown "Editar em lote" → popover com select de valor + botão **Aplicar** que afeta **apenas linhas selecionadas** (não mais "todas"). Campos: Moeda, Tipo Doc, Forma de Pagamento, Fiscal, Origem, Urgente

### 3. Estado de seleção/filtros (no PAI)

**Explícito**: `selected: Set<number>`, `filter`, `search`, `editingRow` vivem em `BatchImportVoucherDialog.tsx`. A tabela e a toolbar são irmãs e recebem props/handlers do pai. Isso garante que a toolbar enxergue a seleção corretamente.

Handlers no pai: `onToggleSelect(rowIndex)`, `onSelectAllVisible(rows)`, `onClearSelection()`, `onRemoveRow(rowIndex)`, `onEditRow(rowIndex)`, `applyBulkToSelected(field, value)`.

### 4. Tabela redesenhada (`BatchImportPreviewTable.tsx`)

Reescrita completa, sem inputs inline. Colunas:

| Col | Conteúdo |
|---|---|
| Checkbox | controlado por `selected` (prop) |
| # | row_index + 1 |
| Status | ícone `AlertTriangle` vermelho (ERROR) ou `CheckCircle2` verde (VALID), com tooltip do `validation_message` |
| SPO | font-mono |
| PROCESSO | texto (oculto < lg) |
| FORNECEDOR | truncate + tooltip (oculto < lg) |
| VALOR | direita, `Intl.NumberFormat('pt-BR', {style:'currency', currency: it.moeda || 'BRL'})` |
| VENCIMENTO | `dd/MM/yyyy` |
| Ações | lápis (`onEdit`) + lixeira **com Popover de confirmação** |

Estilo: linha `h-[52px]`, zebra `even:bg-card/20`, header sticky, `hover:bg-primary/5 transition-colors`, linhas selecionadas `bg-amber-500/10`. Em viewports < lg: esconder Processo e Fornecedor (`hidden lg:table-cell`).

**Pulse de erro (corrigido)**: NÃO aplicar `animate-pulse` global. Em vez disso:
- Ícone estático por padrão
- `group-hover:animate-pulse` na linha (somente quando o usuário passa o mouse)

**Confirmação de remoção (corrigido)**: lixeira abre `Popover` com:
- Texto: `"Remover esta linha? Essa ação não pode ser desfeita."`
- Botões: `Cancelar` e `Confirmar remoção` (variant `destructive`)
- Só então chama `onRemove(rowIndex)` no pai

Props: `items`, `selected`, `onToggleSelect`, `onSelectAllVisible`, `onRemove`, `onEdit`, `filter`, `search` (filtragem aplicada internamente para render).

### 5. Drawer de edição (`BatchImportRowEditor.tsx`)

Componente novo baseado em `Sheet` (side="right"):

- Título: `Editar SPO {spo}` + badge de status
- **Identificação (editável — corrigido)**: SPO (read-only, é a chave), **Processo, Fornecedor, CNPJ** como inputs de texto editáveis. Origem Processo como select.
- **Financeiro**: Valor (number), Moeda (select), Forma de Pagamento (select), Fiscal (select Sim/Não)
- **Datas**: Vencimento, Emissão (inputs date)
- **Classificação**: Tipo Doc (select), Filial (input), Urgente (checkbox), Comentários (textarea)
- Footer: `Cancelar` / `Salvar alterações`
- Estado local com cópia do item; ao salvar dispara `onChange(rowIndex, patch)` no pai (que chama `updateItem` → revalida)

### 6. Indicadores de erro

- Tooltip do ícone exibe `validation_message` em lista (split por `;`) com texto humanizado
- Card "Com Erro" do header alterna o filtro

### 7. Footer

- Esquerda: `Voltar` (inalterado)
- Direita: `Criar X voucher(s)` — desabilitado/cinza quando `validCount===0`, âmbar quando habilitado
- Texto auxiliar: `"Corrija os erros para habilitar a importação"` quando desabilitado; spinner inline durante `busy`

### 8. Responsividade do modal

`DialogContent` (step preview): `w-[90vw] max-w-[1400px] max-h-[85vh]`, `flex-col overflow-hidden`. Tabela com scroll vertical interno.

### Tema

Apenas tokens existentes (`bg-card`, `border-border`, `text-primary` âmbar, verde/vermelho semânticos). Sem cores hardcoded.

### Fora de escopo

- `validate`, `detectMissingColumns`, parsing de CSV/XLSX
- Edge function `mariadb-proxy`
- Steps `upload` e `fill` (preservados)
- Comportamento de criação de vouchers
