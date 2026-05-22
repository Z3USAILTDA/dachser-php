## Objetivo
Aplicar os mesmos ajustes do Excel (aging) na edge function `supabase/functions/regua-send-aging/index.ts`, que gera e envia o relatório por e-mail:
1. **Fonte Arial 8** em todas as células (logo, título, caixas, datas, período, headers, dados, totais).
2. **Alinhamento centralizado** (horizontal: "center", vertical: "center") em todas as células.

## Alterações
Arquivo único: `supabase/functions/regua-send-aging/index.ts`

- No bloco `STYLES` (linhas 93-194): trocar todos os `sz: 10/11/12/14/16/22` por `sz: 8` e todos os `horizontal: "left"/"right"` por `"center"`, mantendo `name: "Arial"`, cores, fills e borders inalterados.
- No estilo inline do "TOTAL EM ATRASO" (linhas 246-261): mesmo ajuste — `sz: 8` e `horizontal: "center"`.
- No override de coluna 7 (linha 238): preservar a lógica (só muda cor), o `sz` virá do `STYLES.dataCell` já ajustado.

Manter intactos: estrutura de células, merges, larguras de coluna, alturas de linha, formatos numéricos (`z`), autofilter, lógica de dados e fluxo de envio de e-mail.

Após editar, redeploy com `supabase--deploy_edge_functions(["regua-send-aging"])`.

Sem outras alterações.