

# Corrigir AWB 016-05474254 sumindo da tela

## Problema

O AWB 016-05474254 desapareceu porque o fluxo atual faz o seguinte:

1. O `last_status_code` no banco e "RCF"
2. `classifyArrival("RCF")` retorna "RCF" (so processa status "ARR")
3. O `crossCheck` encontra "DELIVERED" na timeline e sobrescreve para "DLV"
4. O novo filtro de visibilidade remove todos os DLV -- o AWB some

O usuario espera ver "ARR - CONEXAO" porque a carga chegou em um ponto de conexao.

## Causa Raiz

O `resolveUnkFromTimeline` retorna o evento **mais recente** da timeline (ordenado por data DESC). Se o evento mais recente for "DELIVERED", ele sobrescreve qualquer status anterior. Mas para AWBs com conexao, o evento de ARR no ponto intermediario e o que importa operacionalmente.

## Solucao

Adicionar uma verificacao **antes** de aceitar DLV como status final: se a timeline contem um evento ARR que classifica como `ARR - CONEXAO` ou `ARR - DESTINO`, esse status tem precedencia sobre DLV. Isso garante:

- AWBs em conexao mostram "ARR - CONEXAO" (barra laranja)
- AWBs que chegaram no destino mostram "ARR - DESTINO" (retido 5 dias)
- DLV so e aplicado quando nao ha evidencia de conexao/destino pendente

## Detalhes Tecnicos

**Arquivo**: `supabase/functions/fetch-status-aereo/index.ts`

### Mudanca 1: Proteger contra override DLV quando ha ARR classificavel

No bloco do crossCheck (linhas 581-587), apos determinar `timelineStatus`, verificar se aceitar DLV faria perder uma classificacao ARR - CONEXAO/DESTINO:

```typescript
} else if (finalStatus && finalStatus.toUpperCase() !== 'UNK') {
  const timelineStatus = resolveUnkFromTimeline(timelineStr, awb);
  if (timelineStatus && timelineStatus !== finalStatus && isMoreSpecific(finalStatus, timelineStatus)) {
    // Se crossCheck quer aplicar DLV, verificar se existe ARR classificavel
    if (timelineStatus === 'DLV') {
      const arrCheck = classifyArrival('ARR', timelineStr, destForClassify, origForClassify, awb);
      if (arrCheck && arrCheck !== 'ARR') {
        // Ha ARR - CONEXAO ou ARR - DESTINO na timeline, preferir esse status
        console.log(`[crossCheck] ${awb}: DLV blocked, using ${arrCheck} instead`);
        finalStatus = arrCheck;
      } else {
        finalStatus = timelineStatus; // aceitar DLV normalmente
      }
    } else {
      console.log(`[crossCheck] ${awb}: last_status="${finalStatus}" vs timeline="${timelineStatus}" -> prefer timeline`);
      finalStatus = timelineStatus;
    }
  }
}
```

### Mudanca 2: Mesma protecao no bloco UNK (linhas 588-594)

Aplicar a mesma logica quando `resolveUNK` retorna DLV para um AWB que tem ARR classificavel na timeline.

### Resultado esperado

- AWB 016-05474254: em vez de DLV (removido), mostrara "ARR - CONEXAO" (visivel)
- AWBs que realmente sao DLV sem evento ARR intermediario continuam sendo filtrados
- AWBs com ARR - DESTINO continuam retidos por 5 dias antes de sumir

Apos a mudanca, redeploy da edge function `fetch-status-aereo`.
