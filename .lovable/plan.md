

## Filtrar CCT: mostrar apenas HAWBs que existem na `t_dados_aereo`

### Alteração

No `supabase/functions/mariadb-proxy/index.ts`, no bloco MERGE (linha ~3599), adicionar uma condição para pular HAWBs que não foram encontrados no `dadosAereoMap`.

### Código atual (linha 3599)
```typescript
for (const [hawbKey, apiInfo] of hawbApiMap) {
  const aereoInfo = dadosAereoMap.get(hawbKey) || {};
```

### Código novo
```typescript
for (const [hawbKey, apiInfo] of hawbApiMap) {
  const aereoInfo = dadosAereoMap.get(hawbKey);
  if (!aereoInfo) continue; // Skip HAWBs not found in t_dados_aereo
```

Isso garante que apenas HAWBs presentes em ambas as tabelas (`t_cct_hawb_api_atual` **E** `t_dados_aereo`) apareçam na tela.

**1 arquivo alterado, 2 linhas modificadas:** `supabase/functions/mariadb-proxy/index.ts`

