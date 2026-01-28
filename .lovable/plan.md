

# Plano: Adicionar Eventos de Desbloqueio na Timeline CCT

## Situacao Atual

A API LeadComex retorna dois arrays relacionados a bloqueios:

| Campo | Uso Atual | Estrutura |
|-------|-----------|-----------|
| `bloqueiosAtivos[]` | Inserido na timeline como evento `BLOQUEIO` | `codigo`, `descricao`, `dataHoraBloqueio` |
| `bloqueiosBaixados[]` | **Salvo em JSON, mas NAO inserido na timeline** | `codigo`, `descricao`, `dataHoraDesbloqueio` |

O codigo atual processa apenas bloqueios ativos (linhas 602-632 do leadcomex-sync), ignorando os desbloqueios.

## Solucao

Adicionar loop para processar `bloqueiosBaixados[]` e inserir eventos de desbloqueio na timeline.

## Mudancas

### Arquivo: `supabase/functions/leadcomex-sync/index.ts`

**Localizacao:** Apos o bloco de processamento de `bloqueiosAtivos` (linha ~632)

**Codigo a adicionar:**
```typescript
// Registrar cada DESBLOQUEIO como evento na timeline
if (detalhe?.bloqueiosBaixados && detalhe.bloqueiosBaixados.length > 0) {
  console.log(`[LEADCOMEX] ${detalhe.bloqueiosBaixados.length} desbloqueios para ${hawb}`);
  
  for (const desbloqueio of detalhe.bloqueiosBaixados) {
    if (supabaseUrl && supabaseKey) {
      try {
        await fetch(`${supabaseUrl}/functions/v1/mariadb-proxy`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'insert_cct_event',
            awb: hawb,
            codigo_evento: 'DESBLOQUEIO',
            descricao_evento: `Desbloqueio ${desbloqueio.codigo}: ${desbloqueio.descricao}`,
            data_hora_evento: parseBrazilianDate(desbloqueio.dataHoraDesbloqueio) || new Date().toISOString(),
            fonte: 'LEADCOMEX',
            nivel_confianca: 'PRIMARIA',
          }),
        });
      } catch (e) {
        console.warn(`[LEADCOMEX] Erro ao inserir desbloqueio na timeline:`, e);
      }
    }
  }
}
```

### Arquivo: `src/components/cct/EventTimeline.tsx`

**Adicionar icone e cor para DESBLOQUEIO:**

1. **Importar icone** (linha 3-16):
```typescript
import { Unlock } from "lucide-react"; // Adicionar
```

2. **getEventIcon** - Adicionar caso para DESBLOQUEIO (apos linha 82):
```typescript
// Desbloqueio - carga liberada
if (upperCode === 'DESBLOQUEIO') {
  return Unlock;
}
```

3. **getEventColor** - Adicionar cor verde para DESBLOQUEIO (apos linha 107):
```typescript
// Verde para Desbloqueios (carga liberada)
if (upperCode === 'DESBLOQUEIO') {
  return {
    dot: "border-emerald-500 bg-emerald-500",
    icon: "text-emerald-400",
    card: "border-emerald-500/30 bg-emerald-500/5"
  };
}
```

## Visualizacao na Timeline

Apos implementacao, a timeline exibira:

```text
Timeline do Processo:
[Verde] DESBLOQUEIO - Desbloqueio NFD: Carga liberada para retirada
         27/01/2026 15:30 | LeadComex
         
[Vermelho] BLOQUEIO - Bloqueio NFD: Aguardando documentacao
           26/01/2026 10:15 | LeadComex
```

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/leadcomex-sync/index.ts` | Adicionar loop para processar `bloqueiosBaixados[]` (apos linha 632) |
| `src/components/cct/EventTimeline.tsx` | Adicionar icone `Unlock` e cor verde para evento `DESBLOQUEIO` |

## Validacao

1. Executar `refresh-all-active` para reprocessar HAWBs
2. Verificar nos logs se desbloqueios foram detectados
3. Abrir processo CCT que teve bloqueio e verificar se desbloqueio aparece na timeline
4. Confirmar que desbloqueio aparece em verde com icone de cadeado aberto

