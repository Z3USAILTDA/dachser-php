

## Plano: Validação matemática de código de barras + retry + aumento de tokens

### Problema
O Claude extrai linhas digitáveis com dígitos trocados, duplicados ou faltando. A função aceita qualquer sequência de 47-48 dígitos sem validação matemática.

### Alterações

**Arquivo: `supabase/functions/extract-boleto-barcode/index.ts`**

1. **Aumentar `max_tokens`** de 2000 para 4000 (margem para a resposta do retry)

2. **Adicionar funções de validação**:
   - `calcModulo10(digits)` — valida dígitos verificadores dos campos 1, 2 e 3 da linha digitável
   - `calcModulo11(barcode47)` — valida o dígito verificador geral (posição 33) convertendo linha digitável para código de barras de 44 dígitos
   - `validateLinhaDigitavel(barcode)` — retorna quais campos passaram/falharam

3. **Melhorar o prompt** — pedir ao Claude que transcreva tanto a versão **formatada** (com pontos e espaços) quanto a versão limpa, para cross-check entre as duas

4. **Implementar retry com feedback** (máximo 1 retry):
   - Após extração, validar com módulo 10/11
   - Se falhar, fazer segunda chamada informando quais campos falharam e pedindo re-leitura cuidadosa
   - Se ambas falharem, retornar o melhor resultado com flag `validation_warning: true`

5. **Retorno atualizado**:
   - Adicionar campo `validated: true/false` na resposta
   - Adicionar `validation_details` com status de cada campo

### Lógica de validação (módulo 10)
Para cada campo (posições 1-9, 11-20, 22-31): multiplicar dígitos alternadamente por 2 e 1 da direita para esquerda, somar algarismos dos resultados, dígito verificador = (10 - soma%10) % 10.

### Lógica módulo 11 (dígito geral)
Converter linha digitável de 47 para código de barras de 44 dígitos, multiplicar por pesos 2-9 cíclicos, dígito = 11 - (soma % 11). Se resultado for 0, 1, 10 ou 11, dígito = 1.

### Resultado
- Erros de OCR são detectados matematicamente
- Retry automático com contexto aumenta chance de acerto
- Operador recebe aviso claro quando extração não é confiável

