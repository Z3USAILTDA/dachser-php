

## Diagnóstico
A coluna **Rota** falha em identificar conexões mesmo quando os eventos da timeline mostram claramente aeroportos intermediários. O badge dourado de conexão não acende e, em vários casos, o aeroporto de escala nem aparece entre Origem → Destino.

## Causa raiz
A função `conexao` em `supabase/functions/fetch-status-aereo/index.ts` (linhas 1373–1443) só extrai aeroportos de **eventos do tipo ARR** ou de **segmentos de rota inline** (`MAD-GRU`). Isso deixa de fora cenários muito comuns:

1. **Eventos DEP/RCF/MAN com aeroporto único**: textos como `"Departed from MAD"`, `"RCF GRU"`, `"Received at LIS"` — contêm o aeroporto da escala mas o filtro `if (evStatus !== 'ARR' && !evDesc.includes('ARR')) continue;` pula tudo que não tenha "ARR".
2. **Campo `station`/`location` com nome de cidade ou string longa** (ex.: `"MADRID BARAJAS"`, `"Lisbon (LIS)"`): `extractAirportFromEvt` exige exatamente 3 letras `^[A-Z]{3}$`, então rejeita.
3. **Formato uxtracking 996**: eventos vêm como `{descricao_evento: "DEP MAD - Madrid"}`. O regex `ARR\s*[-/]\s*[A-Z]{3}` não bate; o regex `at\s+[A-Z]{3}` também não.
4. **Regex de rota inline restritivo**: `([A-Z]{3})[-→]([A-Z]{3})` só captura quando há dois códigos colados; perde menções soltas.

Resultado: `connectionAirports` fica vazio → `conexao = null` → o front (Index.tsx) não tem nada para destacar entre Origem e Destino.

## Correção (cirúrgica)

### 1. `supabase/functions/fetch-status-aereo/index.ts` — função de extração `conexao` (linhas ~1373–1443)

**a) Remover o filtro `if (evStatus !== 'ARR' ...) continue;`** e iterar sobre **todos** os eventos da timeline, coletando qualquer aeroporto válido que apareça em DEP, RCF, ARR, MAN, etc. A classificação ARR-DESTINO/CONEXÃO continua usando apenas eventos ARR (já está em `classifyArrival`), mas a **coleta da rota física** precisa olhar todos os tipos.

**b) Reforçar `extractAirportFromEvt`** com três estratégias adicionais (em ordem):
   - **Padrão `<EVT> <AAA>`** no início da descrição: regex `/^\s*(?:DEP|ARR|RCF|RCS|MAN|NFD|DLV|TRM|TFD|FOH)\s+([A-Z]{3})\b/i` — captura `"DEP MAD"`, `"RCF GRU"`.
   - **Padrão `from/to/in/at <AAA>`**: regex `/\b(?:from|to|in|at|departed|arrived)\s+([A-Z]{3})\b/i` — captura `"Departed from MAD"`.
   - **Campo `station`/`location` longo**: extrair grupo de 3 letras maiúsculas entre parênteses ou no final, ex.: `"MADRID (MAD)"` → `MAD`. Regex `/\(([A-Z]{3})\)|\b([A-Z]{3})\s*$/`.

**c) Preservar ordem cronológica**: iterar `[...events].reverse()` (mais antigos primeiro) para que `connectionAirports` reflita a sequência real do voo (origem → escala1 → escala2 → destino), não a ordem DESC do banco.

**d) Stop-words ampliada**: incluir códigos IATA-like que são na verdade status (`OFD`, `OFL`, `BUP`, `RDP`, `LAT`, `TKG`, `SCR`, `ECC`, `TFD`, `TRM`, `RFC`, `DMG`, `RET`, `AWB`) — já parcialmente coberto, completar.

### 2. `supabase/functions/fetch-status-aereo/index.ts` — `classifyArrival` (linhas ~207–247)
Mesma melhoria em `extractAirportFromEvent` (helper paralelo): adicionar os 3 padrões acima para reduzir o caminho heurístico (`destMentioned`) que muitas vezes cai em falso `ARR - DESTINO` quando o destino aparece apenas no campo `route` mesmo sem ter chegado lá.

### 3. Memória persistente
Atualizar `mem://air/tracking/route-logic-and-highlighting`:
> "Extração de conexões agora considera **todos os tipos de evento** (DEP, RCF, ARR, MAN, etc.), não apenas ARR. Padrões reconhecidos: `<EVT> <AAA>` no início da descrição (`DEP MAD`), `from/to/at/in <AAA>` (`Departed from MAD`), código entre parênteses (`MADRID (MAD)`), e segmentos inline `AAA-BBB`. Iteração em ordem cronológica para preservar sequência real da rota."

## Arquivos alterados
- `supabase/functions/fetch-status-aereo/index.ts` — ~30 linhas modificadas em 2 blocos (`conexao` e `classifyArrival`/`extractAirportFromEvent`).
- `mem://air/tracking/route-logic-and-highlighting` — atualização.

## Validação pós-deploy
1. Recarregar `/air/tracking-aereo` e localizar AWBs com escala conhecida (ex.: prefixo 020 LH com escala FRA, prefixo 996 com escala MAD).
2. Verificar coluna **Rota**: deve aparecer `ORIGEM → ESCALA → DESTINO` com a escala destacada em dourado quando o status atual for `DEP`/`ARR - CONEXÃO`/`IN_TRANSIT_NO_RCF`.
3. Conferir log da edge `fetch-status-aereo`: `[classifyARR] ... airport=XXX dest=YYY` deve aparecer com mais frequência (menos quedas no fallback heurístico).
4. Confirmar que AWBs sem conexão (rota direta) continuam exibindo apenas `ORIGEM → DESTINO` — sem falsos positivos.

## Riscos e mitigações
- **Falso positivo de aeroporto**: novos regex são estritos (3 letras maiúsculas em contexto específico) e a stop-word list filtra códigos de status. Origem e destino são removidos no `filteredRoute`.
- **Sem regressão em outros prefixos**: a lógica é genérica (não condicionada a 996). Os prefixos que já funcionavam (LH/AF/KL com `MAD-GRU` inline) continuam usando o path de `routeAirportsOrdered` como antes — apenas ganham mais cobertura.

