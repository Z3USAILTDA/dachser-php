

## Ajuste: processo 020-65056110 mostrando RCS mas timeline é RCF

### Diagnóstico

No monitoramento aéreo (`/air/tracking`), o "Último Status" da tabela é resolvido em `fetch-status-aereo` pela lógica:

1. **Tenta** pegar o código do evento mais recente da `timeline_json` via `getEventStatusCode()`.
2. **Se falhar**, cai no fallback e usa `ws.last_status_code` do `t_aereo_ws_firecrawl` (valor bruto gravado pelo crawler).

Para o AWB `020-65056110` a timeline já contém `RCF` como evento mais recente, mas a tela continua exibindo `RCS`. Existem duas causas possíveis — precisamos confirmar qual delas com uma consulta ao MariaDB:

**Causa A (mais provável)**: O evento RCF na timeline não tem código direto preenchido (`Status`/`code` vazios) e a descrição não casa com os regex de extração (ex: descrição tipo `"Received from Flight"` sem `(RCF)` no final nem prefixo `RCF -`). `getEventStatusCode()` retorna string vazia → cai no fallback → usa `ws.last_status_code = 'RCS'` antigo.

**Causa B**: O evento RCS tem timestamp **mais recente ou igual** ao RCF na ordenação, então o "evento mais recente" escolhido é o RCS mesmo. Improvável se visualmente RCF aparece acima de RCS na timeline, mas possível quando timestamps empatam.

### Mudança proposta (cirúrgica)

**1. Investigação rápida (1 query SQL)**
Olhar o `timeline_json` real de `020-65056110` em `t_aereo_ws_firecrawl` para confirmar qual das duas causas é a correta e ver o shape exato do evento RCF.

**2. Correção em `supabase/functions/fetch-status-aereo/index.ts`, função `getEventStatusCode()` (linhas 32-47)**

Adicionar reconhecimento dos padrões IATA mais comuns em descrições em inglês/português, sem depender de código entre parênteses:

```
Received from Flight      → RCF
Received from Shipper     → RCS
Manifested                → MAN
Departed                  → DEP
Arrived                   → ARR
Notified for Delivery     → NFD
Awaiting Delivery         → AWD
Delivered                 → DLV
```

É o mesmo mapeamento que já existe em outros trechos do código (ex: `track-awb/index.ts` linhas 342-352, 1233-1237) — estamos apenas aplicando ao ponto central de extração que alimenta TODAS as resoluções de status do tracking aéreo.

**3. Se a causa for a B (ordenação)**: adicionar desempate IATA na ordenação principal (como já existe em `sortEventsDesc`, mas hoje NÃO é usada em `fetch-status-aereo` linhas 1189-1193, que ordena só por data). Ou seja, quando RCS e RCF têm o mesmo timestamp, RCF (mais avançado na hierarquia) vence.

### Não muda

- Lógica de override manual (processos com `MANUAL_OVERRIDES` continuam intocados).
- Esquema das tabelas, RLS, cron jobs.
- Timeline exibida — continua mirror dos dados brutos do MariaDB (regra `Air Data Mirroring Intent v2`).
- Demais funções (CCT, marítimo, etc.).

### Escopo

Correção vale para **qualquer** AWB que caia no mesmo problema (não é fix específico de um processo). Não entrará em `MANUAL_OVERRIDES` — o objetivo é corrigir a resolução automática.

### Validação

1. Rodar a query de diagnóstico e confirmar Causa A vs B.
2. Após deploy, revalidar `020-65056110` em `/air/tracking` — status deve exibir `RCF`.
3. Conferir que outros AWBs não regrediram (ex: processos em `RCS` legítimo continuam como `RCS`).

