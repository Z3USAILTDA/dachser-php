
## Ajuste do Assunto do E-mail Maritimo - Formato Dachser

### Objetivo
Alterar o assunto dos e-mails de alerta do monitoramento maritimo para seguir o padrao Dachser, deixando em branco os campos que nao temos na base de dados.

### Formato alvo do assunto
```
Dachser Pre-Alert SE - PO:  - HBL: {hbl} - MBL: {mbl} - {cliente} - Consignee: {consignee} - {destino} - ETD: {etd} - ETA: {eta}
```

Campos sem dados disponiveis (PO e numero interno) ficarao em branco no assunto, aparecendo como `PO:  -` conforme solicitado.

### Alteracoes

#### 1. Query `get_sea_tracking` no `olimpo-proxy/index.ts`
Adicionar ao SELECT final os campos que ja existem nas CTEs mas nao sao expostos:
- `MAX(md.etd) as etd` - ETD do t_sea_master (ja esta na CTE `master_data` mas nao no SELECT)
- `MAX(sm_hbl.hbl) as hbl` - HBL do t_sea_master (adicionar na CTE `master_data`)
- `COALESCE(MAX(mdn.cliente), MAX(ts.consignee)) as cliente` - Cliente do t_master_dados (adicionar na CTE `master_dados_new`), com fallback para consignee

Na CTE `master_data`, adicionar:
```sql
MAX(hbl) as hbl,
```

Na CTE `master_dados_new`, adicionar:
```sql
MAX(hawb) as hawb,
MAX(cliente) as cliente,
```

No SELECT final, adicionar:
```sql
COALESCE(MAX(md.hbl), MAX(mdn.hawb)) as hbl,
MAX(md.etd) as etd,
COALESCE(MAX(mdn.cliente), MAX(ts.consignee)) as cliente,
```

#### 2. Interface `MblTrackingData` no `ContainerTracking.tsx`
Adicionar 3 campos opcionais:
- `hbl: string | null`
- `etd: string | null`
- `cliente: string | null`

#### 3. Interface `EmailRequest` no `send-container-status-email/index.ts`
Adicionar campos opcionais:
- `hbl?: string`
- `mbl?: string`
- `etd_raw?: string`
- `cliente?: string`

#### 4. Formato do assunto no `send-container-status-email/index.ts`
Substituir a logica atual de assunto por:
```
Dachser Pre-Alert SE - PO:  - HBL: {hbl} - MBL: {mbl} - {cliente} - Consignee: {consignee} - {destino} - ETD: {etd_formatado} - ETA: {eta_formatado}
```

- Formato de datas: `dd.MM.yyyy` (padrao europeu Dachser)
- Campos sem valor aparecem em branco (ex: `PO:  -`)
- Aplicar para ambos os tipos de e-mail (interno e cliente)

#### 5. Payload do `handleSendEmail` no `ContainerTracking.tsx`
Adicionar ao body da requisicao:
```typescript
hbl: emailMbl.hbl || '',
mbl: emailMbl.mbl_id,
etd_raw: emailMbl.etd || '',
cliente: emailMbl.cliente || '',
```

### Arquivos editados
1. `supabase/functions/olimpo-proxy/index.ts` - CTEs e SELECT final (adicionar hbl, etd, cliente)
2. `supabase/functions/send-container-status-email/index.ts` - Novo formato de assunto + novos campos
3. `src/pages/ContainerTracking.tsx` - Interface MblTrackingData + payload do e-mail
