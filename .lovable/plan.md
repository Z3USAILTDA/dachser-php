## Diagnóstico

A `linha_digitavel` (campo `voucher_boleto` em `t_dados_rm`) chega `NULL` em alguns processos por uma **condição de corrida no front-end**:

1. Operador anexa o boleto → `extract-boleto-barcode` extrai a linha digitável **assincronamente** → `save_linha_digitavel` grava em `t_vouchers.linha_digitavel`.
2. Operador clica "Aprovar/Enviar para Financeiro" antes que o objeto `voucher` em memória (estado React) seja recarregado.
3. `insertDadosRmOnFinanceiro(voucher)` em `src/utils/voucherRmSync.ts` lê `voucher.linhaDigitavel` do **objeto em memória** (ainda `null`/`undefined`) e envia `voucher_boleto: null` para o handler `insert_dados_rm`.
4. O handler `insert_dados_rm` (linhas 9579–9706 de `mariadb-proxy/index.ts`) confia cegamente no payload e insere `NULL` em `voucher_boleto`.
5. **A função foi desenhada para nunca falhar** ("não falha a operação principal — apenas loga"), então o operador nunca é alertado.

O mesmo problema afeta `chave_pix` quando o pagamento é PIX e o objeto em memória está defasado.

A confirmação: o DB de origem (`t_vouchers`) tem o valor correto — porque `save_linha_digitavel` foi executado com sucesso. Apenas o snapshot que o front enviou estava desatualizado.

## Plano

Mudança cirúrgica em **um único ponto**, sem mexer em schema, RLS, nem nos 5+ pontos de chamada do front:

### `supabase/functions/mariadb-proxy/index.ts` — handler `insert_dados_rm` (linhas ~9579–9706)

Adicionar **fallback de leitura na fonte de verdade** logo antes do INSERT:

- Se `voucher_boleto` chegou `null/vazio` **OU** `chave_pix` chegou `null/vazio`, fazer um `SELECT linha_digitavel, codigo_barras, chave_pix FROM dados_dachser.t_vouchers` filtrado por `id = voucher_id` (passar do front quando disponível) ou, na ausência, por `id_rm = ?` ou `numero_spo = ?`.
- Usar o valor do banco como fallback: `voucherBoletoFinal = voucherBoleto || (isBoleto ? (db.linha_digitavel || db.codigo_barras) : null)` e `chavePixFinal = chavePix || db.chave_pix`.
- Logar `console.warn` quando o fallback for acionado (rastreabilidade — quem disparou e qual valor foi recuperado).

### Atualização de memória

Registrar a regra: **"`insert_dados_rm` deve sempre validar `voucher_boleto`/`chave_pix` contra `t_vouchers` antes do INSERT, independente do payload do front, para evitar perda por race-condition de extração assíncrona."**

### Validação pós-deploy

- Reproduzir o cenário: anexar boleto + clicar imediatamente em "Aprovar" → conferir que `t_dados_rm.voucher_boleto` foi preenchido a partir do fallback (log warn deve aparecer nos logs do edge).
- Casos onde o front já manda preenchido seguem funcionando normalmente (sem fallback).
- Casos genuinamente sem boleto (forma_pag ≠ BOLETO) continuam com `voucher_boleto = NULL` corretamente.

Sem mudanças em qualquer arquivo do front, sem mudanças em outras actions.