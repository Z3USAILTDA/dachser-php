Identifiquei a causa provável: a aba Robô usada em `/fin/esteira` ainda usa o componente antigo `RoboTab`, que faz um parser simples local e não usa o parser exaustivo recém-criado em `parse-comprovante-pdf`. O parser novo reconhece corretamente os dois arquivos do print:

- `2026188294004052026.5.pdf` → ND `20261882940`
- `2026188293704052026.6.pdf` → ND `20261882937`

Plano de implementação:

1. Aplicar o parser exaustivo também na aba Robô principal
   - Atualizar `src/components/tabs/RoboTab.tsx` para chamar `parse-comprovante-pdf` ao selecionar arquivos.
   - Usar `numeroND`, `numeroSPO`, `linhaDigitavel`, `candidatosND` e `candidatosSPO` retornados pela função.
   - Testar primeiro por ND para nomes no formato `<ND><DDMMYYYY>.<seq>.pdf`, porque nestes comprovantes o voucher real está no início do nome do arquivo.

2. Buscar candidatos de forma mais robusta
   - Para cada arquivo, tentar os candidatos em ordem de prioridade:
     - ND principal extraído;
     - linha digitável, se existir;
     - demais candidatos ND;
     - SPO principal extraído;
     - demais candidatos SPO.
   - Deduplicar candidatos para evitar chamadas repetidas.
   - Manter limite de candidatos razoável para não trazer de volta a lentidão.

3. Corrigir a UX da aba Robô
   - Trocar o texto/badge de “SPO não identificado” para algo compatível com SPO/ND, como “Voucher não identificado”.
   - Mostrar “ND 20261882940” quando o candidato extraído for ND, evitando a falsa impressão de que só procurou SPO.
   - Ajustar o campo manual para aceitar “SPO ou ND” e buscar por ambos.
   - Atualizar a lista de padrões aceitos para incluir exemplos reais como `2026188294004052026.5.pdf`.

4. Melhorar a contagem e status após identificação
   - Garantir que o total identificado seja calculado a partir do resultado atualizado, não do estado antigo.
   - Manter processamento em paralelo/concurrency limitada para não piorar a demora.

5. Opcional, mas recomendado: otimização backend para reduzir chamadas
   - Adicionar no `mariadb-proxy` uma ação única de busca por lote/candidatos, por exemplo `find_voucher_by_candidates`.
   - Assim, cada arquivo chamaria o banco uma vez com todos os candidatos, em vez de várias chamadas separadas.
   - Isso reduz a latência e também diminui a chance de falha por timeout/conexões.

Arquivos previstos:

- `src/components/tabs/RoboTab.tsx`
- Possivelmente `supabase/functions/mariadb-proxy/index.ts`, se implementarmos a busca por lote.

Resultado esperado:

- Os dois arquivos do print passam a identificar automaticamente os vouchers `20261882940` e `20261882937`.
- A aba Robô deixa de depender apenas de SPO e passa a usar a mesma inteligência SPO/ND já validada no parser novo.
- A identificação continua rápida, sem voltar para o fluxo antigo sequencial e lento.