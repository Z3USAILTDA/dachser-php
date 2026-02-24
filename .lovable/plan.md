

## Ajustes no Dashboard de Cobranca

### 1. Botao Atualizar no cabecalho (PageLayout)

Mover o botao "Atualizar" para o header da pagina, usando a prop `rightContent` do `PageLayout`. O botao ficara antes do badge do usuario logado. Remover o botao atual que esta dentro do conteudo da pagina.

**Arquivo**: `src/pages/olimpo/OlimpoCobranca.tsx`
- Passar `rightContent` com o botao RefreshCw para o `PageLayout`
- Remover o bloco `<div className="flex justify-end">` com o botao Atualizar

---

### 2. De-para de Product (unificacao de modais)

Criar um mapeamento no frontend que agrupa os codigos retornados pelo backend:

```text
SI + SE  -> Sea
AI + AE  -> Air
DIM + DEX -> CHB
ASO      -> Miscellaneous
TCK      -> Trucking
Outros   -> Outros (fallback)
```

**Arquivo**: `src/pages/olimpo/OlimpoCobranca.tsx`
- Adicionar constante `PRODUCT_MAP` que mapeia cada codigo ao grupo
- Apos receber os dados do backend, agrupar (merge) as linhas com mesmo grupo, somando valores de cada faixa de aging
- A tabela, graficos e barra segmentada usarao os dados ja agrupados

---

### 3. Cabecalho visual do card de dados (referencia da imagem)

Substituir o card atual "Distribuicao de Aging" por um layout que reproduza exatamente a imagem de referencia:

```text
+------------------------------------------------------------+------+
| [====barra segmentada colorida por faixa=================] | 24%  |
|  76%     20%     3%     0%     0%     1%                   |      |
| 15,117  3,966   525    82     39     186    4,799  19,917  |      |
+------------------------------------------------------------+------+
```

Estrutura:
- Flex row: barra + badge de % overdue no canto direito
- Linha de percentuais abaixo da barra (alinhados com cada segmento)
- Linha de valores absolutos abaixo dos percentuais
- Duas ultimas colunas: Total Overdue (bold) e Total Receivable (bold)

**Arquivo**: `src/pages/olimpo/OlimpoCobranca.tsx`
- Redesenhar a secao do card de distribuicao de aging conforme o layout acima

---

### 4. Filtro Product vs Client (abas)

Adicionar tabs no topo do conteudo: **Product** | **Client**. Ambas as visoes usam os mesmos dados, mas agrupados de forma diferente.

**Backend** (`supabase/functions/mariadb-proxy/index.ts`):
- Nova action `get_aging_by_client`: mesma query do `get_aging_overview` mas agrupando por `COALESCE(t.nome_cliente, 'Sem Cliente')` em vez de `modal`

**Frontend** (`src/pages/olimpo/OlimpoCobranca.tsx`):
- Adicionar estado `viewMode: 'product' | 'client'`
- Renderizar tabs (usando Tabs do shadcn) acima do conteudo
- Quando `viewMode === 'client'`, chamar `get_aging_by_client` em vez de `get_aging_overview`
- Todo o restante (KPIs, barra segmentada, tabela, graficos) permanece identico, apenas os dados mudam
- A coluna da tabela muda de "Product" para "Client"

---

### 5. Ultima Atualizacao

O campo "Ultima Atualizacao" atualmente exibe `MAX(data_insert)` da tabela `t_dados_financeiro_nfs`, ou seja, a data/hora do registro mais recente inserido na tabela. Isso sera esclarecido no label do KPI para "Ultimo Registro" e a query permanece a mesma.

Alternativamente, se voce preferir que represente "quando a pagina foi carregada", posso mudar para exibir a hora atual do navegador. Manterei como esta (data do ultimo registro inserido no banco) por padrao.

---

### Resumo de arquivos

| Arquivo | Acao |
|---|---|
| `src/pages/olimpo/OlimpoCobranca.tsx` | Itens 1-4: mover botao, de-para product, novo header visual, tabs product/client |
| `supabase/functions/mariadb-proxy/index.ts` | Item 4: nova action `get_aging_by_client` |
