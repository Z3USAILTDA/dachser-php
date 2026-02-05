
# Plano: Corrigir Enriquecimento de MBLs com Containers Conhecidos

## Problema Identificado

O MBL `COSU6438949960` está marcado como `NAO_ENCONTRADO` apesar de possuir dois containers válidos:
- `CSNU7842551` - **API funciona** (testado com sucesso)
- `FCIU9701300` - **API não encontra** (container de leasing Florens)

### Causa Raiz
A função `enrich_sea_containers` usa o endpoint `/containers/bol/{MBL}` para buscar containers associados a um MBL. Porém:
1. A API JsonCargo pode não ter indexado a relação MBL → Containers ainda
2. Containers de leasing (FCIU = Florens) podem não ter tracking disponível

### Evidências dos Testes
| Teste | Resultado |
|-------|-----------|
| `jc_container CSNU7842551` | OK - Container COSCO com tracking |
| `jc_container FCIU9701300` | ERRO 404 - "does not exist for EVERGREEN" |
| `t_tracking_sea COSU6438949960` | Status: `NAO_ENCONTRADO` |

---

## Solução Proposta

### 1. Criar Action para Inserção Manual de Containers

Adicionar nova action `manual_add_containers` no `olimpo-proxy` que permite inserir containers manualmente para um MBL:

```typescript
if (action === 'manual_add_containers') {
  const mbl_id = body.mbl_id;
  const containers = body.containers; // Array de containers
  
  // Validar formato dos containers
  // Remover registro NAO_ENCONTRADO
  // Inserir cada container
}
```

### 2. Corrigir o MBL `COSU6438949960`

Executar a nova action para adicionar os containers conhecidos:
```json
{
  "mbl_id": "COSU6438949960",
  "containers": ["CSNU7842551", "FCIU9701300"]
}
```

### 3. Disparar Refresh para Obter Tracking

Após inserir os containers, disparar `refresh_sea_tracking` para buscar os dados de tracking do container `CSNU7842551` (o FCIU não terá tracking pois é leasing).

---

## Alterações Técnicas

### Arquivo: `supabase/functions/olimpo-proxy/index.ts`

Adicionar nova action (~30 linhas):

```typescript
// ===== SEA TRACKING: Manually add containers to an MBL =====
if (action === 'manual_add_containers') {
  const body = await req.json();
  const { mbl_id, containers, shipping_line } = body;
  
  if (!mbl_id || !containers?.length) {
    return new Response(JSON.stringify({ error: 'mbl_id e containers obrigatórios' }), ...);
  }
  
  // Conectar ao MariaDB
  // Remover registro NAO_ENCONTRADO/PENDENTE
  // Inserir containers válidos
  // Retornar resultado
}
```

---

## Resultado Esperado

1. Action `manual_add_containers` disponível para casos onde a API não encontra containers
2. MBL `COSU6438949960` terá os containers `CSNU7842551` e `FCIU9701300` cadastrados
3. Container `CSNU7842551` receberá tracking automático
4. Container `FCIU9701300` permanecerá sem tracking (leasing não suportado)

---

## Para o Segundo MBL: `MEDUW2530287`

O mesmo procedimento será aplicado após você informar quais containers pertencem a ele.
