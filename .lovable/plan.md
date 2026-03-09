

# Fix: Documentos não aparecem no dialog de visualização

## Causa raiz

O edge function `get_voucher_anexos` retorna a estrutura:
```json
{ "success": true, "data": [ ...anexos... ] }
```

Mas o frontend está lendo `data?.anexos` (linha 862), que é `undefined`. O campo correto é `data?.data`.

## Correção

### `src/components/esteira/PagamentosTab.tsx` — linha 862

Trocar:
```typescript
setAnexosDialog(data?.anexos || []);
```
Por:
```typescript
setAnexosDialog(data?.data || []);
```

Uma única linha corrige o problema.

