
## Diagnóstico atual

Mapeei os principais gargalos olhando o código existente:

**1. Robô de Comprovantes (`src/pages/esteira/ComprovanteRobot.tsx`)**
Por arquivo, hoje rodam **3 chamadas sequenciais** + storage:
- `parse-comprovante-pdf` (LLM, 5–15 s)
- `mariadb-proxy.find_voucher_multi` (nova conexão MariaDB, ~1–2 s de cold start)
- `storage.upload` + `mariadb-proxy.attach_comprovante_batch`
Concorrência atual: identificação=8, upload=6. Cada call de edge function abre **uma conexão MariaDB nova** (logs mostram “connecting / connected” a cada request).

**2. Anexo em lote (`BatchDocumentUploadPanel.tsx`)**
Loop `for…of` **estritamente sequencial**: 1 upload + 1 invoke por arquivo. Subir 25 arquivos = 25 round-trips em série.

**3. `attach_comprovante_batch` (edge function)**
Backend itera serialmente; por voucher executa 4 queries (`SELECT etapa_atual` → `INSERT anexo` → `UPDATE voucher` → `INSERT log`). Para 25 comprovantes = 100 queries em série numa única conexão.

**4. Avançar de etapa / anexar documento avulso**
Cada ação dispara invoke próprio + reload completo (`loadVouchers` recarrega 650 vouchers — log `Fast mode loaded 650 vouchers`). UI espera o reload antes de liberar interação.

---

## Metas

- 25 comprovantes ≤ 2 min  → orçamento ~4,8 s/arquivo wall-clock.
- 50 comprovantes ≤ 4 min → mesmo orçamento, escalando linearmente.
- Anexar documentos / aprovar etapa: feedback < 500 ms (otimista) e conclusão de fato < 2 s.

---

## Plano de mudanças

### A. Robô de Comprovantes — pipeline paralelo de ponta a ponta

1. **Aumentar concorrência** de identificação (8 → 12) e de upload (6 → 10). Limite real é o pool MariaDB e o LLM; testarei com 25 arquivos.
2. **Pipeline (não sequencial por etapa)**: assim que um arquivo é identificado, já entra na fila de upload — em vez de esperar todos identificarem para depois subir tudo.
3. **Eliminar round-trip duplicado**: criar nova action `parse_and_match_comprovante` em `mariadb-proxy` que recebe `pdfBase64`, chama o parser internamente (ou recebe o resultado do parser via fan-out), e já roda o `find_voucher_multi` na mesma conexão. Reduz 2 invokes → 1 por arquivo.
4. **Cache de SPO/ND no cliente**: pré-carregar `get_vouchers_for_comprovante` (já existe) e tentar match local por SPO/ND **antes** de chamar o LLM. Comprovantes cujo nome do arquivo contém SPO/ND válido pulam o LLM totalmente (ganho enorme em lotes nomeados pelo cliente).

### B. `attach_comprovante_batch` — backend em bulk

1. **Multi-row INSERT** para `t_voucher_anexos` (N linhas em uma query).
2. **Multi-row INSERT** para `t_voucher_logs`.
3. Substituir o `SELECT etapa_atual` por arquivo por **um único** `SELECT id, etapa_atual FROM t_vouchers WHERE id IN (...)` no início e atualizar em lote com `UPDATE … WHERE id IN (...)` apenas para os não-CONCLUIDO.
4. Resultado esperado: 100 queries → ~4 queries por lote.

### C. `BatchDocumentUploadPanel` — upload paralelo

1. Trocar `for…of` por `Promise.all` com **pool de concorrência 8** (mesmo padrão do Robô).
2. Após todos uploads de storage terminarem, **um único invoke** `upload_batch_document_bulk` com array — nova action no proxy fazendo INSERT multi-row em `t_voucher_batch_documents`.

### D. Ações “rápidas” (anexar avulso, aprovar etapa, enviar voucher)

1. **Optimistic UI**: aplicar a mudança no estado local imediatamente; reverter só em caso de erro do invoke.
2. **Reload incremental**: após uma ação, atualizar **apenas o(s) voucher(s) afetado(s)** (`get_voucher_by_id`) em vez do `loadVouchers` completo. O console mostra `loadVouchers Fast mode loaded 650 vouchers` rodando 5–6 vezes em poucos segundos — isso some.
3. **Debounce de re-fetch**: se múltiplas ações dispararem em < 800 ms, coalescer num só refresh.

### E. Conexão MariaDB — reduzir cold start

1. Onde o frontend dispara N invokes em sequência (ex.: legacy paths), consolidar em **1 invoke com payload-array**. Cada invoke do `mariadb-proxy` cria uma conexão nova; agrupar amortiza o custo.
2. Verificar e padronizar o uso de `keep-alive` interno do edge function (já aparece no código — confirmar se não há `client.close()` desnecessário no meio de loops).

### F. Métricas

Adicionar `console.time/console.timeEnd` em pontos-chave (parse, match, upload, attach) e logar duração média por arquivo no toast final do robô. Permite validar a meta de 2 min / 25 arquivos sem chutômetro.

---

## Detalhes técnicos (resumo de arquivos)

```
src/pages/esteira/ComprovanteRobot.tsx        Pipeline + concorrência + pré-match local
src/components/esteira/BatchDocumentUploadPanel.tsx   Upload paralelo + bulk invoke
src/components/esteira/PagamentosTab.tsx       Optimistic UI + refresh incremental
src/components/esteira/RetornarPendenteDialog.tsx     idem
src/components/esteira/Voucher*Actions.tsx     Refresh incremental ao aprovar etapa
supabase/functions/mariadb-proxy/index.ts
  - novo case 'parse_and_match_comprovante' (opcional, ver A.3)
  - novo case 'upload_batch_document_bulk'
  - reescrever 'attach_comprovante_batch' com multi-row INSERT/UPDATE
  - novo helper 'get_voucher_by_id_light' p/ refresh incremental
```

---

## Fora de escopo

- Não vou refatorar `loadVouchers` por completo nem mudar layout/UX visual.
- Não mudo o LLM usado pelo `parse-comprovante-pdf` (latência dele é dominante; tratamos com paralelismo + bypass via filename).
- Mantenho contratos das edge functions existentes; só adiciono novas actions.

Quer que eu comece pela parte A+B (robô de comprovantes + batch attach), que é onde está a meta dura de tempo, e depois siga para C/D/E?
