
## Aviso de divergência sem travar ações + texto em linguagem do formulário

### Contexto
No formulário, o campo se chama **"É necessário contabilização com o fiscal?"** (Sim = DACHSER → passa pelo Fiscal; Não = CLIENTE → vai direto ao Financeiro). O usuário não conhece o termo "Cobrança em nome de" — o aviso precisa falar a língua do formulário.

Além disso, o voucher 101-292930 DIM-BY faz parte de um **voucher master** com 4 vouchers, e a divergência real é que **os 4 vouchers do master foram preenchidos com respostas diferentes nesse campo**.

### Mudanças

#### 1) `src/pages/esteira/EsteiraVoucherDetails.tsx`
- `canShowFiscalActions()`: remover o guard `isDachser`. Passa a depender só da etapa (`FISCAL` / `AJUSTE_FISCAL`) + role. Comentário: a divergência é sinalizada por aviso, não por bloqueio.
- Render do `<VoucherDivergenceAlert>`: remover a condição `noActionsAvailable`. Aviso aparece sempre que `divergence.divergent === true` e o usuário tem permissão na esteira. As ações da etapa continuam visíveis lado a lado.

#### 2) `src/utils/voucherDivergence.ts`
Reescrever os textos retornados pelo helper para usar o nome real do campo:

- `titulo`: **"Atenção: contabilização com o fiscal divergente entre vouchers do mesmo SPO"**
- `descricao`: 
  *"Este voucher está na etapa Fiscal porque o campo 'É necessário contabilização com o fiscal?' está como **Não**, mas os outros vouchers do mesmo SPO master foram cadastrados como **Sim**. Confira se o preenchimento está correto. Se foi engano, devolva para a Operação para acertar."*
- Remover `causaProvavel` (texto técnico desnecessário) — eliminar o campo do tipo e do componente.
- Caso o voucher esteja sozinho (sem irmãos), trocar a frase para: *"Este voucher está na etapa Fiscal, mas o campo 'É necessário contabilização com o fiscal?' foi marcado como **Não**. Quando a resposta é Não, o voucher não passa pelo Fiscal — vai direto da Operação para o Financeiro."*

Mapeamento de exibição no aviso (sem expor "DACHSER"/"CLIENTE"):
- `cobrancaEmNomeDe === "DACHSER"` → exibir **"Contabilização: Sim"**
- `cobrancaEmNomeDe === "CLIENTE"` → exibir **"Contabilização: Não"**
- Badges:
  - Compatível com Fiscal → **"correto na etapa Fiscal"**
  - Incompatível → **"não deveria estar no Fiscal"**

#### 3) `src/components/esteira/VoucherDivergenceAlert.tsx`
- Substituir o cabeçalho do bloco de irmãos:
  - De: *"Contexto do SPO {base} — N voucher(s)"*
  - Para: **"Vouchers do SPO master {base} ({N} no total)"**
- Para cada irmão, mostrar `Contabilização: Sim/Não` em vez de DACHSER/CLIENTE.
- Remover o parágrafo "Causa provável".
- Placeholder do textarea: *"Ex.: 'Este voucher foi marcado como Não por engano — devolvendo para a Operação corrigir.'"*
- Botão e fluxo de `Devolver para Operação` permanecem (gera log `DIVERGENCIA_DEVOLVIDA`, notifica criador, vai para `AJUSTE_OPERACAO`).

### Resultado
- **101-292930 DIM-BY** (FISCAL + Não, com 3 irmãos Sim): aviso âmbar explicando em linguagem do formulário + cards de ações Fiscais visíveis. O usuário pode aprovar normalmente OU devolver.
- Vouchers DACHSER em FISCAL: nenhum aviso, comportamento atual.
- Sem mudanças em backend, schema ou memória.
