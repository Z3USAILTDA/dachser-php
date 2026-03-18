

## Diagnóstico

O problema foi confirmado pela investigação direta no banco:

- **Criação do master**: `create_voucher_master` recebeu `voucher_ids: ["20261881299", "20261880869"]`
- **Resolução de UUIDs**: A query `SELECT id FROM t_vouchers WHERE numero_spo IN (...)` retornou **0 resultados** porque esses registros existem apenas na tabela `t_dados_financeiro_voucher`, não na `t_vouchers`
- **Resultado**: Master criado sem filhos vinculados. `get_voucher_filhos` retorna array vazio.

A busca (`search_vouchers_for_master`) usa UNION ALL entre `t_vouchers` e `t_dados_financeiro_voucher`, permitindo selecionar itens de ambas. Porém, na hora de vincular, só procura em `t_vouchers`.

## Plano

### 1. Alterar `create_voucher_master` no edge function

Após resolver os IDs existentes em `t_vouchers`, para cada `processo` não encontrado:

- Buscar dados na `t_dados_financeiro_voucher` (nd, razao_social, cnpj, valor_nf, moeda, data_vencimento, modal, id_rm, created_by)
- Criar um registro espelho na `t_vouchers` com UUID gerado, populando os campos equivalentes (numero_spo = nd, fornecedor = razao_social, etc.), etapa_atual = 'OPERACAO', e já com `voucher_master_id` apontando para o master
- Incluir esses novos IDs na lista de filhos vinculados

### 2. Nenhuma alteração no frontend

O frontend já funciona corretamente. O problema é exclusivamente no backend que não criava os registros espelho.

### Fluxo corrigido

```text
Frontend envia: voucher_ids = ["20261881299", "20261880869"]
                                    │
                    ┌────────────────┴────────────────┐
                    ▼                                 ▼
          t_vouchers: existe?                t_vouchers: existe?
          SIM → usa UUID existente           NÃO → busca em t_dados_financeiro_voucher
                                                  → cria registro espelho em t_vouchers
                                                  → usa novo UUID
                    │                                 │
                    └────────────────┬────────────────┘
                                    ▼
                    UPDATE SET voucher_master_id = masterUUID
```

