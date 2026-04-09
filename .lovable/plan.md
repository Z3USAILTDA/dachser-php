
Diagnóstico

- O problema não está na busca master/filho do backend.
- O problema está na extração do SPO no frontend, antes da busca.

Evidências encontradas

1. O arquivo enviado é `20262478848.pdf`.
2. Na tela, as requisições feitas para o backend foram:
   - `find_voucher_by_spo` com `202-624788`
   - `find_voucher_by_nd` com `202-624788`
   - depois `find_voucher_by_spo` com `202624788`
   - depois `find_voucher_by_nd` com `202624788`
3. Ou seja: os 2 últimos dígitos (`48`) foram descartados antes da busca.
4. Testando a função com o valor correto `20262478848`, o backend retorna corretamente o voucher master em `ROBO`, vinculado via filho:
   - master: `MASTER-XYFBZRG5`
   - `matched_via_child: true`
   - `child_spo: 20262478848`

Causa raiz

No arquivo `src/components/tabs/RoboTab.tsx`, a função `extractSPOFromFilename` aplica primeiro esta heurística:

```ts
const concatenatedPattern = /^(\d{3})(\d{6})\d*/
```

Para `20262478848`, ela transforma o nome em:
- formatado: `202-624788`
- número: `202624788`

Isso trunca o SPO real e faz a tela consultar o backend com o valor errado.

Plano de correção

1. Ajustar `extractSPOFromFilename` em `src/components/tabs/RoboTab.tsx`
- Para nomes puramente numéricos como `20262478848.pdf`, priorizar o número completo.
- Não aplicar a regra “3 + 6” antes de tentar o valor integral.

2. Tornar a busca mais robusta, sem refatoração grande
- Buscar nesta ordem:
  1. número completo extraído do arquivo
  2. variação formatada, se fizer sentido
  3. heurística legada “3+6” apenas como fallback
- Assim preservamos compatibilidade com casos antigos sem quebrar SPOs numéricos completos.

3. Manter o backend como está
- A lógica de localizar master via filho já está funcionando para este caso.
- Não há indício de erro no `mariadb-proxy` para o arquivo mostrado.

Validação após a correção

- Reenviar `20262478848.pdf`
- Confirmar que a primeira busca usa `20262478848`
- Confirmar que o item deixa de aparecer como “Voucher não encontrado”
- Confirmar que aparece como Master, vinculado via filho `20262478848`
- Confirmar que o processamento anexa o comprovante no master correto

Detalhe técnico

Arquivo a alterar:
- `src/components/tabs/RoboTab.tsx`

Mudança cirúrgica recomendada:
- alterar somente a estratégia de extração/busca do SPO
- não mexer na estrutura da tela nem na edge function, porque o backend já responde corretamente com o número completo
