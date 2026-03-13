

## Plano: Mover Cadastro NOVA para Modal na Tela de Monitoramento

### O que será feito

Transformar o formulário da página `CadastroNova.tsx` em um componente modal (`Dialog`) que abre diretamente na tela de Monitoramento Pré-Embarque (`Index.tsx`), seguindo o estilo do screenshot anexado.

### Alterações

**1. Criar `src/components/air/CadastroNovaModal.tsx`**
- Extrair toda a lógica e UI do formulário de `CadastroNova.tsx` (estados, handlers, upload, autocomplete, collapsible cards, swap master) para um novo componente que recebe `open` e `onOpenChange` como props
- Envolver tudo em um `Dialog` com `DialogContent` usando `max-w-4xl max-h-[90vh] overflow-y-auto` para scroll interno
- Header do modal: título "Novo Processo Aéreo — Cadastro NOVA" com ícone `FilePlus`, contador de processos utilizados (como no screenshot), e o toggle Impo/Expo
- Upload zone, campos manuais, collapsible cards e botão salvar ficam dentro do modal
- Ao salvar com sucesso, fechar o modal e chamar um callback `onSuccess` para refresh dos dados

**2. Atualizar `src/pages/Index.tsx`**
- Importar `CadastroNovaModal`
- Adicionar estado `cadastroNovaOpen` (boolean)
- Adicionar botão "Novo Processo" (estilo `#ffc800`, ícone `FilePlus`) ao lado do botão "Atualizar" na barra de filtros (~linha 2566)
- Renderizar `<CadastroNovaModal open={cadastroNovaOpen} onOpenChange={setCadastroNovaOpen} onSuccess={fetchStatusAereoData} />`
- Exibir o botão apenas para admins Z3US (mesma verificação já existente)

**3. Atualizar `src/pages/air/CadastroNova.tsx`**
- Simplificar para importar e renderizar o `CadastroNovaModal` dentro de um `PageLayout` (mantém a rota `/air/cadastro-nova` funcionando como fallback), ou redirecionar para `/air/tracking`

### Resumo de arquivos

| Arquivo | Alteração |
|---------|-----------|
| `src/components/air/CadastroNovaModal.tsx` | Novo — componente modal com todo o formulário |
| `src/pages/Index.tsx` | Botão "Novo Processo" + estado + render do modal |
| `src/pages/air/CadastroNova.tsx` | Simplificar para reutilizar o modal ou redirecionar |

