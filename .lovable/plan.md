
## Ajuste do Assunto do E-mail Maritimo - Formato Dachser

### Status: ✅ CONCLUÍDO

### Alterações realizadas

1. **olimpo-proxy/index.ts** - CTEs `master_data` e `master_dados_new` agora incluem `hbl`, `hawb` e `cliente`. SELECT final expõe `hbl`, `etd` e `cliente`.
2. **send-container-status-email/index.ts** - Novo formato de assunto Dachser Pre-Alert SE com todos os campos, datas em dd.MM.yyyy.
3. **ContainerTracking.tsx** - Interface `MblTrackingData` com `hbl`, `etd`, `cliente`. Payload do e-mail inclui os novos campos.
4. **Fix**: Corrigida chave `}` extra na ação `enrich_sea_containers` que impedia o deploy.
