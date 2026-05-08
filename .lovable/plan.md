## Objetivo

Estender a verificação anti-duplicidade do preview de importação de vouchers para cobrir **duas frentes**:

1. **Duplicidade interna da planilha** (já implementado — manter): mesmo par `id_rm + SPO` aparecendo em mais de uma linha.
2. **Duplicidade contra o banco** (novo): par `id_rm + numero_spo` que **já existe em `dados_dachser.t_vouchers`** — marcar como ERRO no preview com a mensagem `"Já existente na etapa <X>"`, onde `<X>` é a etapa atual do voucher já cadastrado.

Isso elimina o 500 do `uq_voucher_rm_spo` (causado por resíduos de tentativas anteriores onde linhas iniciais já foram comitadas) **antes** do envio, e dá ao usuário visibilidade exata de qual etapa o voucher conflitante está.

## Mudanças

### 1. `supabase/functions/mariadb-proxy/index.ts` — handler `preview_voucher_batch_import`

Após `buildPreviewItems` (e antes de retornar), incluir uma checagem contra `t_vouchers`:

- Coletar pares candidatos a partir dos itens com `id_rm` numérico válido e `spo` (ou `processo`/`numero_spo`) preenchido. Normalizar SPO com `trim().toUpperCase()`.
- Executar **uma única query**:
  ```sql
  SELECT id_rm, numero_spo, etapa_atual
    FROM dados_dachser.t_vouchers
   WHERE (id_rm, numero_spo) IN ((?,?), (?,?), ...)
  ```
- Indexar resultados por chave `${id_rm}|${numero_spo_upper}`.
- Para cada item cuja chave bate:
  - `status = "ERROR"`
  - `already_exists = true`
  - `existing_etapa = <etapa_atual_legível>`
  - Anexar à `validation_message` (sem perder mensagens anteriores) o sufixo: `"Já existente na etapa <X>"`.

**Mapeamento de etapa para rótulo legível** (helper local `prettyEtapa(raw)`):
- `FISCAL → Fiscal`
- `FINANCEIRO → Financeiro`
- `SUPERVISOR → Supervisor`
- `PAGAMENTOS → Pagamentos`
- `BAIXA → Baixa`
- `CONCLUIDO / CONCLUÍDO → Concluído`
- Fallback: capitalizar o valor bruto (`"foo" → "Foo"`).

Recalcular contadores `valid` / `errors` no retorno.

### 2. `supabase/functions/mariadb-proxy/index.ts` — handler `create_voucher_batch_import`

Defesa contra race entre preview e create + idempotência:

**a)** Antes do INSERT em `t_vouchers`, repetir a mesma query do passo 1 (com `etapa_atual`). Itens cuja chave bate são **pulados**:
   - Marcar `t_voucher_batch_import_item.status = 'ERROR'` com mensagem `"Já existente na etapa <X> — pulado"`.
   - **Não executar** o INSERT em `t_vouchers` para esses itens.

**b)** Trocar `INSERT INTO dados_dachser.t_vouchers (...)` por `INSERT IGNORE INTO ...`. Se `affectedRows === 0`, fazer um SELECT pontual de `etapa_atual`, marcar item como `ERROR` com `"Já existente na etapa <X> — pulado"` e **continuar o loop** (não derrubar o lote).

**c)** Resposta enriquecida: incluir `skipped_existing: number` no JSON de retorno, junto com `created`.

### 3. `src/components/esteira/BatchImportPreviewTable.tsx`

- Estender `PreviewItem`:
  ```ts
  already_exists?: boolean;
  existing_etapa?: string | null;
  ```
- Quando `already_exists`, exibir **badge âmbar** ao lado do SPO (próximo do badge "Duplicado" já existente):
  - Texto: `Já na etapa <X>`
  - Tooltip: `"Este SPO já existe no sistema para o mesmo RM, atualmente na etapa <X>"`
  - Estilo: borda âmbar / fundo âmbar translúcido (mesmo padrão do badge "Duplicado", trocando vermelho por âmbar).

A linha já vai aparecer como ERROR pelo `status` vindo do backend — o badge é apenas affordance visual.

### 4. `src/components/esteira/BatchImportVoucherDialog.tsx`

- Onde `create_voucher_batch_import` retorna (trecho do toast pós-criação): ler `data.skipped_existing`. Se `> 0`, ajustar mensagem do toast:
  - `"Lote criado: ${data.created} voucher(s) — ${data.skipped_existing} ignorado(s) (já existentes em outras etapas)"`
- Manter `markDuplicates` e bloqueio de envio existentes intactos. O backend agora também devolve itens com `already_exists`/`status=ERROR` no preview, então o filtro atual de seleção de elegíveis já os exclui automaticamente.

## Fora de escopo

- Sem alterar índice `uq_voucher_rm_spo` ou schema de `t_vouchers`.
- Sem transação MariaDB englobando o batch (o `INSERT IGNORE` cobre o cenário de race).
- Sem mudanças nas regras de urgência, etapa inicial ou forma de pagamento.
- Sem alterar `BatchImportRowEditor`.

## Critérios de aceite

1. Reupload de planilha contendo um SPO que já existe em `t_vouchers` (ex.: `105-290647 DIM-BY` da tentativa anterior): a linha aparece como **ERROR** no preview, com badge âmbar `Já na etapa <X>` e mensagem `"Já existente na etapa <X>"` correspondente à etapa real.
2. Duplicatas internas da planilha continuam sendo detectadas (badge vermelho `Duplicado`) — sem regressão.
3. Tentar criar lote contendo um item já existente (mesmo via race): o item é pulado via `INSERT IGNORE`, demais entram normalmente, toast informa `"X ignorado(s) (já existentes em outras etapas)"`.
4. Não há mais 500 com `Duplicate entry ... for key 'uq_voucher_rm_spo'` em nenhum cenário.
5. Planilhas 100% inéditas (sem colisões internas nem com banco) seguem o fluxo sem itens marcados.
