
Objetivo: corrigir de vez a etapa Robô para que, quando o nome do arquivo bater exatamente com o `numero_spo` do voucher master, o sistema trate isso como match direto de master e nunca exiba “via filho”.

O que descobri:
- O backend já está retornando corretamente o master para o caso do print.
- Na requisição real do preview para `find_voucher_by_spo` com `20263776675`, o primeiro resultado veio com:
  - `is_master: 1`
  - `numero_spo: "20263776675"`
  - `matched_via_child`: ausente
- Ou seja: o problema atual não é a busca do backend, e sim a forma como a aba `RoboTab` interpreta e renderiza o resultado.

Causa raiz:
- Em `src/components/tabs/RoboTab.tsx`, o componente usa `masterName` como sinal genérico de “é master”.
- Depois, na badge e no toast, qualquer item com `masterName` é tratado como se tivesse sido identificado “via filho”.
- Isso está errado para o caso de match direto no `numero_spo` do master.

Ajuste proposto:
1. Tornar o retorno de busca explícito no `RoboTab`
- Expandir o objeto retornado por `searchVoucherBySPO` e `searchVoucherByND` para incluir flags separadas:
  - `isMaster`
  - `matchedViaChild`
  - `masterDisplayName`
  - `childSpo`
- Regra:
  - Se o voucher selecionado é master por match direto, `isMaster = true` e `matchedViaChild = false`
  - Só marcar `matchedViaChild = true` quando isso vier realmente do backend

2. Corrigir o estado `FileMatch`
- Adicionar esses campos explícitos no tipo local da aba:
  - `isMaster?: boolean`
  - `matchedViaChild?: boolean`
  - `masterDisplayName?: string`
- Parar de usar `masterName` como proxy ambíguo para dois comportamentos diferentes

3. Corrigir a renderização da badge na aba Robô
- Ajustar `getStatusBadge` em `RoboTab.tsx` para três casos:
  - Master direto: mostrar `Master` + nome/SPO do master, sem “via filho”
  - Master encontrado via filho: mostrar `Master` + complemento `via filho {childSpo}`
  - Voucher normal: mostrar `SPO {numero}`
- Isso resolve exatamente o erro visível no print

4. Corrigir o texto do toast na busca manual
- Hoje o toast usa `match.masterName` para decidir entre “Master encontrado” e mensagem “via filho”
- Ajustar para usar `matchedViaChild`
- Resultado:
  - Match direto do master: “Master encontrado”
  - Match via filho: “Vinculado ao Master X via filho SPO Y”

5. Manter consistência com a página separada
- Revisar `src/pages/esteira/ComprovanteRobot.tsx`
- Validar que ela só mostra “Identificado via filho” quando `matched_via_child === true`
- Se necessário, aplicar o mesmo critério explícito lá, sem refatorar além do necessário

Arquivos envolvidos:
- `src/components/tabs/RoboTab.tsx`
- `src/pages/esteira/ComprovanteRobot.tsx` (apenas alinhamento, se preciso)

Resultado esperado após o ajuste:
- Se o arquivo tiver exatamente o `numero_spo` do master, a aba mostrará algo como:
  - `Master`
  - `Teste`
  - sem “via filho”
- O processamento continuará anexando no voucher master correto
- O comportamento ficará coerente entre a aba Robô e a página Robô separada

Detalhe técnico:
```text
Hoje:
masterName preenchido => UI assume "via filho"

Depois:
isMaster = true
matchedViaChild = false  -> master direto
matchedViaChild = true   -> master via filho
```
