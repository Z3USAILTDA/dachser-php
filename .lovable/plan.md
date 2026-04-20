

## Relatório Mensal: e-mail enxuto + planilha Excel anexa

### Mudança de abordagem
- **E-mail**: vira um resumo executivo curto (logo + título + 3 KPIs + CTA + rodapé). Sem tabelas.
- **Planilha Excel (.xlsx)**: gerada na edge function e **anexada** ao e-mail, contendo todo o detalhamento (resumo por etapa, concluídos, em andamento) com formatação no padrão dourado/Z3US — reaproveitando o estilo de `src/utils/voucherExcelExport.ts`.

### Layout do novo e-mail (640px, light, dark mode automático)

```text
┌────────────────────────────────────────┐
│           [LOGO Z3US]                  │
│                                        │
│  Relatório Mensal de Vouchers          │ ← H1 dourado #F5B843
│  Abril/2026 · Completo                 │ ← muted #6B7280
│                                        │
│  ┌──────────┬──────────┬──────────┐    │
│  │ Total    │Concluídos│ Em Aberto│    │
│  │ 142      │   87     │   55     │    │
│  │ R$ 1,2M  │ R$ 720k  │ R$ 480k  │    │
│  └──────────┴──────────┴──────────┘    │
│                                        │
│  Detalhamento completo no anexo Excel. │
│                                        │
│      [ Acessar Esteira ]               │ ← CTA dourado → dachser.z3us.app
│                                        │
│  Relatório automático · gerado em      │
│  20/04/2026 09:00                      │
└────────────────────────────────────────┘
            © Z3US.AI
```

- KPIs: 3 cards lado a lado, borda `#E5E7EB`, raio 10px, número grande dourado `#F5B843`, label muted, valor BRL abaixo.
- Sem emojis, sem roxo, sem verde-claro.
- CTA único: botão dourado `Acessar Esteira` → `https://dachser.z3us.app/`.
- Para relatórios segmentados (FISCAL/OPERACAO/SUPERVISOR/FINANCEIRO), o subtítulo vira `Abril/2026 · {Função}` e os KPIs refletem apenas o escopo daquele segmento.

### Planilha anexa (`Relatorio_Vouchers_Abril_2026.xlsx`)

3 abas:
1. **Resumo** — cabeçalho dourado, 3 blocos de KPI (Total, Concluídos, Em Aberto) + tabela "Resumo por Etapa" (Etapa, Qtd, Valor BRL) com linha TOTAL destacada em dourado claro.
2. **Concluídos** — colunas: Nº SPO, Fornecedor, Valor, Moeda, Vencimento, Etapa Final, Status Baixa, Resp. Financeiro, Concluído em.
3. **Em Andamento** — colunas: Nº SPO, Fornecedor, Valor, Moeda, Vencimento, Etapa Atual, Responsável Atual, Dias na etapa, Urgente.

Estilo idêntico ao de `voucherExcelExport.ts`:
- Header dourado `#F5B843`, texto preto, bold, centralizado.
- Linhas zebradas (`#F5F5F5`).
- Linhas urgentes destacadas em vermelho claro `#FFE5E5`.
- Bordas finas cinza, larguras de coluna ajustadas, freeze do cabeçalho.

Para relatórios segmentados, a aba "Em Andamento" filtra apenas vouchers da função correspondente; a aba "Concluídos" também.

### Implementação técnica

**Arquivo único alterado:** `supabase/functions/voucher-monthly-report/index.ts`

1. **Adicionar geração do XLSX em Deno** usando `xlsx` via esm.sh:
   ```ts
   import * as XLSX from "https://esm.sh/xlsx-js-style@1.2.0";
   ```
   Função `buildXlsxBuffer(data, segmentLabel)` retornando `Uint8Array`.
2. **Reescrever `buildHtml`** para o layout enxuto acima (KPIs + CTA + rodapé). Remover as 3 tabelas atuais.
3. **Anexar no envio**: hoje o envio usa Resend via `send-email` (ou client direto). Atualizar a chamada para incluir `attachments: [{ filename, content: base64 }]`. Verificar o caminho de envio atual no arquivo (provavelmente Resend API direta) e adicionar o array `attachments` com o buffer XLSX em base64.
4. **Calcular KPIs** uma única vez antes de montar HTML + planilha (Total qtd, Total R$; Concluídos qtd/R$; Em Aberto qtd/R$). Formatar valores com `Intl.NumberFormat('pt-BR', { notation: 'compact' })` para o e-mail (ex.: "R$ 1,2M") e formato BRL completo na planilha.
5. **Modo `testEmail`** continua funcionando idêntico — anexo vai junto.
6. **Nada mais muda**: queries, segmentação por função, lista de destinatários, cron, retenção, `testEmail`.

### Não muda
- Frontend, queries MariaDB, lógica de destinatários, cron, segmentação por função.
- Outros e-mails da Esteira.
- Lógica de `testEmail` (continua redirecionando tudo para o endereço de teste).

### Resultado esperado
- E-mail leve, escaneável em 5 segundos, alinhado ao design Z3US.
- Excel anexo com toda a profundidade dos dados, pronto para análise/arquivamento.
- Teste: rodar com `testEmail: "larissa@z3us.ai"` e validar (1) inbox recebe 5 e-mails enxutos com anexo, (2) anexo abre sem erro de fórmula e com cores corretas.

