

# Plano: Corrigir Mapeamento de Status LeadComex para Timeline CCT

## Problema Identificado

A timeline mostra "Entregue" incorretamente porque:

### Evidência Real (CGN-16367758)
| Campo LeadComex | Valor | Mapeamento Atual |
|-----------------|-------|------------------|
| `situacaoLead` | "Processado" | → ENTREGUE ❌ |
| `situacaoPortal` | "Recepcionada" | → NULL (não existe) |

### Lógica Atual (linha 586)
```typescript
const eventMapping = STATUS_TO_CCT_EVENT[situacaoLead] || STATUS_TO_CCT_EVENT[situacaoPortal];
```

O código prioriza `situacaoLead` ("Processado" → ENTREGUE), ignorando `situacaoPortal` ("Recepcionada") que é o status operacional real.

## Causa Raiz

1. **`situacaoLead`** = Status interno do sistema LeadComex (ex: "Processado" significa que a carga foi processada no sistema, não que foi entregue fisicamente)

2. **`situacaoPortal`** = Status operacional real da carga no portal CCT (ex: "Recepcionada" = carga recebida no terminal)

3. Mapeamento incompleto: "Recepcionada" (feminino) não está mapeado, apenas "Recepcionado"

## Solução

### 1. Inverter prioridade: usar `situacaoPortal` como fonte primária

O status do portal CCT (`situacaoPortal`) reflete a situação operacional real da carga. `situacaoLead` é apenas um indicador interno do sistema.

### 2. Adicionar variantes femininas ao mapeamento

A API retorna tanto "Recepcionado" quanto "Recepcionada" dependendo do contexto.

## Mudanças

### Arquivo: `supabase/functions/leadcomex-sync/index.ts`

**1. Adicionar variantes femininas ao mapeamento (linhas 42-51):**

```typescript
const STATUS_TO_CCT_EVENT: Record<string, { codigo: string; descricao: string }> = {
  'Informado': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Informada': { codigo: 'MANIFESTADO', descricao: 'Conhecimento manifestado no CCT' },
  'Em área de transferência': { codigo: 'AREA_TRANSFERENCIA', descricao: 'Carga em área de transferência' },
  'Chegada informada': { codigo: 'CHEGADA_INFORMADA', descricao: 'Chegada da carga informada ao terminal' },
  'Recepcionado': { codigo: 'RECEPCIONADO', descricao: 'Carga recepcionada no terminal' },
  'Recepcionada': { codigo: 'RECEPCIONADO', descricao: 'Carga recepcionada no terminal' }, // ADICIONAR
  'Em trânsito terrestre': { codigo: 'EM_TRANSITO', descricao: 'Carga em trânsito terrestre' },
  'Entregue': { codigo: 'ENTREGUE', descricao: 'Carga entregue ao destinatário' },
  // Remover 'Processado' → não é status de entrega física
};
```

**2. Inverter prioridade do mapeamento (linha 586):**

```typescript
// Priorizar situacaoPortal (status operacional real) sobre situacaoLead (status interno)
const eventMapping = STATUS_TO_CCT_EVENT[situacaoPortal] || STATUS_TO_CCT_EVENT[situacaoLead];
```

**3. Adicionar log para debug:**

```typescript
console.log(`[LEADCOMEX] Status para ${hawb}: Lead="${situacaoLead}", Portal="${situacaoPortal}" → ${eventMapping?.codigo || 'SEM_MAPEAMENTO'}`);
```

## Fluxo Corrigido

### Exemplo CGN-16367758:
```text
ANTES:
  situacaoLead="Processado" → ENTREGUE (prioridade 1)
  situacaoPortal="Recepcionada" → ignorado

DEPOIS:
  situacaoPortal="Recepcionada" → RECEPCIONADO (prioridade 1)
  situacaoLead="Processado" → ignorado (não está mais no mapeamento)
```

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/leadcomex-sync/index.ts` | Adicionar "Recepcionada" ao mapeamento, remover "Processado", inverter prioridade situacaoPortal/situacaoLead |

## Validação

1. Executar `refresh-all-active` na página de Logs LeadComex
2. Verificar nos logs a mensagem: `Status para XXX: Lead="Processado", Portal="Recepcionada" → RECEPCIONADO`
3. Abrir processo CGN-16367758 e confirmar que timeline mostra "Recepcionado" (não "Entregue")

