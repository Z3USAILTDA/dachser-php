

# Correção do Status "ARR - Destino" no Tooltip

## Problema Identificado

O AWB **176-21540853** está salvo corretamente no banco com o status **"ARR - Destino"**, porém o tooltip está mostrando **"Chegou na conexão"** ao invés de **"Chegou em seu destino final"**.

**Causa raiz:** A função `getStatusFromEvent()` na linha 1651-1683 de `src/pages/Index.tsx` não diferencia entre "ARR - Destino" e "ARR - Conexão". Ela extrai apenas os 3 primeiros caracteres do status ("ARR") e sempre mapeia para "Chegou na conexão".

## Solução

Atualizar a função `getStatusFromEvent()` para reconhecer os sufixos de status ARR antes de fazer o mapeamento genérico.

---

## Detalhes Técnicos

### Arquivo a Modificar
- `src/pages/Index.tsx`

### Mudança na Função `getStatusFromEvent()`

**Antes (linhas 1651-1670):**
```typescript
const getStatusFromEvent = (lastEvent: string): string => {
  if (!lastEvent) return "-";
  const eventLower = lastEvent.toLowerCase();
  const codeMatch = lastEvent.match(/^\(?([A-Z]{3})\)?/);
  if (codeMatch) {
    const code = codeMatch[1];
    const statusMap: Record<string, string> = {
      BKD: "Reserva confirmada",
      ...
      ARR: "Chegou na conexão",  // <- sempre mostra conexão
      ...
    };
    return statusMap[code] || "-";
  }
  ...
};
```

**Depois:**
```typescript
const getStatusFromEvent = (lastEvent: string): string => {
  if (!lastEvent) return "-";
  
  // NOVA LÓGICA: Verificar sufixos ARR primeiro
  const upperEvent = lastEvent.toUpperCase().trim();
  if (upperEvent === "ARR - DESTINO") {
    return "Chegou em seu destino final";
  }
  if (upperEvent === "ARR - CONEXÃO") {
    return "Chegou na conexão";
  }
  
  // Lógica existente continua...
  const eventLower = lastEvent.toLowerCase();
  const codeMatch = lastEvent.match(/^\(?([A-Z]{3})\)?/);
  if (codeMatch) {
    const code = codeMatch[1];
    const statusMap: Record<string, string> = {
      BKD: "Reserva confirmada",
      ...
      ARR: "Chegou na conexão",  // fallback para ARR sem sufixo
      ...
    };
    return statusMap[code] || "-";
  }
  ...
};
```

---

## Resultado Esperado

| Status no Banco | Código Exibido | Descrição no Tooltip |
|-----------------|----------------|----------------------|
| ARR - Destino | ARR - DESTINO | Chegou em seu destino final |
| ARR - Conexão | ARR - CONEXÃO | Chegou na conexão |
| ARR (sem sufixo) | ARR | Chegou na conexão |

O AWB 176-21540853 passará a mostrar corretamente **"Chegou em seu destino final"** no tooltip.

