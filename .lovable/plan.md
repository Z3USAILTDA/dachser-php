## Diagnóstico

Confirmei a causa: no `mariadb-proxy/index.ts` as três ações que alimentam o Olimpo de Cobrança (visão por cliente) ainda agrupam por `TRIM(SUBSTRING_INDEX(razao_social,'-',1))` e **não consultam** a tabela `dados_dachser.t_fin_cliente_grupo` (que já está populada com 4.511 mapeamentos). Por isso "ZF PASSIVE SAFETY SYSTEM BRASIL LTDA" continua como linha separada de "ZF AUTOMOTIVE BRASIL LTDA.".

As ações afetadas são as 6 abaixo (3 do fluxo antigo + 3 do fluxo "_cr" da view nova):
- `get_aging_by_client` / `get_aging_by_client_cr` — produto (grupo) listado no aging
- `get_client_cnpj_detail` / `get_client_cnpj_detail_cr` — drill por CNPJ
- `get_client_faturas` / `get_client_faturas_cr` — faturas do cliente

## O que vou fazer

Aplicar a mesma expressão de agrupamento canônica em todas as 6 queries, fazendo `LEFT JOIN` da `t_fin_cliente_grupo` por `UPPER(TRIM(razao_social))` e usando `COALESCE(grupo, fallback hifenizado)`.

### Expressão canônica (helper conceitual)

```sql
COALESCE(
  g.grupo,
  TRIM(SUBSTRING_INDEX(COALESCE(t.razao_social,'Sem Cliente'),'-',1))
)
```

Join padrão:
```sql
LEFT JOIN dados_dachser.t_fin_cliente_grupo g
  ON g.razao_social COLLATE utf8mb4_unicode_ci
   = UPPER(TRIM(COALESCE(t.razao_social,''))) COLLATE utf8mb4_unicode_ci
```

### Mudanças por ação

1. **`get_aging_by_client`** (linhas 2798-2878) e **`get_aging_by_client_cr`** (17284-17348)
   - Substituir o `SELECT product` e o `GROUP BY` pela expressão canônica + adicionar o `LEFT JOIN g`.
   - Resultado: "ZF AUTOMOTIVE BRASIL LTDA" passa a consolidar todas as variações TRW/ZF/ZF PASSIVE com os CNPJs agregados.

2. **`get_client_cnpj_detail`** (2881-2956) e **`get_client_cnpj_detail_cr`** (17350-17415)
   - Substituir `WHERE TRIM(SUBSTRING_INDEX(...)) = ?` por:
     ```sql
     LEFT JOIN dados_dachser.t_fin_cliente_grupo g ON ...
     WHERE COALESCE(g.grupo, TRIM(SUBSTRING_INDEX(...,'-',1))) COLLATE utf8mb4_unicode_ci
         = ? COLLATE utf8mb4_unicode_ci
     ```
   - Mantém compatibilidade quando o `clientName` enviado é tanto um grupo da de-para quanto um nome derivado do fallback.

3. **`get_client_faturas`** (2958-3023) e **`get_client_faturas_cr`** (17417-17480)
   - Trocar o `(razao_social LIKE ? OR razao_social = ?)` pela mesma expressão canônica resolvida via `LEFT JOIN g`, comparando o resultado com `?` (mesmo padrão do detalhe). Aplicar no SELECT principal e no COUNT.

### Pontos cuidadosos

- **Colação**: forçar `COLLATE utf8mb4_unicode_ci` em ambos os lados do join e do filtro para evitar "Illegal mix of collations" (a conexão usa `utf8mb4_general_ci`).
- **Normalização da chave**: o import já fez `UPPER(TRIM(razao_social))`, então `UPPER(TRIM(t.razao_social))` casa diretamente. Não vou aplicar removal de pontuação para preservar exatidão (qualquer caso não-mapeado simplesmente cai no fallback atual — sem regressão).
- **Sem mudança de frontend**: o contrato (`product`, `cnpjs[]`, `clientName`) é preservado.
- **Sem mudança de schema** — a tabela já existe e está populada (4.511 registros).
- **Sem refactor**: edições cirúrgicas dentro de cada `case`, mantendo o restante do arquivo intacto.

### Validação após implementação

1. Recarregar `/olimpo/cobranca` (visão por cliente) e conferir que "ZF AUTOMOTIVE BRASIL LTDA" passa a englobar "ZF PASSIVE SAFETY SYSTEM..." e os CNPJs antes separados.
2. Clicar no grupo para abrir o detalhe de CNPJs — deve listar todos os CNPJs do grupo consolidado.
3. Abrir as faturas — deve retornar linhas de todas as razões sociais mapeadas àquele grupo.

### Fora do escopo

- Reimportar/atualizar o CSV de de-para (já feito).
- UI para manutenção do de-para.
- Outras visões (por produto, budget, etc.) que não passam por essas 6 ações.
