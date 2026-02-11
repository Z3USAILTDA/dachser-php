

# Correcao do Parser de Importacao de Tarifas

## Problema Identificado

A planilha "ZEUS - Tabela de Perdiem e Free time" tem um formato **pivotado** (periodos como colunas), mas o parser atual espera um formato **achatado** (uma linha por periodo).

### Formato real da planilha:
```text
Prestador | Tipo de Container | Free time | Perdiem (1o periodo) | Perdiem (2o periodo) | Perdiem (3o periodo)
HAPAG     | DRY 20            | 5         | $113.00              | $130.00              | N/A
CMA CGM   | IMO 20            | 3         | $105.00              | $120.00              | $165.00
```

### O que o parser atual espera:
```text
Armador | Tipo Container | Free Time | Periodo | Dia Inicio | Dia Fim | Valor USD
HAPAG   | DRY 20         | 5         | 1       | 6          | ...     | 113
```

### Problemas especificos:
1. **Headers diferentes**: "Prestador" (nao "Armador"), "Tipo de Container" (nao "Tipo"), "Perdiem (Xo periodo)" (nao colunas separadas)
2. **Layout pivotado**: Os 3 periodos estao em colunas separadas na mesma linha, nao em linhas diferentes
3. **Valores monetarios**: Contem "$" e "N/A" que precisam ser tratados
4. **Sem colunas de dias**: A planilha nao tem "Dia Inicio"/"Dia Fim" -- os dias sao derivados do Free Time (FT+1 em diante)

---

## Solucao

Reescrever o parser no `ImportRatesDialog.tsx` para suportar o formato pivotado.

### Logica do novo parser:

1. **Deteccao de headers** com aliases expandidos:
   - "prestador" -> armador
   - "tipo de container" -> container_type
   - "free time" -> free_time_days
   - "perdiem" + "1" -> coluna do 1o periodo
   - "perdiem" + "2" -> coluna do 2o periodo
   - "perdiem" + "3" -> coluna do 3o periodo

2. **Pivot**: Para cada linha do Excel, gerar ate 3 registros (um por periodo):
   - Linha HAPAG DRY 20 / FT=5 / $113 / $130 / N/A gera:
     - `{ armador: HAPAG, tipo: DRY 20, ft: 5, period: first_period, rate: 113 }`
     - `{ armador: HAPAG, tipo: DRY 20, ft: 5, period: second_period, rate: 130 }`
     - 3o periodo ignorado (N/A)

3. **Calculo automatico de dias**:
   - 1o periodo: `start = free_time + 1`
   - 2o periodo: `start = periodo_anterior_start + periodo_span`
   - 3o periodo: idem, `end = null` (aberto)

4. **Tratamento de valores**: Remover "$", tratar "N/A" e celulas vazias como zero/ignorar

### Arquivo modificado:
- `src/components/demurrage/ImportRatesDialog.tsx` -- reescrever `handleFileChange` com o novo parser pivotado

### Detalhes tecnicos do parse:

```text
Para cada linha do Excel:
  armador = row[colPrestador]
  container = row[colTipoContainer]  
  freeTime = parseInt(row[colFreeTime])
  
  Para cada coluna de periodo (1o, 2o, 3o):
    valor = parseMoney(row[colPeriodoN])  // remove "$", trata "N/A"
    SE valor > 0:
      gerar ParsedRate {
        armador, container_type, free_time_days,
        period_type: "first_period" | "second_period" | "third_period",
        period_start_day: calculado,
        period_end_day: calculado ou null,
        rate_usd: valor,
        valid: true
      }

parseMoney(val):
  SE val == "N/A" ou vazio -> return 0
  remover "$", espacos
  tratar formato BR (1.234,56) vs US (1,234.56)
  return parseFloat
```

Nenhum outro arquivo precisa ser alterado -- o resto do fluxo (preview, import, backend) ja funciona.
