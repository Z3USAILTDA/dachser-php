## Plano de correção

1. **Corrigir o parser de nomes de comprovantes**
   - Ajustar `parse-comprovante-pdf` para preservar o SPO completo no padrão `105-293623.pdf`.
   - Hoje o parser detecta internamente `105-293623`, mas no resultado final prioriza apenas `293623`, o que faz a tela consultar o número incompleto e exibir “Voucher não encontrado”.
   - O padrão com filial `NNN-NNNNNN` passará a ter prioridade maior que o número curto.

2. **Alinhar as duas telas do robô**
   - Aplicar a mesma ordem segura de tentativa em `RoboTab` e em `/fin/esteira/robot`:
     - primeiro SPO completo do nome do arquivo;
     - depois ND completo;
     - por último candidatos secundários.
   - Remover textos que dizem que o conteúdo do PDF é usado para identificação, porque a regra correta é nome do arquivo apenas.

3. **Endurecer o backend contra falso negativo e falso positivo**
   - Ajustar `find_voucher_multi` para usar comparação por prefixo exato antes do espaço também no fluxo multi, igual ao fluxo individual.
   - Evitar dependência de busca frouxa por `LIKE %...%` para comprovantes.
   - Manter a regra já definida: nunca identificar comprovante por linha digitável/código de barras.

4. **Validar com os casos anexados**
   - Testar diretamente as funções com `105-293623.pdf`, `105-293624.pdf` e `105-293625.pdf`.
   - Confirmar que os arquivos retornam o voucher `105-293623 DIM-BY`, `105-293624 DIM-BY` e `105-293625 DIM-BY` respectivamente, sem exigir edição manual.

5. **Registrar a regra permanente**
   - Atualizar a memória do projeto para deixar explícito que nomes `NNN-NNNNNN.pdf` devem preservar o prefixo/filial e não podem cair para apenas os 6 dígitos finais.