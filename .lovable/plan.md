

# Plano: Preencher Data de Decolagem a partir do LeadComex

## Situacao Atual

A coluna `data_decolagem` (campo `dep_datetime` ou `data_decolagem_ultimo_trecho`) aparece vazia porque:

| Fonte | Estado | Problema |
|-------|--------|----------|
| `t_status_aereo.dep_datetime` | NULL para maioria | So e preenchido quando tracking envia `dep_timestamp` |
| `t_cct_shipments.data_decolagem_ultimo_trecho` | NULL | Nunca e populado automaticamente |
| LeadComex `viagensAssociadas[]` | Disponivel mas NAO usado | Contem dados de voos com datas de decolagem |

## Dados Disponiveis no LeadComex

A API LeadComex retorna o campo `viagensAssociadas` com informacoes de voos:

```text
viagensAssociadas: [
  {
    "nroVoo": "JJ8076",
    "dataPartidaPrevista": "26/01/2026 14:30:00",
    "dataPartidaReal": "26/01/2026 14:45:00",
    "aeroportoOrigem": "MIA",
    "aeroportoDestino": "GRU"
  },
  {
    "nroVoo": "JJ8120",
    "dataPartidaReal": "25/01/2026 18:00:00",
    ...
  }
]
```

O campo `dataPartidaReal` (ou `dataPartidaPrevista` como fallback) do ULTIMO voo da lista e a data de decolagem do ultimo trecho.

## Solucao

Modificar o fluxo de sincronizacao LeadComex para extrair a data de decolagem do ultimo trecho.

## Mudancas

### Arquivo: `supabase/functions/leadcomex-sync/index.ts`

**Localizacao:** Dentro da funcao `processLeadComexData` (apos linha ~500)

**Logica:**
1. Verificar se `detalhe.viagensAssociadas` existe e tem dados
2. Pegar o ULTIMO elemento do array (ultimo trecho do voo)
3. Usar `dataPartidaReal` ou fallback para `dataPartidaPrevista`
4. Parsear data brasileira para ISO
5. Incluir no `updateData` para salvar em `t_cct_shipments.data_decolagem_ultimo_trecho`

**Codigo a adicionar (apos linha ~512):**
```typescript
// Extrair data de decolagem do ultimo trecho (viagensAssociadas)
if (detalhe?.viagensAssociadas && detalhe.viagensAssociadas.length > 0) {
  // Pegar o ultimo voo da lista (ultimo trecho)
  const ultimoVoo = detalhe.viagensAssociadas[detalhe.viagensAssociadas.length - 1];
  // Preferir dataPartidaReal, fallback para dataPartidaPrevista
  const dataDecolagem = ultimoVoo.dataPartidaReal || ultimoVoo.dataPartidaPrevista;
  if (dataDecolagem) {
    const parsedDate = parseBrazilianDate(dataDecolagem);
    if (parsedDate) {
      updateData.data_decolagem_ultimo_trecho = parsedDate;
      console.log(`[LEADCOMEX] Data decolagem encontrada: ${parsedDate} (voo ${ultimoVoo.nroVoo})`);
    }
  }
}
```

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

**Localizacao:** Action `update_leadcomex_data` (~linha 3200+)

**Garantir que `data_decolagem_ultimo_trecho` seja incluida nos campos de atualizacao:**
- Verificar se o campo ja esta sendo salvo em `t_cct_shipments`
- Se nao estiver, adicionar ao mapeamento de campos

### Diagrama de Fluxo

```text
LeadComex API
     |
     v
viagensAssociadas[N]  -->  Ultimo voo: dataPartidaReal ou dataPartidaPrevista
     |
     v
parseBrazilianDate()  -->  "2026-01-26T14:45:00"
     |
     v
updateData.data_decolagem_ultimo_trecho
     |
     v
mariadb-proxy (update_leadcomex_data)
     |
     v
t_cct_shipments.data_decolagem_ultimo_trecho
     |
     v
get_cct_shipments retorna o campo
     |
     v
UI exibe "Data de Decolagem: 26/01/2026 14:45"
```

## Apos Implementacao

1. Executar `refresh-all-active` na pagina de Logs LeadComex para reprocessar todos os HAWBs
2. Os processos com `viagensAssociadas` disponiveis terao a data de decolagem preenchida automaticamente
3. A timeline podera calcular SLA corretamente usando a data real de decolagem

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/leadcomex-sync/index.ts` | Adicionar extracao de `viagensAssociadas` para popular `data_decolagem_ultimo_trecho` |
| `supabase/functions/mariadb-proxy/index.ts` | Verificar se `data_decolagem_ultimo_trecho` esta no mapeamento de `update_leadcomex_data` |

## Validacao

1. Verificar nos logs LeadComex se mensagem "Data decolagem encontrada" aparece
2. Recarregar pagina CCT e verificar se coluna "Data Decolagem" esta preenchida
3. Abrir detalhe de um processo e confirmar data de decolagem na aba Dados

