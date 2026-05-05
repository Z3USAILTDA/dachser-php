
## Aviso de divergência de roteamento — versão clara e contextual

### Objetivo
Quando um voucher cair em uma etapa incompatível com seus atributos (ex.: FISCAL com `cobranca_em_nome_de = CLIENTE`), exibir um aviso **explicando exatamente o problema, com dados do voucher e dos vouchers irmãos do mesmo SPO/master**, e oferecer a ação de devolver para a etapa anterior. Sem alterar dados automaticamente.

### Caso real (101-292930 DIM-BY)
- Existem múltiplos vouchers no mesmo `nd` master (4 vouchers do SPO).
- Este voucher tem `cobranca_em_nome_de = CLIENTE` → **não deveria passar pelo Fiscal**.
- Os outros têm `cobranca_em_nome_de = DACHSER` → **passam pelo Fiscal normalmente**.
- Resultado: este voucher foi roteado para FISCAL incorretamente e ficou travado sem ações.

### Estratégia de detecção
Helper `detectVoucherEtapaDivergence(voucher, siblings)` em `src/utils/voucherDivergence.ts`:

- Recebe o voucher atual + lista de irmãos (mesmo `nd` base, ex.: `101-292930`).
- Retorna:
  ```ts
  {
    divergent: boolean;
    titulo: string;            // título curto do problema
    descricao: string;          // explicação longa, com nomes/contagens
    contexto: { totalIrmaos: number; irmaosIncompativeis: VoucherResumo[] };
    etapaSugerida: EtapaWorkflow;  // p/ onde devolver (ex.: AJUSTE_OPERACAO)
  }
  ```

Regras:
1. **FISCAL/AJUSTE_FISCAL com CLIENTE** → divergente.
2. (futuro) SUPERVISOR sem urgência → divergente.

### Fonte dos "irmãos"
- Em `EsteiraVoucherDetails.tsx`, já existem hooks que buscam vouchers do mesmo `nd`/SPO (usados no card "Vouchers relacionados"). Reaproveitar essa lista — não criar nova query.
- Se a lista ainda não estiver disponível no momento da renderização, exibir aviso genérico (sem o bloco "outros vouchers do SPO") e atualizar quando carregar.

### UI — `VoucherDivergenceAlert.tsx` (card âmbar destacado)
Layout:
```
┌─ ⚠ Divergência detectada no roteamento ────────────┐
│                                                    │
│ Este voucher está na etapa FISCAL, mas a cobrança  │
│ é em nome do CLIENTE — nessa configuração a etapa  │
│ Fiscal NÃO se aplica e o voucher deveria seguir    │
│ direto para Financeiro.                            │
│                                                    │
│ Contexto do SPO 101-292930 (4 vouchers):           │
│   • 101-292930 DIM-BY  — CLIENTE  ← este           │
│   • 101-292930 XXX-YY  — DACHSER  (segue Fiscal)   │
│   • 101-292930 …       — DACHSER  (segue Fiscal)   │
│   • 101-292930 …       — DACHSER  (segue Fiscal)   │
│                                                    │
│ Causa provável: o campo "Cobrança em nome de" foi  │
│ alterado para CLIENTE depois que o voucher já      │
│ tinha sido enviado para Fiscal.                    │
│                                                    │
│ Para corrigir, devolva para Operação para que o    │
│ roteamento seja refeito.                           │
│                                                    │
│ Motivo do retorno *                                │
│ [ textarea ]                                       │
│                                                    │
│ [Cancelar]  [Devolver para Operação]               │
└────────────────────────────────────────────────────┘
```

Cores/ícone seguem o padrão do design system (âmbar/`AlertTriangle`, fundo translúcido sobre `#050608`, borda dourada sutil).

Comportamento do botão "Devolver para Operação":
- Reaproveita o fluxo já existente em `VoucherFiscalActions.handleDevolver`:
  - `update_voucher_esteira` → `etapa_atual = AJUSTE_OPERACAO`, `ajuste_operacao = motivo` (com prefixo identificando origem do retorno = "DIVERGENCIA_FISCAL_CLIENTE")
  - `save_voucher_log` → `acao = DIVERGENCIA_DEVOLVIDA`, `detalhe` contém: regra violada, valor de `cobranca_em_nome_de`, contagem de irmãos compatíveis/incompatíveis, motivo digitado pelo usuário
  - `sendVoucherReturnNotification` para o criador
- Após sucesso: toast de confirmação + recarregar dados do voucher.

### Wire-up em `EsteiraVoucherDetails.tsx`
- Calcular `divergence = detectVoucherEtapaDivergence(voucher, irmaosDoSpo)`.
- Renderizar `<VoucherDivergenceAlert>` **acima** dos cards de ação quando:
  - `divergence.divergent === true`
  - **e** nenhum `canShow*Actions()` retorna true (usuário ficou sem botão).
  - **e** o usuário tem permissão na esteira (mesmo guard de roles já usado).
- Não relaxar `canShowFiscalActions()` — a regra de negócio continua intacta.

### Arquivos
- Novo: `src/utils/voucherDivergence.ts`
- Novo: `src/components/esteira/VoucherDivergenceAlert.tsx`
- Editado: `src/pages/esteira/EsteiraVoucherDetails.tsx` (apenas cálculo + render condicional)

Sem mudanças em edge functions, schema, RLS ou memória.

### Validação
1. `/fin/esteira/voucher/194b6240-…`: card âmbar visível com texto explicando a regra (FISCAL + CLIENTE), listando os 4 vouchers do SPO 101-292930 e marcando este como o incompatível.
2. Devolução com motivo move para `AJUSTE_OPERACAO`, gera log e notifica o criador.
3. Vouchers sem divergência não mostram o aviso (zero efeito colateral nas outras telas).
