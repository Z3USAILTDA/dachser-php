
# Plano: Adicionar t_master_dados como Fonte Secundária + Filtrar Prefixos Não Mapeados

## Objetivo

1. **Manter `t_sea_master` como fonte principal** (comportamento atual)
2. **Adicionar `t_master_dados` como fonte secundária** para processos SEA recentes
3. **Filtrar no frontend** todos os MBLs com prefixos não mapeados
4. **Atualizar modal de Armadores** para refletir apenas dados filtrados

---

## Arquitetura de Dados

```text
┌─────────────────────────────────────────────────────────────────┐
│                      FONTES DE DADOS                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐     ┌─────────────────────────────────┐   │
│  │  t_sea_master   │     │       t_master_dados            │   │
│  │  (principal)    │     │       (secundária)              │   │
│  │                 │     │                                 │   │
│  │  master = MBL   │     │  mawb = MBL                     │   │
│  │  eta_ata = ETA  │     │  eta = ETA                      │   │
│  │  (sem filtro)   │     │  tipo_processo: SEA IMPORT/EXP  │   │
│  │                 │     │  data_insert >= 04/02/2026      │   │
│  └────────┬────────┘     └─────────────┬───────────────────┘   │
│           │                            │                        │
│           └──────────┬─────────────────┘                        │
│                      │                                          │
│           ┌──────────▼──────────┐                               │
│           │   t_tracking_sea    │                               │
│           │  (dados de tracking)│                               │
│           └──────────┬──────────┘                               │
│                      │                                          │
│           ┌──────────▼──────────┐                               │
│           │ get_sea_tracking    │                               │
│           │ (query combinada)   │                               │
│           └──────────┬──────────┘                               │
└──────────────────────┼──────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────┐
│                       FRONTEND                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Filtro de Prefixos (useMemo)               │    │
│  │                                                         │    │
│  │  MANTER:                      EXCLUIR:                  │    │
│  │  ✓ Armadores mapeados         ✗ Numéricos puros        │    │
│  │  ✓ LCLs cadastrados           ✗ Formato rota XXX/YYY   │    │
│  │    (tipo_carga='LCL')         ✗ Prefixos internos      │    │
│  │                               ✗ Prefixos LCL estáticos │    │
│  │                               ✗ Padrão SS*             │    │
│  │                               ✗ Prefixos desconhecidos │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│         Dashboard        Tabela          Modal                  │
│           Stats          MBLs          Armadores                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Alterações Técnicas

### 1. Backend: `olimpo-proxy` - action `get_sea_tracking`

**Arquivo**: `supabase/functions/olimpo-proxy/index.ts`

**Modificação**: Adicionar CTE para `t_master_dados` e combinar com a query existente via LEFT JOIN

```sql
-- CTE ADICIONAL: Dados de t_master_dados para processos SEA recentes
master_dados_new AS (
  SELECT 
    TRIM(mawb) as mbl_id,
    MAX(tipo_processo) as tipo_processo,
    MAX(eta) as eta,
    MAX(nome_analista) as nome_analista
  FROM dados_dachser.t_master_dados
  WHERE mawb IS NOT NULL
    AND TRIM(mawb) != ''
    AND tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')
    AND data_insert >= '2026-02-04 09:55:11'
  GROUP BY TRIM(mawb)
)
```

**Modificação na query principal**: Usar COALESCE para priorizar t_sea_master mas buscar fallback de t_master_dados

```sql
-- Na CTE master_data existente, adicionar LEFT JOIN com master_dados_new
-- Prioridade: t_sea_master > t_master_dados
COALESCE(md.eta, mdn.eta) as eta,
COALESCE(md.nome_analista, mdn.nome_analista) as nome_analista
```

---

### 2. Frontend: Filtro de Prefixos Não Mapeados

**Arquivo**: `src/pages/ContainerTracking.tsx`

**Novo useMemo**: Criar `filteredMblListByCarrier` após receber os dados

```typescript
// Filtrar MBLs com prefixos não mapeados (LCLs não cadastrados)
const filteredMblListByCarrier = useMemo(() => {
  return mblList.filter(m => {
    const mblId = (m.mbl_id || '').toUpperCase().trim();
    if (!mblId) return false;
    
    // 1. LCL cadastrado explicitamente: MANTER
    if (m.tipo_carga === 'LCL') return true;
    
    // 2. Armador mapeado (13 carriers): MANTER
    const carrier = detectCarrierFromMbl(mblId);
    if (carrier.code !== 'UNKNOWN') return true;
    
    // 3. MBL numérico puro: EXCLUIR
    if (/^\d+$/.test(mblId)) return false;
    
    // 4. Formato rota XXX/YYY: EXCLUIR
    if (/^[A-Z]{2,4}\/[A-Z]{2,4}/.test(mblId)) return false;
    
    // 5. Prefixo interno DACHSER: EXCLUIR
    if (INTERNAL_PREFIXES.some(p => mblId.startsWith(p))) return false;
    
    // 6. Prefixo LCL estático conhecido: EXCLUIR
    if (LCL_PREFIXES.some(p => mblId.startsWith(p.prefix))) return false;
    
    // 7. Padrão SS* (variantes Santos): EXCLUIR
    if (/^SS[0-9A-Z]/.test(mblId)) return false;
    
    // 8. Qualquer outro prefixo desconhecido: EXCLUIR
    return false;
  });
}, [mblList]);
```

**Substituições necessárias**:

| Local | De | Para |
|-------|-----|------|
| `carrierStats` useMemo (~linha 505) | `mblList` | `filteredMblListByCarrier` |
| `filteredMbls` useMemo | `mblList` | `filteredMblListByCarrier` |
| `stats` useMemo | `mblList` | `filteredMblListByCarrier` |

---

## Comportamento Esperado

### Cenários de Teste

| MBL | Prefixo | Fonte | tipo_carga | Armador | Exibido? | Razão |
|-----|---------|-------|------------|---------|----------|-------|
| HLCU1234567 | HLCU | t_sea_master | FCL | Hapag-Lloyd | ✅ | Armador mapeado |
| MSCU9876543 | MSCU | t_master_dados | FCL | MSC | ✅ | Armador mapeado |
| SSZ/HAM/2024 | SSZ | t_tracking_sea | FCL | - | ❌ | Formato rota |
| GLNL456789 | GLNL | t_tracking_sea | FCL | - | ❌ | Prefixo LCL |
| 721274713 | - | t_master_dados | FCL | - | ❌ | Numérico |
| XYZW123456 | XYZW | t_tracking_sea | FCL | - | ❌ | Desconhecido |
| SSZ123456 | SSZ | t_tracking_sea | LCL | - | ✅ | tipo_carga = LCL |

### Modal de Armadores

O modal continuará exibindo:
- **13 armadores mapeados** com suas informações (Hapag-Lloyd, MSC, Maersk, etc.)
- **Seção LCL/Consolidadores** para referência (prefixos conhecidos)
- **Estatísticas baseadas apenas nos MBLs filtrados** (FCL com armadores mapeados + LCLs cadastrados)

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Adicionar CTE `master_dados_new` e LEFT JOIN na query `get_sea_tracking` |
| `src/pages/ContainerTracking.tsx` | Adicionar `filteredMblListByCarrier` useMemo e usar em stats/tabela/modal |

---

## Considerações Técnicas

1. **Prioridade de dados**: t_sea_master > t_master_dados (COALESCE na query SQL)

2. **Filtro de data**: `data_insert >= '2026-02-04 09:55:11'` aplicado apenas em t_master_dados

3. **LCLs cadastrados**: MBLs com `tipo_carga = 'LCL'` sempre aparecem (foram registrados manualmente)

4. **Performance**: Filtro no frontend mantém flexibilidade; pode ser movido para backend se necessário

5. **Deduplicação**: MBLs que existem em ambas as fontes aparecem apenas uma vez (prioridade t_sea_master)
