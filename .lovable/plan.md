

# Plano: Esvaziar Dados das Telas AWB Tracking e CCT (Mantendo Visual)

## Objetivo

1. **Tela de Rastreio AWBs (`/air/tracking`)**: Remover a importação de dados do `t_status_aereo`, deixando a tabela vazia
2. **Tela CCT (`/air/cct`)**: Manter toda a estrutura visual (métricas, tabs, tabela), mas sem dados (tudo zerado/vazio)

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/Index.tsx` | Modificar `fetchStatusAereoData` para retornar array vazio |
| `src/hooks/useCCTData.ts` | Modificar `useProcessosCCT`, `useExcecoes` e `useProfiles` para retornar arrays vazios |

---

## 1. Tela de Rastreio AWBs (`src/pages/Index.tsx`)

### Alteração na função `fetchStatusAereoData` (linhas 492-561)

**De:**
```typescript
const fetchStatusAereoData = React.useCallback(async () => {
  setIsLoadingStatusAereo(true);
  try {
    const { data, error } = await supabase.functions.invoke("fetch-status-aereo", {
      body: { search: "" },
    });
    // ... processamento de dados ...
    setStatusAereoData(deduplicatedData);
  } catch (error) {
    // ...
  } finally {
    setIsLoadingStatusAereo(false);
  }
}, []);
```

**Para:**
```typescript
const fetchStatusAereoData = React.useCallback(async () => {
  // Temporariamente desativado - não buscar dados do t_status_aereo
  setIsLoadingStatusAereo(false);
  setStatusAereoData([]);
}, []);
```

---

## 2. Tela CCT (`src/hooks/useCCTData.ts`)

### 2.1 Hook `useProcessosCCT` (linhas 187-214)

**De:**
```typescript
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_shipments' }
      });
      // ... processamento ...
      return processos;
    },
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
```

**Para:**
```typescript
export function useProcessosCCT() {
  return useQuery({
    queryKey: ["cct-processos"],
    queryFn: async (): Promise<ProcessoCCT[]> => {
      // Temporariamente desativado - retornar array vazio
      console.log("CCT: Dados temporariamente desativados");
      return [];
    },
    staleTime: 30000,
    refetchInterval: false, // Desabilitar refetch automático
  });
}
```

### 2.2 Hook `useExcecoes` (linhas 294-311)

Não precisa alterar - já depende de `useProcessosCCT` e retornará vazio automaticamente.

### 2.3 Hook `useProfiles` (linhas 398-414)

**De:**
```typescript
export function useProfiles() {
  return useQuery({
    queryKey: ["cct-profiles"],
    queryFn: async (): Promise<CCTProfile[]> => {
      const { data, error } = await supabase.functions.invoke('mariadb-proxy', {
        body: { action: 'get_cct_profiles' }
      });
      // ...
      return data.data || [];
    },
  });
}
```

**Para:**
```typescript
export function useProfiles() {
  return useQuery({
    queryKey: ["cct-profiles"],
    queryFn: async (): Promise<CCTProfile[]> => {
      // Temporariamente desativado
      return [];
    },
  });
}
```

---

## Resultado Visual Esperado

### Tela AWB Tracking (`/air/tracking`)
- Header, navegação e filtros funcionando normalmente
- Tabela vazia (sem registros de AWBs)
- Mensagem "Nenhum dado encontrado" ou similar

### Tela CCT (`/air/cct`)
- Background com imagem e gradiente mantido
- Header com botões de ação mantido
- Métricas exibindo zeros:
  - Total Monitorados: 0
  - Em Alerta: 0
  - Críticos: 0
  - Eventos 24h: 0
- Tabs de navegação funcionando (Dashboard, Analytics, Exceções, Regras, Console)
- Tabela de processos vazia
- Estrutura visual 100% preservada

---

## Detalhes Técnicos

| Componente | Comportamento com Dados Vazios |
|-----------|-------------------------------|
| `MetricCard` | Exibe valor 0 |
| `ProcessosTable` | Exibe estado vazio (sem linhas) |
| `AnalyticsTab` | Gráficos vazios |
| `ExcecoesTab` | Lista vazia de exceções |
| Botão "Atualizar" | Funciona mas retorna dados vazios |

