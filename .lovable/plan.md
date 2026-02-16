

# Fix: Definir Escala "Ningbo, CN" para MEDUWA505645 e proteger contra sobrescrita

## Problema

O processo MEDUWA505645 tem a Escala (transshipment_port) sendo recalculada e sobrescrita a cada ciclo de refresh da API. Mesmo usando a acao manual `set_transshipment_port`, o proximo ciclo do `refresh_sea_tracking` recalcula o valor e substitui.

A logica atual nas linhas 2817 e 2928 usa `COALESCE(?, transshipment_port)`, que substitui o valor existente sempre que a API retorna algo novo.

## Solucao

Duas acoes:

### 1. Corrigir o valor imediatamente

Chamar a acao `set_transshipment_port` via API para definir `transshipment_port = 'Ningbo, CN'` em todos os containers do MBL MEDUWA505645.

### 2. Proteger o campo contra sobrescrita futura

Modificar `supabase/functions/olimpo-proxy/index.ts` em tres pontos:

**Ponto A - Logica JavaScript (linha ~2759)**: Se `row.transshipment_port` ja tem valor no banco, pular toda a deteccao e preservar o valor existente.

```text
// Antes da deteccao de transshipment (linha 2759):
let transshipmentPort = null;
if (row.transshipment_port && row.transshipment_port.trim() !== '') {
  transshipmentPort = row.transshipment_port; // Preservar valor existente
} else if (uniqueTransshipments.length > 0) {
  // ... logica existente de deteccao
}
```

**Ponto B - UPDATE principal (linha 2817)**: Alterar para so atualizar se o campo estiver vazio no banco.

```text
-- De:
transshipment_port = COALESCE(?, transshipment_port),

-- Para:
transshipment_port = CASE 
  WHEN transshipment_port IS NULL OR transshipment_port = '' 
  THEN COALESCE(?, transshipment_port) 
  ELSE transshipment_port 
END,
```

**Ponto C - UPDATE de siblings (linha 2928)**: Mesma protecao na propagacao para containers irmaos.

```text
-- De:
transshipment_port = COALESCE(?, transshipment_port),

-- Para:
transshipment_port = CASE 
  WHEN transshipment_port IS NULL OR transshipment_port = '' 
  THEN COALESCE(?, transshipment_port) 
  ELSE transshipment_port 
END,
```

## Resultado

- O valor "Ningbo, CN" sera definido imediatamente para MEDUWA505645
- Nenhum ciclo futuro da API vai sobrescrever esse valor
- Novos containers sem escala continuam sendo preenchidos normalmente pela API
- A acao manual `set_transshipment_port` continua funcionando para correcoes futuras (pois faz UPDATE direto, sem o CASE)
