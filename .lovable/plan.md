
# Plano: Adicionar t_master_dados como Fonte Secundária + Filtrar Prefixos Não Mapeados

## ✅ IMPLEMENTADO

### Alterações Realizadas

#### 1. Backend: `olimpo-proxy` - action `get_sea_tracking`
- Adicionada CTE `master_dados_new` para buscar dados de `t_master_dados` com filtros:
  - `tipo_processo IN ('SEA IMPORT', 'SEA EXPORT')`
  - `data_insert >= '2026-02-04 09:55:11'`
- Utilizado `COALESCE` para priorizar dados de `t_sea_master` (fonte principal), com fallback para `t_master_dados`
- Campos ETA e `nome_analista` agora são buscados de ambas as fontes

#### 2. Frontend: `ContainerTracking.tsx`
- Adicionado `filteredMblListByCarrier` useMemo que filtra MBLs com prefixos não mapeados:
  - **Mantém**: Armadores mapeados (13 carriers) e LCLs cadastrados (`tipo_carga='LCL'`)
  - **Exclui**: Numéricos puros, formato rota (XXX/YYY), prefixos internos DACHSER, prefixos LCL estáticos, padrão SS*
- Atualizados para usar `filteredMblListByCarrier`:
  - `carrierStats` (modal de armadores)
  - `filteredMbls` (tabela principal)
  - `stats` (dashboard cards)
  - `dynamicArmadoresColoaders` (filtro de armador)
  - `dynamicCoordenadores` (filtro de coordenador)

