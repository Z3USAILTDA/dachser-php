## Ajuste: remover "Urgente" do step global de preenchimento

### Problema

O step `fill` ainda mostra um checkbox "Marcar todas como urgentes". Urgência também varia por voucher e não deve ser aplicada ao lote inteiro.

### Mudança (1 arquivo)

**`src/components/esteira/BatchImportVoucherDialog.tsx`**

1. Remover do step `fill` o bloco do checkbox "Urgente (opcional)" / "Marcar todas como urgentes".
2. Remover qualquer leitura de `fillValues.urgente` (a lógica de `applyFillAndContinue` ignora valores vazios automaticamente, mas removeremos a UI por completo).
3. Adicionar "Urgente" à frase auxiliar do step `fill`:
   > *"Origem Processo, Forma de Pagamento e Urgente devem ser definidos por linha — use o botão de edição ou 'Editar em lote' na próxima etapa."*

### O que NÃO muda

- "Urgente" continua disponível no drawer por linha e no "Editar em lote" da toolbar (linhas selecionadas).
- Validação, parsing, backend e demais campos permanecem iguais.
