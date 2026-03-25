

## Plano: Usar tarifas configuradas no "VALOR DIÁRIA USD" do anexo XLSX

### Problema atual
A seção "VALOR DIÁRIA USD" no anexo XLSX do e-mail mostra dados genéricos: `rate_period1_usd` e `rate_period2_usd` passados pelo cliente, mas esses valores não correspondem às tarifas configuradas na tabela `t_dachser_demurrage_rates` (que tem múltiplos períodos por armador/container_type com `period_start_day` e `period_end_day`).

### Solução
Passar o `armador` de cada container para a edge function, que então consulta as tarifas configuradas no MariaDB e calcula os dias e valores corretos por período.

### Alterações

**1. `src/hooks/useDemurrageData.ts` — Passar armador nos containers**
- No `useSendTestAlert`, adicionar `armador` ao mapeamento de containers (tanto no branch de items quanto no fallback):
  ```typescript
  armador: match?.armador || dc.armador || '',
  ```

**2. `supabase/functions/demurrage-send-alert/index.ts` — Buscar tarifas e calcular períodos**

- Adicionar `armador` ao `ContainerDetail` interface
- Na edge function, após receber os containers, conectar ao MariaDB e buscar as tarifas ativas:
  ```sql
  SELECT * FROM dados_dachser.t_dachser_demurrage_rates 
  WHERE active = 1 ORDER BY armador, container_type, period_start_day
  ```
- Para cada container, localizar as tarifas correspondentes por `armador` + `container_type` (usando `size` como container_type)
- Calcular quantos dias incidentes caem em cada período usando `period_start_day` e `period_end_day`
- Preencher as colunas do XLSX com os valores corretos:
  - **1° PERÍODO**: quantidade de dias no período 1 + valor diário (rate_usd)
  - **2° PERÍODO**: quantidade de dias no período 2 + valor diário (rate_usd)

- Se houver 3+ períodos nas tarifas, expandir os headers do XLSX dinamicamente para incluir todos os períodos configurados

**3. Lógica de cálculo de dias por período**
```
dias_incidentes = total de dias além do free time
Para cada período da tarifa (ordenado por period_start_day):
  - dias_no_periodo = min(dias_restantes, period_end_day - period_start_day + 1)
  - valor_periodo = dias_no_periodo * rate_usd
```

### Arquivos editados
- `src/hooks/useDemurrageData.ts`
- `supabase/functions/demurrage-send-alert/index.ts`

