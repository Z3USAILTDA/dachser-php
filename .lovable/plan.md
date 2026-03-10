

# Alterar lógica de atraso marítimo: ETA Cadastro vs ETA Tracking

## Situação Atual

O backend (`olimpo-proxy/index.ts`, linhas ~1871-1888) calcula atraso comparando o ETA com a **data atual** (`CURDATE()`):
- `is_eta_delayed`: ETA < hoje - 3 dias → alerta
- `is_critico`: ETA < hoje - 7 dias → crítico
- `dias_atraso`: `DATEDIFF(CURDATE(), ETA)`

## Nova Lógica

Comparar **ETA Cadastro** (`eta_master` = `COALESCE(md.eta, mdn.eta)`) vs **ETA Tracking** (`eta_api` = `ts.eta`):
- `dias_atraso` = diferença em dias entre `eta_api` e `eta_master` (somente quando `eta_api > eta_master`)
- `is_eta_delayed` (alerta): diferença ≥ 3 dias
- `is_critico`: diferença ≥ 7 dias

Se `eta_master` ou `eta_api` for nulo, atraso = 0 (sem dados para comparar).

## Alterações

### 1. Backend: `supabase/functions/olimpo-proxy/index.ts` (linhas 1871-1888)

Substituir os 3 CASEs de `is_eta_delayed`, `is_critico` e `dias_atraso` por:

```sql
CASE 
  WHEN COALESCE(MAX(md.eta), MAX(mdn.eta)) IS NOT NULL 
    AND MAX(ts.eta) IS NOT NULL
    AND MAX(ts.eta) > COALESCE(MAX(md.eta), MAX(mdn.eta))
    AND DATEDIFF(MAX(ts.eta), COALESCE(MAX(md.eta), MAX(mdn.eta))) >= 3
    AND UPPER(COALESCE(MAX(ts.container_status), '')) NOT IN ('DELIVERED', 'GATE_OUT', 'DLV', 'GOD', 'EMPTY_RETURNED', 'EMPTY_RECEIVED_AT_CY')
  THEN 1 ELSE 0 
END as is_eta_delayed,
CASE 
  WHEN COALESCE(MAX(md.eta), MAX(mdn.eta)) IS NOT NULL 
    AND MAX(ts.eta) IS NOT NULL
    AND MAX(ts.eta) > COALESCE(MAX(md.eta), MAX(mdn.eta))
    AND DATEDIFF(MAX(ts.eta), COALESCE(MAX(md.eta), MAX(mdn.eta))) >= 7
    AND UPPER(COALESCE(MAX(ts.container_status), '')) NOT IN ('DELIVERED', 'GATE_OUT', 'DLV', 'GOD', 'EMPTY_RETURNED', 'EMPTY_RECEIVED_AT_CY')
  THEN 1 ELSE 0 
END as is_critico,
CASE 
  WHEN COALESCE(MAX(md.eta), MAX(mdn.eta)) IS NOT NULL 
    AND MAX(ts.eta) IS NOT NULL
    AND MAX(ts.eta) > COALESCE(MAX(md.eta), MAX(mdn.eta))
  THEN DATEDIFF(MAX(ts.eta), COALESCE(MAX(md.eta), MAX(mdn.eta)))
  ELSE 0 
END as dias_atraso,
```

### 2. Frontend: Nenhuma alteração necessária

O frontend já consome `is_eta_delayed`, `is_critico` e `dias_atraso` como campos calculados do backend. A lógica dos cards e filtros permanece idêntica.

### Impacto
- 1 arquivo editado (`olimpo-proxy/index.ts`)
- Cards de **Alerta** e **Crítico** passarão a refletir a diferença entre ETA Cadastro e ETA Tracking
- Processos sem ETA de tracking ou sem ETA de cadastro não serão classificados como atrasados

