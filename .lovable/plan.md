

## Plano: Exibir motivo do bloqueio corretamente na timeline CCT

### Problema
Os bloqueios da API LeadComex/RFB retornam campos como `motivoBloqueio`, `justificativaBloqueio`, `tipoBloqueio`, `alcanceBloqueio`, mas o código do `leadcomex-sync` (linha 643) tenta ler `bloqueio.codigo` e `bloqueio.descricao` — campos que não existem no JSON real. Resultado: os eventos de bloqueio na timeline aparecem como "Bloqueio N/A: Motivo não informado".

### Alterações

#### 1. `supabase/functions/leadcomex-sync/index.ts`

**a) Atualizar o tipo** (linhas 118-122 e 151-155) para incluir os campos reais da API:
```typescript
bloqueiosAtivos?: Array<{
  codigo?: string;
  descricao?: string;
  codigoBloqueio?: string;
  descricaoBloqueio?: string;
  motivoBloqueio?: string;
  justificativaBloqueio?: string;
  tipoBloqueio?: string;
  alcanceBloqueio?: string;
  responsavelBloqueio?: string | null;
  dataHoraBloqueio?: string;
}>;
```

**b) Corrigir a construção do `descricao_evento`** (linha 643) para usar os campos corretos com fallback chain:
```typescript
descricao_evento: [
  bloqueio.motivoBloqueio || bloqueio.descricao || bloqueio.descricaoBloqueio || 'Motivo não informado',
  bloqueio.justificativaBloqueio ? `Justificativa: ${bloqueio.justificativaBloqueio}` : null,
  bloqueio.tipoBloqueio ? `Tipo: ${bloqueio.tipoBloqueio}` : null,
  bloqueio.alcanceBloqueio ? `Alcance: ${bloqueio.alcanceBloqueio}` : null,
].filter(Boolean).join(' | '),
```

Isso produzirá descrições como:
> "Manifestação fora do prazo, após a chegada da viagem | Justificativa: Bloqueio automático - arquivo de associações master/house enviado em atraso | Tipo: Impede vinculação a documento de saída DI, DSI eletrônica e/ou DTA | Alcance: Total"

**c) Mesma correção para desbloqueios** (linhas 660-680).

#### 2. `src/components/cct/EventTimeline.tsx`

Melhorar a exibição de eventos de BLOQUEIO para quebrar a descrição longa em linhas estruturadas (split por `|`), com destaque visual para cada campo (motivo, justificativa, tipo, alcance).

### Impacto
- Novos bloqueios sincronizados pelo cron terão descrições completas e legíveis na timeline.
- Bloqueios já existentes na `t_cct_eventos_historico` permanecerão com "N/A" — só serão corrigidos quando o cron reconsultar o HAWB e inserir novos eventos (o que agora acontece continuamente, sem cooldown).

