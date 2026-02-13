
# Alteracoes na Esteira de Vouchers - 8 Itens (Revisado)

## 1. Travar exclusao de arquivos fora da etapa operacional

**Onde**: `src/components/esteira/VoucherDetailsView.tsx` e `src/components/esteira/VoucherOperacaoActions.tsx`
- Na funcao de exclusao de anexos e no botao de delete (icone Trash2), verificar `voucher.etapaAtual`
- Permitir exclusao apenas se `etapaAtual` for `OPERACAO`, `RASCUNHO` ou `AJUSTE_OPERACAO`
- Ocultar o botao de delete quando fora dessas etapas
- Na substituicao de anexo em `VoucherOperacaoActions.tsx`, aplicar a mesma restricao

## 2. E-mail consolidado de SLA no final do dia (CORRIGIDO)

O objetivo e enviar **um unico e-mail por dia** ao responsavel de cada etapa com a lista de vouchers que estao **vencendo ou ja venceram o SLA da etapa** (tempo parado na etapa, nao data de vencimento do pagamento).

**Onde**: `supabase/functions/voucher-check-sla-alerts/index.ts`
- Ja existe a logica de verificacao de SLA por etapa (Operacao 24h, Fiscal 48h, Financeiro vencimento)
- Alterar para que em vez de enviar multiplos e-mails (um por tipo de alerta), agrupe TUDO em um unico e-mail por responsavel
- O e-mail consolidado deve listar:
  - Vouchers parados na etapa Operacao ha mais de 24h
  - Vouchers parados na etapa Fiscal ha mais de 48h
  - Vouchers no Financeiro perto de vencer o SLA
- Usar a tabela `t_sla_config` (via `get_sla_configs`) para respeitar os limites de horas configurados por etapa, em vez de hardcoded 24h/48h
- Deve ser disparado via cron uma vez por dia (ex: 17:00 BRT)
- Criar template HTML unico com secoes separadas por tipo de alerta

**Nao** criar nova edge function; reaproveitar `voucher-check-sla-alerts` com a logica de consolidacao.

## 3. Adicionar coluna "nd" na t_dados_rm

**Onde**: `supabase/functions/mariadb-proxy/index.ts`
- Na acao `insert_dados_rm` ou equivalente, incluir campo `nd` com o valor do `numero_spo` do voucher
- Adicionar `ALTER TABLE dados_dachser.t_dados_rm ADD COLUMN nd VARCHAR(60) DEFAULT NULL` (try/catch)
- Atualizar CREATE TABLE para incluir a coluna

## 4. Voucher concluido permanece 24h na tabela ativa

**Onde**: `supabase/functions/mariadb-proxy/index.ts`
- Nas queries `get_vouchers_ativos` e `get_vouchers_esteira`, alterar filtro de `etapa_atual != 'CONCLUIDO'` para:
```text
(etapa_atual != 'CONCLUIDO' 
 OR (etapa_atual = 'CONCLUIDO' AND updated_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)))
```
- Na UI (`VoucherTable.tsx`), adicionar badge visual para vouchers concluidos mostrando que sairao da tabela em breve

## 5. Aba Comprovantes: exibir dados adicionais

**Onde**: `src/components/esteira/ComprovantesTab.tsx` e `supabase/functions/mariadb-proxy/index.ts`
- Na query de comprovantes, fazer JOIN com `t_vouchers` para trazer: fornecedor, tipo_documento
- Trazer todos os anexos do voucher (nao so comprovantes)
- Adicionar na tabela: colunas "Nome Fornecedor" e "Tipo Documento"
- Adicionar botao "Ver Documentos" para listar todos os anexos
- Adicionar botao "Ver Detalhes" para navegar aos detalhes do voucher

## 6. Mover Analise Documental para fora do Voucher

**Onde**: `src/pages/Dashboard.tsx`
- No menu FIN, reordenar para:
  1. Regua de Cobranca
  2. Analise Documental (item independente)
  3. Voucher/SPO
- Rotas ja existem, apenas reposicionar no menu

## 7. Corrigir filtro de Emissao

**Onde**: `src/pages/esteira/EsteiraIndex.tsx`
- Quando o usuario seleciona apenas uma data (sem data fim), filtrar exatamente aquele dia (00:00 a 23:59:59)
- Aplicar mesma logica para filtro de vencimento

## 8. Adicionar coluna "Criado por" na tabela

**Onde**: `supabase/functions/mariadb-proxy/index.ts`, `src/components/esteira/VoucherTable.tsx`, `src/types/voucher.ts`
- Na query de vouchers, fazer JOIN ou subquery em `t_dados_financeiro_voucher` para trazer `created_by`
- Adicionar campo `criadoPorDfv` ao tipo Voucher
- Adicionar coluna "Criado por" na tabela de visualizacao

---

## Detalhes Tecnicos

### Arquivos a serem modificados:
1. `src/components/esteira/VoucherDetailsView.tsx` - restricao exclusao anexos
2. `supabase/functions/voucher-check-sla-alerts/index.ts` - consolidar em e-mail unico diario baseado em SLA da etapa
3. `supabase/functions/mariadb-proxy/index.ts` - coluna nd, query concluidos 24h, comprovantes JOIN, created_by
4. `src/components/esteira/ComprovantesTab.tsx` - colunas adicionais
5. `src/pages/Dashboard.tsx` - reordenar menu FIN
6. `src/pages/esteira/EsteiraIndex.tsx` - corrigir filtros, mapear created_by
7. `src/components/esteira/VoucherTable.tsx` - coluna "Criado por", badge concluido
8. `src/types/voucher.ts` - campo criadoPorDfv
9. `src/components/esteira/VoucherOperacaoActions.tsx` - restricao exclusao anexos

### Dependencias:
- Cron job para `voucher-check-sla-alerts` deve rodar 1x/dia (17:00 BRT) via pg_cron + pg_net
- Coluna `nd` no MariaDB sera adicionada via ALTER TABLE com try/catch
- SLA limits devem vir da tabela `t_sla_config` em vez de valores hardcoded
