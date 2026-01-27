
# Plano: Filtragem do Tracking Aéreo com Correlação t_master_dados

## Objetivo

Alterar a lógica de filtragem da função `fetch-status-aereo` para correlacionar o AWB da tabela `t_status_aereo` com o MAWB da tabela `t_master_dados`, filtrando apenas processos onde `data_insert` seja de 27/01/2026.

---

## Análise Atual

| Aspecto | Estado Atual |
|---------|--------------|
| Tabela fonte | Apenas `t_status_aereo` |
| Filtro de data | `última atualização >= '2026-01-27 00:00:00'` |
| Join com t_master_dados | Não existe |

---

## Alterações Necessárias

### Arquivo: `supabase/functions/fetch-status-aereo/index.ts`

**1. Adicionar JOIN com t_master_dados**

A query atual:
```sql
SELECT * FROM t_status_aereo 
WHERE `última atualização` >= '2026-01-27 00:00:00'
```

Será alterada para:
```sql
SELECT s.*, m.data_insert as master_data_insert
FROM t_status_aereo s
INNER JOIN t_master_dados m ON TRIM(s.awb) = TRIM(m.mawb)
WHERE DATE(m.data_insert) = '2026-01-27'
  AND m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
ORDER BY s.id DESC
```

**2. Atualizar query de busca (com search)**

```sql
SELECT s.*, m.data_insert as master_data_insert
FROM t_status_aereo s
INNER JOIN t_master_dados m ON TRIM(s.awb) = TRIM(m.mawb)
WHERE DATE(m.data_insert) = '2026-01-27'
  AND m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
  AND (s.awb LIKE ? OR s.hawb LIKE ? OR s.destinatário LIKE ?)
ORDER BY s.id DESC
```

**3. Ajustar selectFields para usar alias `s.`**

Como a query agora usa JOIN, os campos precisam ser prefixados com o alias da tabela.

---

## Código Atualizado

```typescript
// Linha 67-81: Substituir a lógica de query

// Date threshold for filtering records based on t_master_dados.data_insert
const dateFilter = '2026-01-27';

// Build base SELECT with table alias
let baseSelect = `
  SELECT s.id, s.awb, s.hawb, s.destinatário, s.nome_analista, s.email_analista,
         s.email_cliente, s.tipo_servico, s.data_atraso, s.\`última atualização\`,
         s.\`último_status\`, s.origem, s.destino, s.alert_status, s.dep_datetime,
         ${hasArrCheckColumn ? 's.arr_check_count' : '0 as arr_check_count'},
         ${hasArrDatetimeColumn ? 's.arr_datetime' : 'NULL as arr_datetime'}
  FROM ${database}.t_status_aereo s
  INNER JOIN ${database}.t_master_dados m 
    ON TRIM(s.awb) = TRIM(m.mawb)
  WHERE DATE(m.data_insert) = ?
    AND m.tipo_processo IN ('AIR IMPORT', 'AIR EXPORT')
`;

let query: string;
let params: string[];

if (search && search.trim() !== '') {
  const searchPattern = `%${search.trim()}%`;
  query = `${baseSelect}
    AND (s.awb LIKE ? OR s.hawb LIKE ? OR s.destinatário LIKE ?)
    ORDER BY s.id DESC`;
  params = [dateFilter, searchPattern, searchPattern, searchPattern];
} else {
  query = `${baseSelect} ORDER BY s.id DESC`;
  params = [dateFilter];
}
```

---

## Considerações Técnicas

- **INNER JOIN**: Garante que apenas AWBs com correspondência em `t_master_dados` serão exibidos
- **TRIM()**: Necessário para garantir match correto entre strings com espaços
- **DATE()**: Extrai apenas a data de `data_insert`, ignorando o horário
- **tipo_processo**: Filtra apenas processos aéreos (AIR IMPORT/EXPORT)

---

## Impacto

| Antes | Depois |
|-------|--------|
| Exibe todos os AWBs atualizados a partir de 27/01 | Exibe apenas AWBs que existem em t_master_dados com data_insert = 27/01 |
| Pode mostrar AWBs sem processo mestre | Garante que só mostra AWBs vinculados a processos válidos |

---

## Passos de Implementação

1. Atualizar `supabase/functions/fetch-status-aereo/index.ts` com a nova lógica de query
2. Deploy da Edge Function
3. Verificar se os dados aparecem corretamente em /air/tracking
