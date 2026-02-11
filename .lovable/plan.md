

# Plano Consolidado - Modulo Demurrage / Detention

Todas as alteracoes solicitadas organizadas em 3 fases de implementacao.

---

## FASE 1 - Alteracoes Rapidas

### 1.1 Analytics - Remover card "Recuperado"
- Remover o KpiCard "RECUPERADO" (linhas 186-194 de `DemurrageAnalytics.tsx`)
- Alterar grid de `xl:grid-cols-5` para `xl:grid-cols-4`
- Remover tipo `"recovered"` do `QuickFilter` e logica associada
- Remover calculo de `recovered` do `useMemo` de KPIs

### 1.2 Monitor - Adicionar todos os filtros possiveis
Na tela `DemurrageMonitor.tsx`, expandir a barra de filtros (atualmente so tem busca + status de risco):
- **Armador** (Select com valores unicos extraidos dos containers)
- **Cliente** (Select com valores unicos)
- **Tipo Container** (Select: 20DV, 40DV, 40HC, 20RF, 40RF, 45HC)
- **Porto Origem / Destino** (Selects com valores unicos)
- **Status Cronos** (Select: PENDING, IN_TRANSIT, ARRIVED, GATE_OUT, RETURNED)
- **Free Time Source** (Select: PROCESSO, CONTRATO, TARIFA, CONTAINER)
- Botao **"Limpar Filtros"** para resetar todos
- Organizar filtros em 2 linhas para nao sobrecarregar visualmente

### 1.3 Pre-Faturamento Detalhes - Ajustes
No `PreInvoiceDetailsDialog.tsx`:
- **Remover** o campo "Vencimento" (linhas 136-138)
- **Adicionar** campo "Prazo de Contestacao": calculado como `alert_sent_at + 48 horas uteis` (pula sabado e domingo). Se `alert_sent_at` nao existir, mostrar "Aguardando envio de alerta"
- **Exportar PDF** - ja funciona (botao existente na linha 201-216), validar formato

---

## FASE 2 - Pre-Faturamento Tabela + Tarifas Upload

### 2.1 Pre-Faturamento - Modal de informacoes por linha
Na tabela em `DemurragePreInvoicing.tsx`:
- Adicionar botao de acao (icone de edicao) em cada linha da tabela
- Criar novo componente `PreInvoiceInfoDialog.tsx` com campos:
  - **Status** (Select com 8 opcoes: DISPUTA, CONCLUIDO, A FATURAR, EM ANALISE CLIENTE, FATURADO, PREJUIZO, CANCELADO, NOTIFICAR)
  - **Registro Othello** (Input somente leitura, preenchido automaticamente pelo mapeamento abaixo)
  - **MISK** (Input texto livre)
  - **Observacao** (Textarea, visivel apenas no dialog de detalhes)
- Mapeamento automatico Status -> Registro Othello:

```text
STATUS              | REGISTRO OTHELLO
--------------------|------------------
DISPUTA             | VALUE
CONCLUIDO           | INVOICED
A FATURAR           | RELEASE
EM ANALISE CLIENTE  | VALUE
FATURADO            | RELEASE
PREJUIZO            | (vazio)
CANCELADO           | (vazio)
NOTIFICAR           | VALUE
```

- Adicionar opcao de follow-up/observacoes agrupado por MBL (campo textarea por MBL)
- Salvar via `demurrage_update_pre_invoice` no `mariadb-proxy`

### 2.2 Tarifas - Upload de Excel em massa
Na tela `DemurrageRates.tsx`:
- Adicionar botao "Importar Excel" ao lado de "Nova Tarifa"
- Criar novo componente `ImportRatesDialog.tsx`:
  - Upload de arquivo .xlsx
  - Parser usando lib `xlsx` (ja instalada)
  - Mapear colunas: Prestador (armador), Tipo Container, Free Time, 1o Periodo (dias + valor), 2o Periodo, 3o Periodo
  - Preview dos dados antes de confirmar
  - Validacao de dados (tipos, ranges)
- Nova acao `demurrage_bulk_create_rates` no `mariadb-proxy`
- Dados de referencia dos carriers (planilha enviada):

```text
HAPAG: FT 10d | 1o: 11-20d | 2o: 21-30d | 3o: 31+
CMA CGM DRY: FT 10d | 1o: 11-15d | 2o: 16-25d | 3o: 26+
CMA CGM IMO: FT 3d | 1o: 4-9d | 2o: 10-15d | 3o: 16+
MSC: FT 14d | 1o: 15-21d | 2o: 22-28d | 3o: 29+
DACHSER: FT 10d | 1o: 11-15d | 2o: 16-20d | 3o: 21+
```

