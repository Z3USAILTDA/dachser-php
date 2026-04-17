
## Plano: fazer o retorno pela tela de Pagamentos entrar como AJUSTE

### Diagnóstico
Encontrei a causa exata do problema:

- Na tela de **Pagamentos**, o retorno usa `handleVoltarOperacional` em `src/components/esteira/PagamentosTab.tsx`.
- Hoje esse fluxo grava:
  - `etapa_atual: "OPERACAO"` ou `"FISCAL"`
- Ele **não** grava:
  - `AJUSTE_OPERACAO` / `AJUSTE_FISCAL`
  - `ajuste_operacao` / `ajuste_fiscal`
  - nem o marcador `[REQ:FINANCEIRO]`

Por isso, quando o voucher volta a partir de Pagamentos:
- ele aparece como voucher normal na etapa destino
- não carrega a informação de ajuste
- e o reenvio segue o fluxo comum, em vez de voltar ao Financeiro solicitante

### Correção proposta

#### 1. Ajustar o retorno na tela de Pagamentos
Arquivo: `src/components/esteira/PagamentosTab.tsx`

Alterar `handleVoltarOperacional` para:

- se o destino escolhido for **Operacional**:
  - salvar `etapa_atual: "AJUSTE_OPERACAO"`
  - salvar `ajuste_operacao: buildAjusteWithRequester("FINANCEIRO", justificativa)`
- se o destino escolhido for **Fiscal**:
  - salvar `etapa_atual: "AJUSTE_FISCAL"`
  - salvar `ajuste_fiscal: buildAjusteWithRequester("FINANCEIRO", justificativa)`

Também vou manter o log, mas corrigindo o texto para refletir o fluxo real de ajuste.

#### 2. Reaproveitar o mesmo padrão já existente no Financeiro
Arquivo de referência: `src/components/esteira/VoucherFinanceiroActions.tsx`

Esse arquivo já faz o comportamento correto:
- devolve para `AJUSTE_OPERACAO` / `AJUSTE_FISCAL`
- usa `buildAjusteWithRequester("FINANCEIRO", ...)`

Vou espelhar exatamente essa lógica na tela de Pagamentos, de forma cirúrgica, sem refatorar.

#### 3. Ajustar os textos da interface no modal de retorno
Arquivo: `src/components/esteira/PagamentosTab.tsx`

Hoje o modal fala em “voltará para revisão da equipe de X”, mas induz que vai para etapa normal.
Vou atualizar os textos para deixar claro que:
- o voucher voltará **como ajuste**
- a justificativa será registrada
- depois do ajuste ele retornará ao Financeiro solicitante

#### 4. Garantir compatibilidade com o reenvio já implementado
Arquivos envolvidos:
- `src/utils/voucherAjusteRouting.ts`
- `src/components/esteira/VoucherOperacaoActions.tsx`

Como o marcador `[REQ:FINANCEIRO]` passará a ser salvo também via Pagamentos, o fluxo já existente de reenvio inteligente voltará a funcionar corretamente:
- `AJUSTE_OPERACAO` corrigido → volta para **FINANCEIRO**
- `AJUSTE_FISCAL` corrigido → volta para **FINANCEIRO**

### Resultado esperado
Depois da correção, ao retornar um voucher pela tela de Pagamentos:

- para **Operacional** → ele entrará em `AJUSTE_OPERACAO`
- para **Fiscal** → ele entrará em `AJUSTE_FISCAL`
- a justificativa aparecerá corretamente
- o voucher ficará visualmente identificado como ajuste
- ao concluir o ajuste, ele retornará ao **Financeiro**, que foi a etapa solicitante

### Arquivos a alterar
- `src/components/esteira/PagamentosTab.tsx`

### Detalhe técnico
Hoje o bug está nesta lógica de `PagamentosTab.tsx`:
```ts
etapa_atual: voltarDestinoEtapa
```

Ela deverá passar a usar:
```ts
// destino Operacional
etapa_atual: "AJUSTE_OPERACAO"
ajuste_operacao: buildAjusteWithRequester("FINANCEIRO", justificativa)

// destino Fiscal
etapa_atual: "AJUSTE_FISCAL"
ajuste_fiscal: buildAjusteWithRequester("FINANCEIRO", justificativa)
```

### Validação após implementar
Vou validar estes cenários:
1. Pagamentos → retornar para Operacional → voucher aparece em `AJUSTE_OPERACAO`
2. Operação visualiza a justificativa corretamente
3. Operação corrige e envia → retorna direto para Financeiro
4. Pagamentos → retornar para Fiscal → voucher aparece em `AJUSTE_FISCAL`
5. Fiscal corrige e envia → retorna direto para Financeiro
