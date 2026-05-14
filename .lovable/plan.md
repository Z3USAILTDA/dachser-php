## Ajustes na edição inline da tela de Detalhes do Voucher

Três ajustes pontuais em `src/components/esteira/VoucherDetailsView.tsx` (sem mudanças de backend, sem tocar em `EditVoucherDialog`/`CreateVoucherDialog`).

### 1. Nº Voucher/SPO — sempre somente leitura

Hoje, com `canEditFields=true`, o campo vira `<EditableText field="numero_spo">`. Isso será removido. O Nº SPO renderiza sempre como o `<p>` atual (`font-mono`) com o `MoedaBadge` ao lado, independentemente de `canEditFields`. Continua existindo apenas a leitura — nunca editável.

### 2. "Cobrança em Nome de" → rótulo "Necessita Fiscal?" + atalho da lista

Substituir o bloco atual por um padrão idêntico ao `CreateVoucherDialog`:

- Label: **"Necessita Fiscal?"** (com asterisco visual de obrigatoriedade)
- Ao lado do label, botão `<FornecedoresSemFiscalDialog />` (o componente já existe em `src/components/esteira/FornecedoresSemFiscalDialog.tsx` e mostra a lista de fornecedores que não exigem fiscal)
- O `EditableSelect` permanece com as duas opções, mas com textos espelhando o cadastro:
  - `DACHSER` → "Sim — enviar para o Fiscal"
  - `CLIENTE` → "Não — enviar diretamente para o Financeiro"

Quando `canEditFields=false`, manter a renderização atual (não há bloco de leitura hoje, então fica oculto como já está).

### 3. Edição protegida por ícone de lápis (toggle global da seção)

Hoje, quando `canEditFields=true`, todos os campos da seção "Informações do Voucher/SPO" já aparecem como inputs. O usuário quer que a seção comece em modo leitura mesmo quando o stage permitir edição, e que um ícone de lápis no canto superior direito do card alterne para modo edição.

Implementação:

- Novo estado local `const [isEditing, setIsEditing] = useState(false);` no `VoucherDetailsView`.
- Um derivado `const editableNow = canEditFields && isEditing;` substitui todas as ocorrências de `canEditFields` **dentro da seção "Informações do Voucher/SPO"** (linhas 345–564), exceto no Nº SPO que vira read-only puro (item 1).
- No `CardHeader` (linha 341–343), adicionar um botão à direita do título quando `canEditFields=true`:
  - Modo leitura: ícone `Pencil` (lucide-react) com tooltip "Editar dados", `onClick={() => setIsEditing(true)}`.
  - Modo edição: ícone `Check` com tooltip "Concluir edição", `onClick={() => setIsEditing(false)}`. Como o autosave já dispara em `onBlur`/`onValueChange`, o botão apenas fecha o modo de edição (sem submit explícito).
- Layout do header: `flex items-center justify-between` para encostar o botão no canto direito; estilo `ghost` discreto, ícone tamanho `h-4 w-4`, cor `#F5B843` no hover para combinar com o tema.

Outras seções do componente (Anexos, Comentários, Filhos, etc.) ficam intactas.

### Arquivo único alterado

- `src/components/esteira/VoucherDetailsView.tsx`
  - Import adicional: `Pencil` (lucide-react) e `FornecedoresSemFiscalDialog`.
  - Novo estado `isEditing` + variável derivada `editableNow`.
  - Header do card "Informações do Voucher/SPO" recebe o botão lápis/check.
  - Bloco do Nº SPO sempre read-only.
  - Bloco "Cobrança em Nome de" reescrito como "Necessita Fiscal?" com `FornecedoresSemFiscalDialog` ao lado e textos das opções atualizados.
  - Substituir `canEditFields` por `editableNow` apenas dentro dos campos editáveis dessa seção (Fornecedor, CNPJ, Valor, Moeda, Vencimento, Data Emissão, Tipo Documento, Filial, Forma de Pagamento, Necessita Fiscal, Chave PIX, Origem do Processo, Urgente, Comentários).

### Não muda

- `EditVoucherDialog.tsx`, `CreateVoucherDialog.tsx`, hooks, backend, regras de stage e o trigger atual de `canEditFields` em `EsteiraVoucherDetails.tsx`.
- O comportamento das demais seções da tela.