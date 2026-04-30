## Problema

Na coluna **Rota** da lista de tracking aéreo, o destaque dourado (`#ffc800`) está marcando o segmento errado em vários casos:

- AWB com conexão e status `RCF` ilumina a origem em vez da conexão.
- AWB com 2+ conexões e status `DEP`/`ARR - CONEXÃO` sempre ilumina a **última** conexão, ignorando em qual conexão a carga realmente está.
- AWB com status `ARR` (sem sufixo `- DESTINO`/`- CONEXÃO`) sempre cai no destino, mesmo quando o evento foi numa conexão.
- Fallback final manda qualquer status desconhecido para a origem.

## Causa

A lógica em `src/pages/air/TrackingAereo.tsx` (linhas 811–827) decide o highlight **apenas pelo código de status** (`statusCode`), ignorando o campo `last_event_location` (IATA do último evento) que já é retornado pela Edge Function. Por isso, em qualquer rota com conexões, o destaque "chuta" um segmento fixo em vez de seguir a localização real.

## Solução

Edição cirúrgica **somente no front-end**, sem mexer nas Edge Functions (a Edge já entrega `last_event_location` e a lista correta de conexões).

### Mudança em `src/pages/air/TrackingAereo.tsx` (linhas 811–827)

Nova ordem de decisão para `highlightOrigin` / `highlightConexaoIndex` / `highlightDestino`:

1. **Status final no destino sempre vence**: `DLV`, `POD`, `ARR - DESTINO` → ilumina destino. (mantém comportamento atual)
2. **Status pré-embarque sempre vence**: `BKD, PRE, MAN, DOC, RCS, RDP, RCT, LAT, TKG, SCR, ECC, FOH` → ilumina origem. (mantém)
3. **Caso geral — usa `last_event_location` (IATA real do evento):**
   - Extrai o IATA do `last_event_location` (mesma regex de extração já usada no app).
   - Compara contra: IATA da origem, IATAs de cada conexão (na ordem), IATA do destino.
   - Acertou em uma conexão → `highlightConexaoIndex = índiceDaConexão`.
   - Acertou no destino → `highlightDestino = true`.
   - Acertou na origem → `highlightOrigin = true`.
4. **Fallback inteligente quando `last_event_location` não casa com nenhum aeroporto da rota** (caso raro: localização vazia ou IATA fora da rota cadastrada):
   - `ARR - CONEXÃO` → última conexão (comportamento de hoje, mas só como fallback).
   - `DEP` → se há conexões, primeira conexão (próximo destino esperado); caso contrário, destino.
   - `RCF` → última conexão se existir; caso contrário, destino.
   - `ARR` puro → destino.
   - Outros status desconhecidos no meio do trajeto → origem.

Resumo: **`last_event_location` é a fonte de verdade primária**; o código de status só decide quando a localização não consegue ser mapeada para nenhum aeroporto da rota.

### Atualizar memória

Atualizar `mem://air/tracking/route-logic-and-highlighting` para refletir a nova prioridade:
1. Pré-embarque e final no destino dominam por status.
2. Demais casos: usar `last_event_location` para mapear ao segmento exato.
3. Fallback por status apenas quando o IATA não casa com a rota.

## Estimativa

```text
Arquivos editados: 2
- src/pages/air/TrackingAereo.tsx                 (~25 linhas no bloco 811–827)
- mem://air/tracking/route-logic-and-highlighting (rewrite curto)

Risco: baixo — só muda visualização; não altera dados, queries ou Edge Functions.
Sem mudança no schema do retorno (`conexao`, `last_event_location` já existem).
```

## Validação

Após implementar, conferir visualmente:
- AWB direto (sem conexão) com `ARR` → destino aceso. ✅
- AWB com conexão e `RCF GRU` quando GRU é origem → origem acesa.
- AWB com conexão e `RCF MAD` quando MAD é a 1ª conexão → 1ª conexão acesa.
- AWB com 2 conexões e `DEP FRA` (FRA = 2ª conexão) → 2ª conexão acesa, não a última genérica.
- AWB pré-embarque (`BKD`, `MAN`) → origem acesa independente de location.

Se desejar, após o deploy posso pedir 1–2 AWBs específicos para validação fina.
