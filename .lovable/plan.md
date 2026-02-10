

# Visualizacao dos Templates de E-mail

## O que sera feito

Criar uma pagina temporaria de preview (`/fin/esteira/email-preview`) que renderiza os templates de e-mail diretamente no navegador. Isso permite visualizar e ajustar o design antes de implementar o envio real.

A pagina tera:
- Seletor de tipo de notificacao (VOUCHER_ENVIADO, AJUSTE_SOLICITADO, URGENCIA_REJEITADA, VOUCHER_CONCLUIDO, VENCIMENTO_PROXIMO)
- Preview do e-mail renderizado em iframe com dados ficticio
- Toggle dark/light para ver como fica nos dois temas de e-mail

Os templates seguirao o padrao visual do e-mail de boas-vindas ja existente:
- Logo Z3US no topo (com suporte dark/light)
- Titulo colorido por tipo (verde=concluido, amarelo=enviado, vermelho=rejeitado, laranja=ajuste, amber=vencimento)
- Dados do voucher em tabela (numero SPO, fornecedor, valor, moeda, vencimento, etapa)
- Botao CTA com link direto ao voucher
- Rodape com copyright

## Secao Tecnica

### Novo arquivo: `src/pages/esteira/EmailPreview.tsx`

Componente React que:
1. Contem as funcoes `generateEmailHtml(type, data)` com os 5 templates
2. Renderiza o HTML em um iframe via `srcdoc`
3. Permite trocar entre os tipos via tabs/select
4. Usa dados mock para popular os campos

### Rota temporaria

Adicionar rota `/fin/esteira/email-preview` em `App.tsx` apontando para o novo componente.

### Dados mock para preview

```text
{
  voucherNumber: "SPO-2025-00123",
  fornecedor: "Transportes Silva Ltda",
  valor: 15750.00,
  moeda: "BRL",
  vencimento: "15/02/2025",
  etapaDestino: "FISCAL",
  reason: "Nota fiscal com CNPJ divergente do cadastro",
  fromStage: "FISCAL",
  toStage: "OPERACAO",
  senderName: "Maria Santos"
}
```

### Estrutura dos templates

Cada template segue a mesma estrutura base do `send-welcome-email`:
- Fundo claro/escuro responsivo via `prefers-color-scheme`
- Painel central 640px com bordas arredondadas
- Logo Z3US com versao light/dark
- Secao de conteudo especifica por tipo
- Tabela de dados do voucher
- Botao CTA (cor varia por tipo)
- Texto de rodape

### Arquivos a criar/editar

| Arquivo | Acao |
|---------|------|
| `src/pages/esteira/EmailPreview.tsx` | Novo -- pagina de preview com templates |
| `src/App.tsx` | Adicionar rota `/fin/esteira/email-preview` |

