

## Plano: Desabilitar conexão com banco na tela /air/tracking-aereo

### Alteração

**Arquivo: `src/pages/air/TrackingAereo.tsx`** — função `fetchData` (linhas 328-437)

Comentar o corpo da função `fetchData` para que a tela fique sem dados, sem alterar o SQL da edge function:

```typescript
const fetchData = useCallback(async () => {
  // TEMPORARIAMENTE DESABILITADO - conexão com banco comentada
  // setIsLoadingData(true);
  // try {
  //   const { data, error } = await supabase.functions.invoke("fetch-tracking-aereo");
  //   ... todo o corpo ...
  // } finally {
  //   setIsLoadingData(false);
  // }
  setAwbsData([]);
}, []);
```

A tela renderiza normalmente mas com lista vazia. Nenhum outro arquivo alterado.

