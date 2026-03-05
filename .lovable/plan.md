

# Mostrar documentos/anexos no dialog de visualização de Pagamentos

## Problema
O dialog do olhinho (Eye) na aba Pagamentos mostra apenas o `DadosPagamentoPanel` (linha digitável, dados bancários, PIX). Os documentos anexados ao voucher não são exibidos.

## Solução

### `src/components/esteira/PagamentosTab.tsx`

1. **Buscar anexos ao abrir o dialog**: Quando o usuário clica no olhinho, fazer uma chamada `get_voucher_anexos` via `mariadb-proxy` para carregar os anexos do voucher selecionado.

2. **Adicionar state para anexos**: `anexosDialog` (array) e `loadingAnexos` (boolean).

3. **Passar anexos para o `DadosPagamentoPanel`**: O componente já aceita a prop `anexos` mas não está recebendo.

4. **Adicionar seção de documentos abaixo do `DadosPagamentoPanel`**: Listar todos os anexos com nome, tipo e botão de download/abrir em nova aba. Usar ícones e badges por tipo (FATURA, BOLETO, COMPROVANTE, etc).

### Fluxo no dialog
```
┌─────────────────────────────────┐
│ Dados de Pagamento - SPO123     │
├─────────────────────────────────┤
│ [DadosPagamentoPanel existente] │
│  - Linha digitável / Bancários  │
├─────────────────────────────────┤
│ Documentos Anexados (3)         │
│  📄 Fatura_001.pdf    [FATURA]  │
│  📄 Boleto_001.pdf    [BOLETO]  │
│  📄 Comprov.pdf  [COMPROVANTE]  │
└─────────────────────────────────┘
```

### Detalhes técnicos
- Fetch de anexos: `supabase.functions.invoke("mariadb-proxy", { body: { action: "get_voucher_anexos", voucher_id } })`
- Campos retornados: `id, tipo, file_name, file_url, file_size, created_at`
- Cada anexo terá: link para abrir em nova aba e badge com o tipo
- O `DadosPagamentoPanel` já usa `anexos` internamente para a funcionalidade de re-extração de boleto, então basta passar os dados

Nenhuma alteração de backend necessária.

