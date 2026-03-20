## Plano Completo: Correções na Régua de Cobrança e Disputas — IMPLEMENTADO ✅

### 1. ✅ Importação de Planilha — Modal de Duplicados
- Nova action `check_disputas_planilha` no backend
- Flag `forceUpdate` em `import_disputas_planilha` 
- Modal de confirmação com 3 botões: Substituir Todos / Importar apenas novos / Cancelar

### 2. ✅ Observações e Prazo
- Mapeamento de coluna "prazo"/"vencimento"/"data limite"/"deadline" no parser
- Fix `update_disputa_observacoes`: check-then-update em vez de UPSERT

### 3. ✅ Exportação Excel — Sumário
- Colunas de sumário alinhadas com "Valor (R$)" no índice correto
- Total Valor como número raw com formato de moeda

### 4. ✅ Erro ao Editar/Excluir Disputa
- `update_disputa_observacoes`: SELECT → UPDATE/INSERT com try/catch
- `delete_disputa`: try/catch + cleanup de t_fin_disputas

### 5. ✅ E-mails Agrupados
- `regua-send-aging` migrado para `npm:mysql2/promise` com `connectWithRetry`
- Erros de DB vs Resend separados
- Frontend com mensagens específicas (temporário vs permanente)
