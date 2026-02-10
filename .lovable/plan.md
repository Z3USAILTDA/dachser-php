

# Ajustes na Esteira de Vouchers/SPO

## 1. Identificacao flexivel de vouchers por nome de arquivo

**Problema:** Nomes como `2025187823128012026.36` nao encontram o voucher `20251878231` porque o Pattern 0 (pure number) retorna o numero inteiro sem tentar substrings.

**Solucao:** No edge function `parse-comprovante-pdf`, apos extrair o numero puro do filename, adicionar logica de busca progressiva no backend (`find_voucher_by_spo` e `find_voucher_by_nd`). No `mariadb-proxy`, alterar as queries `find_voucher_by_spo` e `find_voucher_by_nd` para buscar tambem por prefixo (LEFT match), testando substrings decrescentes do numero extraido ate encontrar um voucher. Exemplo: para `2025187823128012026`, tentar `20251878231`, `2025187823`, etc.

**Arquivos:**
- `supabase/functions/parse-comprovante-pdf/index.ts` -- Ajustar Pattern 0 e Pattern 3 para extrair substrings candidatas do numero puro
- `supabase/functions/mariadb-proxy/index.ts` -- Alterar `find_voucher_by_spo` e `find_voucher_by_nd` para busca por prefixo progressivo (tentar o numero completo e depois substrings menores ate 5 digitos)

---

## 2. Comprovante anexado ja entra como VALIDADO

**Problema:** Ao anexar comprovante (tanto no robo quanto manualmente), o status fica como `ANEXADO`, exigindo validacao manual posterior.

**Solucao:** Alterar todos os pontos que setam `status_comprovante = 'ANEXADO'` para setar `status_comprovante = 'VALIDADO'` diretamente. O fluxo de "retornar a pendente" ja existe e continuara funcionando normalmente.

**Arquivos:**
- `supabase/functions/mariadb-proxy/index.ts` -- Na action `attach_comprovante_batch`, trocar `ANEXADO` por `VALIDADO`
- `src/components/tabs/RoboTab.tsx` -- Trocar `status_comprovante: 'ANEXADO'` por `'VALIDADO'`
- Verificar qualquer outro ponto que sete o status ao anexar comprovante

---

## 3. Logica ADF - permitir passagem sem documento anexado

**Problema:** Vouchers do tipo ADF atualmente exigem documento fiscal anexado antes de seguir para o ROBO (checklist de prontidao bloqueia). A regra correta e: ADF pode seguir por todas as etapas normalmente, com ou sem documento anexado. Se tiver documento, aceita; se nao tiver, nao bloqueia.

**Solucao:** Remover a validacao obrigatoria de documento fiscal para ADF em todos os pontos:

**Arquivos:**
- `src/types/voucher.ts` -- Na funcao `validarProntoParaRobo`, remover o bloco que adiciona pendencia para ADF sem documento fiscal
- `src/components/esteira/ProntidaoChecklist.tsx` -- Remover o item 4 que exige documento fiscal anexado para ADF
- `src/components/esteira/VoucherFinanceiroActions.tsx` -- O alerta visual de ADF pendente pode ser mantido como informativo (nao bloqueante), ou removido
- `src/components/esteira/VoucherTable.tsx` -- Ajustar tooltip do indicador ADF para refletir que o documento e opcional
- `src/components/esteira/VoucherRascunhoActions.tsx` -- ADF deve seguir o fluxo normal (OPERACAO ou FISCAL conforme regra de urgencia/cobranca), nao pular direto para FINANCEIRO
- `src/components/esteira/VoucherOperacaoActions.tsx` -- Idem, ADF segue fluxo normal em vez de pular para FINANCEIRO
- `src/components/esteira/CreateVoucherDialog.tsx` -- ADF segue o mesmo fluxo de envio que outros tipos

---

## Secao Tecnica

### Busca flexivel (item 1)
Na `find_voucher_by_spo` e `find_voucher_by_nd`, implementar busca progressiva:
```text
Para numero_spo = "2025187823128012026":
  1. WHERE numero_spo = '2025187823128012026'     -- match exato
  2. WHERE '2025187823128012026' LIKE CONCAT(numero_spo, '%')  -- o numero extraido COMECA com o numero_spo do banco
  3. Retorna o match mais longo encontrado
```
Isso permite que o numero do banco (`20251878231`) seja encontrado como prefixo do nome do arquivo (`2025187823128012026`).

### Comprovante validado (item 2)
Troca simples de string `'ANEXADO'` para `'VALIDADO'` nos UPDATE/INSERT do backend. O log continuara registrando como `COMPROVANTE_ANEXADO` para auditoria, mas o status ja sera VALIDADO.

### ADF sem bloqueio (item 3)
- Remover checagem `statusDocumentoFiscal === 'PENDENTE'` como bloqueante
- ADF segue o fluxo padrao: RASCUNHO -> OPERACAO -> FISCAL -> SUPERVISOR (se urgente) -> FINANCEIRO -> ROBO -> CONCLUIDO
- O indicador visual de ADF pode permanecer como informativo (badge amarelo sem bloqueio)
- `CreateVoucherDialog`: ao enviar ADF direto (nao rascunho), segue a mesma logica de determinacao de etapa que os demais tipos

