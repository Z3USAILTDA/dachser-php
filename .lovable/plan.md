## Objetivo

Adicionar um sino de notificação na esteira (header de `EsteiraIndex`), posicionado **antes** do painel `FinDbStatsPanel` ("base de dados"), que sinaliza quando existem linhas nas tabelas-fonte `t_dados_financeiro_voucher` ou `t_dados_financeiro_spo` com `data_emissao` ou `data_vencimento` no ano 2024 ou anterior. Ao clicar, abre um modal listando esses processos.

## Comportamento

- **Sino**: ícone `Bell` (lucide-react), mesmo estilo arredondado dos botões vizinhos do header (`rounded-full`, border + bg preto translúcido, tema Z3US/gold).
- **Badge**: número total de linhas detectadas, em destaque vermelho/destructive quando > 0. Quando = 0, sino fica em estilo neutro/discreto.
- **Polling**: refetch a cada 5 min e ao clicar em "Atualizar" da esteira (reaproveitar `loadVouchers`/refresh, mas com chamada própria — sem alterar o fluxo existente).
- **Clique** → abre `Dialog` (shadcn) com:
  - Título: "Processos com datas anteriores a 2025"
  - Subtítulo: "Foram enviados para a base N processos com data_emissao ou data_vencimento em 2024 ou anterior."
  - Tabela com colunas: **Origem** (Voucher/SPO), **ND** (numero_nd/numero_spo), **data_emissao**, **data_vencimento**, **data_insert**.
  - Ordenação: `data_insert DESC`.
  - Sem ações de edição — apenas visualização.

## Onde mexer

- **Frontend**
  - Novo componente `src/components/esteira/DatasAntigasBell.tsx` (sino + modal + fetch próprio via `supabase.functions.invoke('mariadb-proxy', { body: { action: 'get_datas_emissao_vencimento_antigas' } })`).
  - `src/pages/esteira/EsteiraIndex.tsx` linha 1959: inserir `<DatasAntigasBell />` **antes** do `<FinDbStatsPanel ... />`.

- **Backend (mariadb-proxy)**
  - Nova action `get_datas_emissao_vencimento_antigas` em `supabase/functions/mariadb-proxy/index.ts`.
  - Query (UNION ALL das duas fontes):

```sql
SELECT 'VOUCHER' AS origem,
       numero_nd  AS nd,
       data_emissao,
       data_vencimento,
       data_insert
  FROM t_dados_financeiro_voucher
 WHERE YEAR(data_emissao)    <= 2024
    OR YEAR(data_vencimento) <= 2024
UNION ALL
SELECT 'SPO' AS origem,
       numero_spo AS nd,
       data_emissao,
       data_vencimento,
       data_insert
  FROM t_dados_financeiro_spo
 WHERE YEAR(data_emissao)    <= 2024
    OR YEAR(data_vencimento) <= 2024
ORDER BY data_insert DESC
LIMIT 500;
```
  - Retorno: `{ success, total, rows: [...] }`.
  - **Observação**: vou confirmar os nomes exatos das colunas `numero_nd` / `numero_spo` lendo o `mariadb-proxy` antes de escrever a action (já há queries dessas tabelas em outras actions); se diferentes, ajusto sem mudar o contrato.

## Não-objetivos

- Não altera dados nas tabelas-fonte.
- Não cria notificações por e-mail nem persiste estado de "lido".
- Não muda o fluxo de etapas dos vouchers.
- Sem mudanças de design fora do header da esteira.

## Perguntas em aberto (assumo default abaixo se não responder)

1. Cutoff "2024 ou anteriores" = `YEAR(data) <= 2024` (assumido).
2. Listar linhas mesmo de vouchers já `CONCLUIDO`/`CANCELADO`? **Assumo: sim**, pois a regra é sobre a base, não sobre o estado do voucher.
3. Limite de 500 linhas no modal com aviso "+N restantes" se ultrapassar — ok?