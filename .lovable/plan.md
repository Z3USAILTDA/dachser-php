
## Adicionar Indicador Visual do Status LeadComex na Tabela do CCT

### Contexto Atual
- A tabela de processos (`ProcessosTable.tsx`) mostra 10 colunas: Cliente, House, Master, Rota, Manifestação, Status, SLA, Analista e Atualização
- Cada processo tem um `leadcomex_status` que pode ser: `'pending'`, `'success'` ou `'failed'`
- Quando um HAWB não é encontrado na LeadComex, o status é `'failed'`, mas isso não é visível na interface

### Problema
- HAWBs com falha na sincronização LeadComex não têm indicação visual
- Usuários não conseguem diferenciar visualmente quais processos foram consultados vs não encontrados

### Solução Proposta (2 Mudanças)

#### 1. **Adicionar Coluna "LeadComex" na Tabela** (`ProcessosTable.tsx`)
Entre a coluna "Analista" e "Atualização", inserir uma nova coluna que mostre:

**Para `leadcomex_status = 'success'`:**
- Badge verde com ✓ e texto "Consultado"
- Indica que o HAWB foi encontrado e enriquecido na LeadComex

**Para `leadcomex_status = 'failed'`:**
- Badge vermelho com ✗ e texto "Não encontrado"
- Indica que o HAWB foi tentado mas não existe na LeadComex

**Para `leadcomex_status = 'pending'`:**
- Badge cinza com ⏳ e texto "Aguardando..."
- Indica que ainda não foi tentado ou está sendo processado

**Exemplo visual:**
```
| Cliente | House | Master | Rota | Manifestação | Status | SLA | Analista | LeadComex | Atualização | Ações |
|---------|-------|--------|------|--------------|--------|-----|----------|-----------|-------------|-------|
|  DACHSER| GOT-123| MAD-456|GRU→MAD| Manifestada | OK | 5h | João    | ✓ Consultado | 10:30 | Ver |
|  XYZ    | ORD-789| ORD-999|ORD→GRU| Informada | ALERTA | 2h | Maria   | ✗ Não encontrado | 09:15 | Ver |
|  ABC    | MAD-234| MAD-567|MAD→GRU| Recepcionada | OK | 8h | Carlos  | ⏳ Aguardando... | 11:00 | Ver |
```

#### 2. **Criar Badge Component para LeadComex** (`src/components/cct/LeadComexStatusBadge.tsx`)
Novo componente reutilizável:
```typescript
interface LeadComexStatusBadgeProps {
  status: 'success' | 'failed' | 'pending';
  attempts?: number | null;
}

export function LeadComexStatusBadge({ status, attempts }: LeadComexStatusBadgeProps) {
  // success: verde com ✓ "Consultado"
  // failed: vermelho com ✗ "Não encontrado" (com contador de tentativas se > 0)
  // pending: cinza com ⏳ "Aguardando..."
}
```

O componente mostrará opcionalmente o número de tentativas quando `status = 'failed'` (ex: "Não encontrado (2 tentativas)")

### Mudanças de Arquivo

| Arquivo | Mudança |
|---------|---------|
| `src/components/cct/ProcessosTable.tsx` | Adicionar coluna "LeadComex" (linhas ~138-140) com import do novo badge |
| `src/components/cct/LeadComexStatusBadge.tsx` | **Criar novo arquivo** com componente de status LeadComex |

### Resultado
Usuários podem agora:
- Ver rapidamente quais processos foram consultados na LeadComex (verde)
- Identificar quais não foram encontrados (vermelho)
- Saber quais ainda estão aguardando sincronização (cinza)
- Visualizar quantas tentativas foram feitas para HAWBs não encontrados

