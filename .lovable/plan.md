## Problema

Duas operações estão lentas:

1. **Identificar comprovantes (Robô)**: até **dezenas de segundos** para 5–10 arquivos. Loop sequencial: para cada arquivo, faz 1 chamada de parse + até 5–7 chamadas sequenciais de `find_voucher_by_*` (cada uma com cold-start de edge function + conexão MariaDB).
2. **Marcar processo como pronto**: faz `set_ready_for_robo` e depois `update_tipo_exec_dados_rm` em sequência, dobrando a latência percebida.

## Causa raiz

- `ComprovanteRobot.identifyFiles`: `for (let i = 0; i < files.length; i++)` aguarda cada arquivo terminar antes de iniciar o próximo. Dentro de cada arquivo, `tryCandidate` é chamado em loop também sequencial.
- `PagamentosTab.handleSetReady`: dois `await supabase.functions.invoke` consecutivos quando são independentes.

## Plano

### 1. `src/pages/esteira/ComprovanteRobot.tsx` — paralelizar identificação

- Substituir o loop sequencial por processamento em **paralelo com concorrência limitada (5 simultâneos)**. Isolar a lógica de cada arquivo em uma função `identifyOne(fileMatch, idx)` e disparar batches via `Promise.all`.
- Manter `setProgress` incrementando à medida que cada promessa resolve (não por índice de loop).
- Manter `tryCandidate` sequencial dentro de cada arquivo (curto-circuito no primeiro hit é correto), mas limitar a quantidade de candidatos testados para os **top 6 por score** (parser já ordena por prioridade) para evitar desperdício quando há muitos candidatos genéricos de baixa pontuação.

### 2. `src/components/esteira/PagamentosTab.tsx` — paralelizar marcar pronto

- Em `handleSetReady`, executar `set_ready_for_robo` e `update_tipo_exec_dados_rm` via `Promise.all` (são independentes).
- Manter validações e o update otimista do estado local.

### 3. (Opcional, sem mudança de schema) Aumentar feedback visual

- Em `identifyFiles`, mostrar contador "X de N processados" no toast/progress já existente — sem novo componente.

Sem mudanças de backend, schema, memória ou em outras telas.

## Resultado esperado

- Identificação de 10 comprovantes: de ~30–60s para ~6–12s (5x paralelismo + corte de candidatos).
- Marcar pronto: de ~1.5–3s para ~0.8–1.5s (uma round-trip em vez de duas).
