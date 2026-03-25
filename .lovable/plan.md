

## Plano: Ajustar design do CronManager para seguir o padrao visual do projeto

### Problema
A tela `CronManager.tsx` usa um layout generico (`div` com `bg-background`) em vez dos componentes padronizados do projeto: `PageLayout`, `PageCard`/`TableCard`, usados em todas as outras telas admin (ApiManagement, UploadMaster, etc.).

### Alteracao em `src/pages/admin/CronManager.tsx`

1. **Substituir o layout wrapper** -- Trocar o `div` raiz por `<PageLayout>` com props `title="DACHSER"`, `subtitle="Gerenciamento de Crons"`, `pageIcon={Clock}`, `backTo="/dashboard"`
2. **Envolver a tabela com `<PageCard>`** -- Usar o componente `PageCard` em vez do `div` com `border border-border rounded-lg`
3. **Mover botao Atualizar para `rightContent`** do `PageLayout` (canto superior direito, como outras telas fazem)
4. **Remover header manual** -- O `PageLayout` ja fornece o titulo, subtitulo, botao voltar e user pill
5. **Manter toda a logica e funcionalidade intacta** -- Apenas mudancas visuais/estruturais

### Resultado esperado
A tela tera o mesmo background com imagem DACHSER, header com dots dourados, user pill, botao voltar arredondado, e cards com estilo glass/dark consistente com as demais telas admin.

### Arquivo editado
- `src/pages/admin/CronManager.tsx`

