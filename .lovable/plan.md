
## Diagnóstico
Sim: deve ser possível voltar o tipo de execução para **Pendente**. O bloqueio atual não está na UI, está no schema legado do MariaDB.

Confirmações no código:
- `src/components/esteira/PagamentosTab.tsx` já envia `A_DEFINIR` ao selecionar “Pendente”.
- O select da linha renderiza `A_DEFINIR` normalmente.
- `supabase/functions/mariadb-proxy/index.ts` já aceita `A_DEFINIR` em `set_tipo_execucao_pagamento`.
- Os logs do `mariadb-proxy` mostram o erro real:
  `Data truncated for column 'tipo_execucao_pagamento' at row 1`

## Causa raiz
A coluna `dados_dachser.t_vouchers.tipo_execucao_pagamento` **ainda está como ENUM legado** na base antiga.

Há duas pistas claras:
1. `supabase/functions/voucher-pagamentos-setup/index.ts` criou essa coluna originalmente como:
```sql
ENUM('MANUAL', 'REMESSA', 'TED', 'PIX')
```
2. Em `list_pagamentos`, existe um `ADD COLUMN IF NOT EXISTS tipo_execucao_pagamento VARCHAR(50)`, mas isso **não altera** uma coluna já existente. Ou seja: se ela já nasceu como ENUM, continua ENUM.

Resultado:
- `MANUAL` funciona
- `REMESSA_10H` / `REMESSA_15H` podem até funcionar se a base tiver sido alterada parcialmente em algum momento
- `A_DEFINIR` falha porque o ENUM não aceita esse valor

## Correção proposta

### 1. Corrigir o schema de forma definitiva
Alterar a coluna para `VARCHAR`, preservando os valores existentes:

```sql
ALTER TABLE dados_dachser.t_vouchers
MODIFY COLUMN tipo_execucao_pagamento VARCHAR(20)
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci
NULL DEFAULT NULL;
```

Isso resolve de vez:
- `A_DEFINIR`
- `MANUAL`
- `REMESSA_10H`
- `REMESSA_15H`
- futuros subtipos sem novo lock estrutural

### 2. Remover a falsa “garantia” dentro de `list_pagamentos`
Hoje o código tenta fazer:
```ts
ALTER TABLE ... ADD COLUMN IF NOT EXISTS tipo_execucao_pagamento VARCHAR(50)
```
dentro do fluxo de listagem.

Esse trecho deve ser removido porque:
- não corrige o problema real
- roda no caminho quente
- mascara a percepção de que a coluna ainda está errada

### 3. Endurecer o setter individual
Em `set_tipo_execucao_pagamento`:
- manter a validação de allowed values
- após o `UPDATE`, fazer um `SELECT` de verificação
- se o valor persistido divergir do valor enviado, retornar erro explícito de schema incompatível

Exemplo de verificação:
```ts
const rows = await client.query(
  `SELECT tipo_execucao_pagamento FROM dados_dachser.t_vouchers WHERE id = ?`,
  [voucherId]
);

if (rows?.[0]?.tipo_execucao_pagamento !== tipo_execucao_pagamento) {
  throw new Error(`Falha ao persistir tipo_execucao_pagamento=${tipo_execucao_pagamento}`);
}
```

### 4. Endurecer o setter em lote
`batch_set_tipo_execucao` hoje atualiza direto, sem validar allowed values e sem verificação pós-update.
Aplicar a mesma regra do setter individual para manter consistência e evitar regressões.

### 5. Atualizar a memória do projeto
Registrar que:
- `tipo_execucao_pagamento` deve ser `VARCHAR`
- os valores válidos são `A_DEFINIR | MANUAL | REMESSA_10H | REMESSA_15H`
- nunca usar ENUM nessa coluna

## Arquivos a alterar
- `supabase/functions/mariadb-proxy/index.ts`
  - remover `ALTER TABLE ... ADD COLUMN IF NOT EXISTS tipo_execucao_pagamento`
  - reforçar `set_tipo_execucao_pagamento`
  - reforçar `batch_set_tipo_execucao`
- `mem://vouchers/integration-rm-mapping-rules-v4`
  - atualizar regra persistente
- operação de schema no banco/Lovable Cloud
  - converter a coluna para `VARCHAR(20)`

## Validação pós-correção
1. Abrir `/fin/esteira` → aba **Pagamentos**.
2. Escolher uma linha com “Manual” ou “Remessa”.
3. Alterar para **Pendente**.
4. Confirmar:
   - sem erro no toast
   - valor permanece “Pendente” após reload
   - filtro “Tipo Exec. → Pendente” encontra a linha
5. Repetir com atualização em lote para garantir paridade.
6. Conferir logs: não deve mais existir `Data truncated for column 'tipo_execucao_pagamento'`.

## Riscos e mitigação
- **Lock curto na tabela** durante `ALTER TABLE`: aceitável, operação simples.
- **Sem perda de dados**: ENUM → VARCHAR preserva os textos existentes.
- **Sem regressão visual**: a UI já suporta `A_DEFINIR`; o problema atual é apenas persistência.