---

## FASE 3 - Alertas e Clientes

### 3.1 Logica de envio de alertas
Atualizar `demurrage-alert-cron/index.ts`:
- O **primeiro alerta** de free time deve ser enviado **30 dias corridos** apos o termino do free time
- Se o cliente **nao retornou** apos **15 dias** do primeiro alerta, enviar **re-notificacao**
- Se `client_returned = true`, nao re-enviar
- Atualizar `demurrage-send-alert/index.ts` com templates HTML baseados nos modelos DACHSER enviados:
  - Pagina 1: Aviso de free time vencido (alerta inicial)
  - Pagina 2: Demonstrativo de custos com prazo de 48h uteis para contestacao

### 3.2 Clientes - Controle de emails e retorno
Na tela `DemurrageClients.tsx`:
- Adicionar nova tab/view **"E-mails Enviados"** mostrando:
  - Data de envio
  - Tipo de alerta (inicial / re-notificacao)
  - Container/MBL associado
  - Status (Enviado, Retornado, Sem Retorno)
- Adicionar botao por linha para marcar **"Cliente Retornou"**
  - Salvar data de retorno e usuario que marcou
  - Nova acao `demurrage_mark_alert_returned` no `mariadb-proxy`
  - O retorno bloqueia o re-envio do alerta de 15 dias

---

## Secao Tecnica

### Arquivos a criar:
- `src/components/demurrage/PreInvoiceInfoDialog.tsx` - Modal Status/MISK/Obs com mapeamento Othello
- `src/components/demurrage/ImportRatesDialog.tsx` - Dialog de importacao Excel de tarifas

### Arquivos a modificar:
- `src/pages/demurrage/DemurrageAnalytics.tsx` - Remover card Recuperado, ajustar grid
- `src/pages/demurrage/DemurrageMonitor.tsx` - Adicionar 6+ filtros com limpeza
- `src/components/demurrage/PreInvoiceDetailsDialog.tsx` - Remover Vencimento, adicionar Prazo Contestacao
- `src/pages/demurrage/DemurragePreInvoicing.tsx` - Botao info por linha, follow-up
- `src/pages/demurrage/DemurrageRates.tsx` - Botao Importar Excel
- `src/pages/demurrage/DemurrageClients.tsx` - Tab emails enviados, botao retorno
- `src/hooks/useDemurrageData.ts` - Novos hooks (bulk rates, mark returned, filtros expandidos)
- `supabase/functions/mariadb-proxy/index.ts` - Novas acoes: `demurrage_bulk_create_rates`, `demurrage_mark_alert_returned`, ampliar `demurrage_update_pre_invoice`
- `supabase/functions/demurrage-alert-cron/index.ts` - Logica 30 dias + 15 dias re-envio
- `supabase/functions/demurrage-send-alert/index.ts` - Templates DACHSER

### Novas colunas MariaDB (via mariadb-proxy setup):
- `t_dachser_demurrage_pre_invoices`: `misk VARCHAR(100)`, `observacao TEXT`, `othello_registro VARCHAR(100)`, `alert_sent_at DATETIME`, `contestacao_deadline DATETIME`, `status_info VARCHAR(50)`
- `t_dachser_demurrage_alerts`: `client_returned TINYINT(1) DEFAULT 0`, `client_returned_at DATETIME`, `client_returned_by VARCHAR(100)`

### Calculo do prazo de contestacao:
```text
function add48BusinessHours(startDate):
  hoursRemaining = 48
  current = startDate
  while hoursRemaining > 0:
    current = current + 1 hora
    if current.dayOfWeek != SABADO and current.dayOfWeek != DOMINGO:
      hoursRemaining -= 1
  return current
```

### Logica de alertas (cron atualizado):
```text
Para cada container com free_time excedido:
  dias_apos_ft = hoje - free_time_end_date

  SE dias_apos_ft >= 30 E nenhum_alerta_enviado:
    -> Enviar alerta inicial
    -> Registrar alert_sent_at

  SE ultimo_alerta >= 15 dias atras E client_returned = false:
    -> Enviar re-notificacao
    -> Registrar novo alerta

  SE client_returned = true:
    -> Nao re-enviar
```

