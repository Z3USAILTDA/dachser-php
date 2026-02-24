

## Olimpo: Hub com Filhos "Movimentacao Global" e "Cobranca"

### Resumo

Transformar `/olimpo` de uma pagina unica (mapa) em uma pagina hub com dois modulos:

1. **Movimentacao Global** -- mapa Olimpo atual, movido para `/olimpo/mapa`
2. **Cobranca** -- novo dashboard analytics de aging por produto (Sea, Air, CHB, etc.)

Os dados de Cobranca vem da tabela `t_dados_financeiro_nfs` (mesma da Regua de Cobranca), agrupados pela coluna `modal`.

---

### Arquivos a criar

| Arquivo | Descricao |
|---|---|
| `src/pages/olimpo/OlimpoIndex.tsx` | Pagina hub com 2 cards: Movimentacao Global e Cobranca |
| `src/pages/olimpo/OlimpoCobranca.tsx` | Dashboard analytics de aging por produto |

### Arquivos a modificar

| Arquivo | Descricao |
|---|---|
| `src/App.tsx` | Novas rotas: `/olimpo` (index), `/olimpo/mapa` (mapa), `/olimpo/cobranca` (analytics) |
| `src/pages/Dashboard.tsx` | Manter href `/olimpo` (agora aponta para o hub) |
| `supabase/functions/mariadb-proxy/index.ts` | Nova action `get_aging_overview` |

---

### Detalhes tecnicos

#### 1. OlimpoIndex.tsx -- Pagina Hub

Segue o padrao do `DemurrageIndex.tsx`:
- `PageLayout` com titulo "DACHSER", subtitulo "Olimpo -- Visao Estrategica", icone Building2
- Card header descritivo
- Grid com 2 cards clicaveis:
  - **Movimentacao Global** (icone Globe, rota `/olimpo/mapa`) -- "Mapa global de cargas em transito"
  - **Cobranca** (icone DollarSign, rota `/olimpo/cobranca`) -- "Aging de recebiveis por produto"
- `backTo` nao necessario (hub principal)

#### 2. Backend: action `get_aging_overview`

Nova action no `mariadb-proxy` que agrupa `t_dados_financeiro_nfs` por `modal` (produto) em faixas de aging:

```text
Faixas baseadas em DATEDIFF(CURDATE(), data_vencimento):
- Not Due:     diff <= 0
- Aging < 90:  diff BETWEEN 1 AND 90
- Aging 91-180: diff BETWEEN 91 AND 180
- Aging 181-240: diff BETWEEN 181 AND 240
- Aging 241-360: diff BETWEEN 241 AND 360
- Aging > 360: diff > 360
```

Filtros (mesmos da Regua):
- Excluir soft-deleted (`t_financeiro_soft_delete`)
- Excluir baixados (`tbaixas` com StatusLan 1, 2, 3)
- Excluir em disputa (`disputa = 1`)

A query agrupa por `COALESCE(t.modal, 'Outros')` e retorna `SUM(t.valor_nf)` e `COUNT(*)` para cada faixa.

Retorno:

```text
{
  "success": true,
  "data": [
    { "product": "Sea", "not_due": 7198121, "aging_90": 2005299, ... , "total": 9500000 },
    { "product": "Air", ... },
    ...
  ],
  "totals": { "not_due": 15117373, "aging_90": ..., "total": ... },
  "lastUpdate": "2026-02-24T14:30:00"
}
```

#### 3. OlimpoCobranca.tsx -- Dashboard Analytics

Pagina completa usando `PageLayout` (backTo `/olimpo`):

**Secao 1 -- KPI Cards (topo)**
4 cards no padrao Dachser:
- Total Receivable (soma geral formatada em BRL)
- Total Overdue (soma das faixas vencidas)
- % Overdue (percentual do total em atraso)
- Ultima atualizacao (data/hora do ultimo data_insert)

**Secao 2 -- Barra de aging segmentada**
- Barra horizontal colorida mostrando proporcao de cada faixa
- Verde (Not Due), Amarelo (<90), Laranja (91-180), Vermelho-claro (181-240), Vermelho (241-360), Vermelho-escuro (>360)
- Percentuais exibidos sobre cada segmento

**Secao 3 -- Tabela de Aging por Produto**
Segue o layout da imagem de referencia:
- Colunas: Product | Not Due | <90 | 91-180 | 181-240 | 241-360 | >360 | Total Overdue | Total Receivable
- Linhas por `modal` (Sea, Air, CHB, Miscellaneous, Trucking, etc.)
- Linha Grand Total no rodape com fonte bold
- Valores formatados em BRL (R$)
- Estilo: fundo escuro, cores de risco crescentes nas colunas de aging

**Secao 4 -- Graficos (recharts)**
- BarChart empilhado: aging por produto (cada faixa uma cor)
- PieChart: distribuicao Not Due vs Total Overdue

#### 4. Rotas (App.tsx)

```text
/olimpo          -> OlimpoIndex (pagina hub)
/olimpo/mapa     -> Olimpo (mapa existente, sem alteracoes)
/olimpo/cobranca -> OlimpoCobranca (novo analytics)
```

Usuarios `olimpo_only` serao redirecionados para `/olimpo` (o hub) -- ja e o comportamento atual, nenhuma alteracao necessaria no Dashboard.

O componente `Olimpo.tsx` existente nao sera modificado, apenas referenciado na rota `/olimpo/mapa`.
