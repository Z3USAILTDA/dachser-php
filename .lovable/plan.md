

## Plano: Destacar origem para processos pré-embarque com conexão

### Problema
Processos que ainda estão na origem (status como `BKD`, `PRE`, `MAN`, `DOC`, `RCS`, `FOH`, `RDP`) estão com a **conexão** destacada em amarelo, quando deveriam ter a **origem** destacada — o cargo ainda não saiu.

### Solução
Adicionar uma lista de statuses pré-embarque (`PRE_DEPARTURE`) e verificar **antes** da lógica de conexão. Se o status for pré-embarque, sempre destaca a origem — sem alterar a lógica existente para os demais cenários.

### Mudança em `src/pages/Index.tsx` (~linha 2751)

```typescript
const PRE_DEPARTURE = ['BKD','PRE','MAN','DOC','RCS','RDP','RCT','LAT','TKG','SCR','ECC'];

if (conexoes.length > 0) {
  if (POST_DESTINO.includes(statusCode)) {
    highlightDestino = true;
  } else if (PRE_DEPARTURE.includes(statusCode)) {
    // Cargo ainda na origem — não destacar conexão
    highlightOrigin = true;
  } else if (AT_CONEXAO.includes(statusCode) || statusCode === 'DEP') {
    highlightConexaoIndex = conexoes.length - 1;
  } else if (IN_TRANSIT_AT_CONNECTION.includes(statusCode)) {
    highlightConexaoIndex = conexoes.length - 1;
  } else {
    highlightOrigin = true;
  }
}
```

### Resultado
- `BKD`, `PRE`, `MAN`, etc. com conexão → **origem** amarela ✓
- `DEP` com conexão → **conexão** amarela (mantém comportamento atual) ✓
- `ARR - CONEXÃO` → **conexão** amarela (sem mudança) ✓
- `ARR`, `RCF`, `NFD`, etc. → **destino** amarelo (sem mudança) ✓

### Arquivo modificado
1. `src/pages/Index.tsx` — adicionar checagem `PRE_DEPARTURE` antes da lógica de conexão

