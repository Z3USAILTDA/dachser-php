## Objetivo
Corrigir o robô de comprovantes para identificar arquivos como `105-29290509876206.pdf` como o voucher `105-292905 DIM-BY`, e deixar claro visualmente que a identificação/processamento continua em andamento após o upload inicial.

## Plano

1. **Ajustar o parser de nome do arquivo**
   - Em `parse-comprovante-pdf`, adicionar um fallback específico para o padrão:
     - `NNN-<SPO><sufixo numérico>.pdf`
     - Exemplo: `105-29290509876206.pdf` → candidatos `105-292905` e `292905`.
   - Priorizar o candidato composto com filial (`105-292905`) acima do falso ND capturado pelo regex atual.
   - Manter a regra existente: identificação do robô continua sendo exclusivamente pelo nome do arquivo, sem usar conteúdo do PDF nem linha digitável.

2. **Preservar precedência dos padrões mais confiáveis**
   - Não alterar o funcionamento de SPO Remessa, Voucher Remessa e Voucher Manual.
   - O novo fallback ficará abaixo dos padrões formais de remessa, mas acima do match incorreto que transforma o sufixo em ND.

3. **Melhorar feedback visual no card de upload**
   - Durante identificação, mostrar no próprio card de upload um estado ativo com mensagem como `Analisando X de Y arquivos...`.
   - Atualizar o botão para indicar progresso real, por exemplo `Identificando (3/10)`.
   - Manter a barra de progresso global, mas com texto mais claro do que está acontecendo.

4. **Adicionar feedback por arquivo na lista**
   - Arquivos `pending`: mostrar que estão na fila.
   - Arquivos `identifying`: destacar a linha com borda/estado animado e texto `Analisando nome do arquivo...`.
   - Arquivos `processing`: destacar com texto `Enviando para o servidor...`.
   - Arquivos finalizados continuam com os status atuais: identificado, não identificado, sucesso ou erro.

5. **Validar o caso reportado**
   - Testar a lógica do parser para confirmar que `105-29290509876206.pdf` gera `105-292905` como candidato prioritário.
   - Conferir que a UI mostra progresso contínuo enquanto há identificação/processamento em andamento.