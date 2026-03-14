

## Plano: Aplicar hierarquia IATA para desempate de eventos com mesmo timestamp

### Problema

Quando dois eventos ocorrem na mesma data/hora (ex: RCF e NFD às 19:20), o sistema pode resolver o status incorretamente porque nem todas as funções de sorting aplicam o desempate hierárquico. Atualmente:

- `extractLastEventDescription` (linha 396) — tem `IATA_ORDER` mas incompleto e com valores errados
- `resolveUnkFromTimeline` (linha 284) — **sem desempate** por hierarquia
- `extractLastEventDate` (linha 476) — **sem desempate** por hierarquia
- `extractLastStatusFromTimeline` (linha 34) — pega `events[0]` sem sorting algum

### Solução

1. **Criar uma constante `IATA_HIERARCHY`** compartilhada no topo do arquivo com a ordem completa fornecida pelo usuário (28+ status, de BKD=1 até RET/BUP=50+)

2. **Criar uma função `sortEventsDesc`** reutilizável que ordena por data DESC e aplica `IATA_HIERARCHY` como tiebreaker quando timestamps são iguais (maior número = mais avançado na cadeia = vem primeiro)

3. **Atualizar as 4 funções** para usar `sortEventsDesc`:
   - `extractLastStatusFromTimeline` — adicionar sorting antes de pegar `events[0]`
   - `resolveUnkFromTimeline` — substituir sort manual pela função compartilhada
   - `extractLastEventDescription` — substituir `IATA_ORDER` local pela constante global
   - `extractLastEventDate` — adicionar tiebreaker na ordenação

### Hierarquia (da user message)

```text
BKD=1, TKG=2, LAT=3,
RCS=10, RCT=11, DOC=12, RFC=13, ECC=14, SCR=15,
PRE=20, MAN=21, RDP=22, DEP=23,
TFD=30, TRM=31, TRA=32,
ARR=40, RCF=41, NFD=42, AWD=43, AWR=44, CCD=45, DLV=46, POD=47,
MSCA=50, FDCA=51, OVCD=52, SSPD=53, DMG=54, DIS=55, RET=56, BUP=57
```

### Arquivo editado

- `supabase/functions/fetch-status-aereo/index.ts`

