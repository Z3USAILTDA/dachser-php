Plano para corrigir a tabela vazia pós-extração:

1. Tornar a extração persistida obrigatória
   - No `analyze-chb-documents`, a etapa inicial deve parar a análise se nenhuma extração for gravada.
   - Hoje ela pode falhar/sumir e a análise continua pelo fluxo antigo, mascarando o problema.

2. Garantir que a função implantada seja rastreável
   - Adicionar marcador de versão também no início do submit (`SUBMIT`) e não apenas no background.
   - Isso confirma nos logs se o código novo realmente está em execução.

3. Corrigir o fluxo para usar banco como fonte única
   - Após chamar `extract-chb-file` para cada documento, buscar as extrações via `get_chb_extractions`.
   - A análise deve seguir apenas se houver linhas retornadas da `dados_dachser.t_chb_file_extractions` para o `item_id` e etapa.

4. Melhorar diagnóstico de falha
   - Se houver mismatch de nome entre arquivos enviados e `t_dachser_chb_files`, registrar erro explícito com lista de nomes.
   - Se `insert_chb_extraction` falhar, retornar erro claro para o usuário em vez de concluir análise sem gravar.

5. Reimplantar e validar
   - Reimplantar `analyze-chb-documents`, `extract-chb-file` e `mariadb-proxy`.
   - Rodar nova análise no item 118.
   - Validar nos logs:
     - marcador `v3-persisted-extractions-required` no submit/background;
     - chamadas reais para `extract-chb-file`;
     - logs `[CHB-EXTRACTION] Inserting extraction` no `mariadb-proxy`.
   - Confirmar que `dados_dachser.t_chb_file_extractions` recebe uma linha por arquivo.