
## Problema

No `RoboTab` (tela `/fin/esteira` → aba Robô), ao arrastar/selecionar comprovantes, a função `handleFilesSelected` em `src/components/tabs/RoboTab.tsx` faz extração de candidatos + várias chamadas ao `mariadb-proxy` (`find_voucher_by_spo` / `find_voucher_by_nd`) em lotes de 5, e só dá `setFiles((prev) => [...prev, ...results])` **no final**, quando todos os lotes terminam. Resultado: depois do toast inicial "Identificando X arquivo(s)…", a tela fica imóvel — sem barra de progresso, sem lista, sem spinner — e o usuário pensa que travou.

A barra de progresso e o estado de "processing" hoje só existem para a etapa de *envio* (`processFiles`), não para a etapa de *identificação*.

## Plano

1. **Adicionar estado de identificação em `RoboTab.tsx`**
   - Novo state `identifying: boolean` e `identifyProgress: { done: number; total: number }`.
   - Setar `identifying=true` e `total = selectedFiles.length` no início de `handleFilesSelected`; resetar no `finally`.

2. **Renderizar arquivos imediatamente como "identifying"**
   - Antes do loop de identificação, fazer `setFiles(prev => [...prev, ...placeholders])`, onde cada placeholder tem `status: "identifying"`, apenas com `fileName` e o `File`. O usuário já vê a lista crescer no instante do drop.
   - Incluir um novo valor `"identifying"` no tipo `FileMatch["status"]` (e ajustar `getStatusBadge` para exibir um badge animado "Buscando voucher…").
   - À medida que cada `processOne` termina, fazer `setFiles(prev => prev.map(...))` substituindo o placeholder pelo resultado real (status volta para `"pending"` se houver match, ou continua sem voucher).
   - Incrementar `identifyProgress.done` a cada arquivo concluído.

3. **Banner de progresso no card de upload**
   - Logo abaixo do `UploadZone`, quando `identifying === true`, mostrar um bloco pulsante (mesmo padrão visual já usado no `processing`):
     - spinner + "Identificando X de Y comprovantes…"
     - `Progress` com `value = done / total * 100`
     - texto auxiliar: "Lendo o nome de cada arquivo e cruzando com os vouchers em aberto. Não feche esta janela."
   - Desabilitar o `UploadZone` e o botão "Processar" enquanto `identifying` for verdadeiro (evita drops sobrepostos).

4. **Feedback por linha**
   - Linhas com `status: "identifying"`: borda animada (`animate-pulse` + `border-primary/40`) e texto "Analisando nome do arquivo…" no lugar do badge.
   - Linhas já resolvidas: comportamento atual preservado (badge "Identificado", "Não identificado", etc.).

5. **Sem mudança de lógica de negócio**
   - Nenhuma alteração no parser, no `mariadb-proxy`, nos critérios de match ou na regra "identificação só pelo nome do arquivo". Mudança 100% de UI/feedback no `RoboTab.tsx`.
   - Concurrency continua em 5; só passa a reportar progresso incremental.

## Arquivos a editar

- `src/components/tabs/RoboTab.tsx` — único arquivo afetado.

## Validação

- Soltar 10+ comprovantes e confirmar que: (a) a lista aparece imediatamente com status "Analisando…", (b) o banner mostra "X de Y" subindo, (c) ao final, todos viram "Identificado / Não identificado" como hoje, (d) o botão "Processar" só habilita após o término da identificação.
