
## Plano: Retorno de voucher ajustado vai direto para etapa solicitante

### Comportamento atual
Quando um voucher é "voltado" para ajuste (ex: Financeiro → Operacional via AJUSTE_OPERACAO), após o ajuste ele segue o fluxo padrão linear: Operacional → Fiscal → Supervisor → Financeiro novamente. Isso força o voucher a passar por etapas que já o aprovaram.

### Comportamento desejado
O voucher ajustado deve retornar **diretamente à etapa que solicitou o ajuste**, pulando as intermediárias. Exemplos:
- Financeiro pediu ajuste ao Operacional → após ajuste, volta direto ao Financeiro
- Supervisor pediu ajuste ao Fiscal → após ajuste, volta direto ao Supervisor
- Fiscal pediu ajuste ao Operacional → após ajuste, volta direto ao Fiscal

### Investigação necessária
Preciso ler:
1. Hook/serviço que processa transições de etapa (provavelmente `useVoucherActions` ou similar)
2. Lógica do botão "Voltar Etapa" para identificar como `etapaSolicitanteAjuste` é (ou não é) registrada
3. Lógica de avanço a partir de `AJUSTE_OPERACAO` / `AJUSTE_FISCAL`

### Alterações previstas

**1. Registrar etapa solicitante ao voltar**
Quando alguém aciona "Voltar Etapa" enviando para `AJUSTE_OPERACAO` ou `AJUSTE_FISCAL`, gravar em um campo (ex: `etapa_solicitante_ajuste` no MariaDB / metadado no log) qual era a etapa de origem (FINANCEIRO, SUPERVISOR, FISCAL).

**2. Roteamento inteligente após ajuste**
No handler "Concluir Ajuste":
- Se `etapaSolicitanteAjuste` existir → mover voucher direto para essa etapa
- Caso contrário → manter fluxo linear atual (compatibilidade)

**3. Limpeza**
Após o roteamento direto, limpar `etapaSolicitanteAjuste` para que próximos ajustes não confundam o roteamento.

**4. Log de auditoria**
Registrar no histórico: "Voucher ajustado retornado diretamente para [ETAPA] (etapa solicitante do ajuste)".

### Arquivos prováveis a editar
- Hook de transição de etapa (a confirmar após exploração)
- Edge function `mariadb-proxy` (se houver ação específica de ajuste)
- Tipagem em `src/types/voucher.ts` (adicionar campo opcional `etapaSolicitanteAjuste`)

### Observação
Como estou em modo plano (read-only) e o fluxo de transição está espalhado em hooks que ainda não inspecionei em detalhe nesta sessão, ao aprovar irei primeiro localizar com precisão os pontos de transição (`AJUSTE_OPERACAO`, `AJUSTE_FISCAL` → próxima etapa) e aplicar as alterações de forma cirúrgica, sem refatorar o fluxo existente.
