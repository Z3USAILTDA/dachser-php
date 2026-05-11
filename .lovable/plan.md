## Plano de correção

1. **Corrigir a criação real do master no backend**
   - Ajustar o fluxo `finalize_batch_import` para criar o voucher master usando os campos corretos da tabela de vouchers.
   - Garantir que falha na criação do master não seja engolida silenciosamente; se o master não puder ser criado, a finalização do lote deve retornar erro claro e não promover vouchers individuais como se tudo tivesse dado certo.

2. **Garantir anexos no master**
   - Manter os documentos vinculados como “grupo master” durante a etapa de vínculo.
   - Ao finalizar o lote, inserir esses anexos no voucher master criado e atualizar o documento do lote apontando para o `masterId` e `anexoId`.

3. **Evitar promoção indevida dos vouchers filhos**
   - Depois que o master for criado, marcar os vouchers individuais como `CONSOLIDADO_NO_MASTER` e vinculá-los via `voucher_master_id`.
   - Promover apenas o master para a etapa destino correta (`FISCAL`, `FINANCEIRO` ou `SUPERVISOR`), não os filhos individualmente.

4. **Retornar contagem correta para a UI**
   - Ajustar a resposta da finalização para devolver `masters_created`, `promoted` e erros quando houver, para que o toast mostre o resultado real.

## Detalhes técnicos

- Arquivo principal: `supabase/functions/mariadb-proxy/index.ts`.
- Causa provável encontrada: no bloco de criação do master em lote, o código usa `v.data_emissao` e insere em `data_emissao`, mas o restante da esteira usa `data_emissao_documento`. Isso pode fazer a criação do master falhar e, como o `catch` atual apenas loga e continua, os vouchers acabam seguindo individualmente e o master/anexos não são criados.
- A correção será cirúrgica e limitada ao fluxo de finalização do lote/master.