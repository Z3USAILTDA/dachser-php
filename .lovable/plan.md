

## Plano: Combinar detecção ARR + segmentos de rota para conexões

### Problema

Linha 1281 faz `return connectionAirports.join(',')` assim que encontra conexões via eventos ARR. No caso do AWB 724-07783392, encontra apenas GRU (via "Arrived at GRU"). O fallback que extrai ZRH de segmentos como `FRA-ZRH`, `ZRH-GRU` nunca executa.

### Correção

**Arquivo:** `supabase/functions/fetch-status-aereo/index.ts` (linhas 1271-1313)

1. **Remover o `return` antecipado** da linha 1281
2. **Sempre executar ambas** as extrações (ARR + segmentos de rota)
3. **Mesclar resultados**: começar com segmentos de rota (preservam ordem cronológica) e adicionar airports do ARR que não estejam já incluídos
4. **Filtrar**: remover origem, destino e stopwords
5. Retornar resultado combinado

```text
Antes:
  ARR loop → [GRU] → return "GRU" (ZRH perdido!)

Depois:
  ARR loop → [GRU]
  Segmentos → [FRA, ZRH, GRU, VCP]
  Mesclar + filtrar origem(FRA)/destino(VCP) → [ZRH, GRU]
  Return "ZRH,GRU" ✓
```

Resultado: rota exibe `FRA → ZRH → GRU → VCP` (4 localidades).

### Arquivo modificado

1. `supabase/functions/fetch-status-aereo/index.ts` — remover early return linha 1281, mesclar ambos métodos de detecção

