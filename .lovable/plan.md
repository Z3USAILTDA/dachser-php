

## Plano: Permitir seleção múltipla de Tipo de Container no cadastro de Free Time

### Problema atual

O campo "Tipo Container" usa um `Select` single-value, permitindo apenas um tipo por cadastro.

### Solução

Trocar o `Select` por checkboxes com toggle visual (badges clicáveis), armazenando os tipos selecionados como array e enviando como string separada por vírgula (ex: `"20DV,40HC"`).

### Alterações

**Arquivo: `src/components/demurrage/DemurrageFreeTimeDialog.tsx`**

1. **State**: Trocar `tipoConteiner` de `string` para `string[]` (array)
2. **UI**: Substituir o `Select` (linhas 248-258) por um grid de badges/botões clicáveis para cada tipo de container, com visual de toggle (selecionado = fundo amarelo, não selecionado = fundo escuro)
3. **Submit**: Na linha 111, converter o array para string separada por vírgula: `tipoConteiner.join(',')` antes de enviar
4. **Reset**: Ajustar `resetForm` para `setTipoConteiner([])`

### Resultado

O usuário poderá clicar em múltiplos tipos de container (ex: 20DV + 40HC) e o valor será salvo como `"20DV,40HC"` no banco.

