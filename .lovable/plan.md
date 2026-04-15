

## Plano: Atualizar apenas `tipo_exec` na `t_dados_rm` ao marcar como pronto

### Problema
Com a mudança anterior (insert na entrada do FINANCEIRO), quando o financeiro marca como pronto o voucher, o `insert_dados_rm` é chamado novamente com todos os dados. O correto é **apenas atualizar o campo `tipo_exec`**, já que o registro já existe na `t_dados_rm`.

### Alterações

**1. Nova action no `mariadb-proxy/index.ts`: `update_tipo_exec_dados_rm`**
- Recebe `id_rm`, `numero_spo` e `tipo_exec`
- Executa `UPDATE dados_dachser.t_dados_rm SET tipo_exec = ? WHERE id_rm = ? OR nd = ?`
- Retorna `{ success: true }`

**2. `PagamentosTab.tsx` (linhas 444-494)**
- Substituir a chamada `insert_dados_rm` por `update_tipo_exec_dados_rm`
- Enviar apenas `id_rm`, `numero_spo` e `tipo_exec`
- Remover toda a lógica de dados bancários, boleto, regras_forma_pag etc. que não são mais necessários neste ponto

**3. `FaturasDoDiaTab.tsx` (linha 176-178)**
- Verificar se também precisa da mesma mudança (se o contexto é marcar como pronto)

### O que NÃO muda
- A action `insert_dados_rm` existente (usada na entrada do FINANCEIRO)
- `VoucherFinanceiroActions.tsx` (BAIXA_REMESSA — manter como está)
- Estrutura da tabela `t_dados_rm`

