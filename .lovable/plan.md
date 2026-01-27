
# Plano: Ajustes no Monitoramento Marítimo e Cadastro de Notificações

## Resumo das Alterações Solicitadas

1. **Processos Entregues**: Sair da tela após 24h do status "entregue"
2. **Cadastro de Notificação**:
   - Separar portos de origem e portos de destino
   - Mais opções rápidas de portos (para origem e destino)
   - Adicionar opção de regra padrão (fallback quando cliente não tem regra específica)

---

## 1. Processos Entregues - Ocultação Após 24h

A lógica de 24h já está implementada no backend (olimpo-proxy, linhas 1684-1689 da query `get_sea_tracking`):

```sql
-- Ocultar containers entregues há mais de 24 horas
AND NOT (
  UPPER(COALESCE(MAX(ts.container_status), '')) IN ('DELIVERED', 'DLV', 'GOD', ...)
  AND MAX(ts.last_check) < DATE_SUB(NOW(), INTERVAL 24 HOUR)
  AND MAX(ts.container) != 'PENDENTE'
)
```

**Nenhuma alteração necessária** - O filtro já existe e está funcionando corretamente no backend.

---

## 2. Separação de Portos: Origem e Destino

### 2.1 Alteração na Tabela do Banco (MariaDB)

**Arquivo:** `supabase/functions/olimpo-proxy/index.ts`

Adicionar novas colunas à tabela `t_sea_regras_notificacao`:

```sql
ALTER TABLE t_sea_regras_notificacao 
  ADD COLUMN portos_origem TEXT AFTER tipo_processo,
  ADD COLUMN portos_destino TEXT AFTER portos_origem;
```

Migrar dados existentes (se houver):
```sql
UPDATE t_sea_regras_notificacao 
SET portos_origem = portos, portos_destino = portos 
WHERE portos IS NOT NULL AND portos != '[]';
```

### 2.2 Atualização do Tipo TypeScript

**Arquivo:** `src/types/sea.ts`

```typescript
// ANTES
export interface SeaRegraNotificacao {
  portos: string[];
  // ...
}

// DEPOIS
export interface SeaRegraNotificacao {
  portos_origem: string[];
  portos_destino: string[];
  portos?: string[];  // Manter para compatibilidade (deprecated)
  // ...
}
```

### 2.3 Atualização do Dialog de Cadastro

**Arquivo:** `src/components/sea/SeaRegraNotificacaoDialog.tsx`

Substituir a seção única de "Portos" por duas seções:

| Campo Atual | Novos Campos |
|-------------|--------------|
| `portos: string[]` | `portosOrigem: string[]` |
| `portoInput: string` | `portosDestino: string[]` |
| | `portoOrigemInput: string` |
| | `portoDestinoInput: string` |

**Layout proposto:**

```text
+---------------------------+---------------------------+
|    PORTOS DE ORIGEM       |    PORTOS DE DESTINO      |
+---------------------------+---------------------------+
| [Input + Add]             | [Input + Add]             |
| [Badges: CNSHA, DEHAM...] | [Badges: BRSSZ, BRPNG...] |
| Quick-add: [Asia] [Europa]| Quick-add: [Brasil]       |
+---------------------------+---------------------------+
```

### 2.4 Expansão das Opções Rápidas de Portos

**Arquivo:** `src/types/sea.ts`

Adicionar constantes para portos internacionais organizados por região:

```typescript
// Portos Brasil (já existe parcialmente)
export const PORTOS_BRASIL = [
  "BRSSZ", "BRPNG", "BRITJ", "BRNVT", "BRIOA", "BRRIG",
  "BRRIO", "BRVIX", "BRSSA", "BRSUA", "BRPEC", "BRMAO"
];

// Portos China/Ásia
export const PORTOS_ASIA = [
  "CNSHA", "CNNGB", "CNYTN", "CNTAO", "CNXMN", "HKHKG",
  "SGSIN", "KRPUS", "JPTYO", "JPYOK", "TWKHH", "VNSGN"
];

// Portos Europa  
export const PORTOS_EUROPA = [
  "NLRTM", "BEANR", "DEHAM", "DEBRV", "FRLEH", 
  "ESVLC", "ESBCN", "GBFXT", "ITGOA", "GRPIR"
];

// Portos Américas
export const PORTOS_AMERICAS = [
  "USLAX", "USLGB", "USNYC", "USSAV", "USHOU", "USMIA",
  "ARBUE", "UYMVD", "CLVAP", "PECLL"
];

// Hubs de Transbordo
export const PORTOS_HUBS = [
  "PAPTY", "PACOL", "JMKIN", "BSFPO", "ESALG", "AEJEA"
];
```

**UI com grupos de seleção rápida:**

```text
Origem (Internacional):
[+Ásia] [+Europa] [+Américas] [+Hubs]

Destino (Brasil):
[+Santos] [+Sul] [+Nordeste] [+Todos BR]
```

---

## 3. Regra Padrão (Default Rule)

### 3.1 Alteração na Tabela do Banco

Adicionar coluna `is_default`:

```sql
ALTER TABLE t_sea_regras_notificacao 
  ADD COLUMN is_default BOOLEAN DEFAULT FALSE AFTER ativo;
```

**Regra de negócio**: Apenas UMA regra pode ser "default" por vez.

### 3.2 Atualização do Tipo TypeScript

**Arquivo:** `src/types/sea.ts`

```typescript
export interface SeaRegraNotificacao {
  // ... campos existentes
  is_default: boolean;
}
```

### 3.3 Atualização do Dialog

**Arquivo:** `src/components/sea/SeaRegraNotificacaoDialog.tsx`

Adicionar checkbox especial com destaque:

```text
[ ] Regra Padrão
    ↳ Será usada para clientes sem regra específica
```

**Comportamento especial**:
- Se marcada como default, `cliente_nome` e `cnpj_consignatario` podem ser deixados em branco
- Validação: apenas uma regra default pode existir
- Destaque visual na tabela de regras (badge "PADRÃO")

### 3.4 Atualização da Tabela de Listagem

**Arquivo:** `src/pages/sea/SeaRegrasNotificacao.tsx`

- Adicionar badge "PADRÃO" na coluna Cliente quando `is_default = true`
- Ordenar regra padrão no topo ou destacar visualmente

### 3.5 Atualização do Backend

**Arquivo:** `supabase/functions/olimpo-proxy/index.ts`

- **create_sea_regra_notificacao**: Aceitar campo `is_default`
- **update_sea_regra_notificacao**: 
  - Se `is_default = true`, setar `is_default = false` em todas as outras regras
- **get_sea_regras_notificacao**: Incluir campo `is_default` no SELECT

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/types/sea.ts` | Novos tipos e constantes de portos |
| `src/components/sea/SeaRegraNotificacaoDialog.tsx` | UI separada para origem/destino + checkbox default |
| `src/pages/sea/SeaRegrasNotificacao.tsx` | Exibição das novas colunas na tabela |
| `src/hooks/useSeaRegrasNotificacao.ts` | Atualizar payload para novos campos |
| `supabase/functions/olimpo-proxy/index.ts` | Schema + CRUD para novos campos |

---

## Detalhes Técnicos

### Constantes de Portos Expandidas

```typescript
// src/types/sea.ts

export const PORTOS_GRUPOS = {
  BRASIL_SUL: ["BRSSZ", "BRPNG", "BRITJ", "BRNVT", "BRIOA", "BRRIG"],
  BRASIL_SUDESTE: ["BRSSZ", "BRRIO", "BRVIX"],
  BRASIL_NORDESTE: ["BRSSA", "BRSUA", "BRPEC"],
  ASIA_CHINA: ["CNSHA", "CNNGB", "CNYTN", "CNTAO", "CNXMN", "HKHKG"],
  ASIA_SUDESTE: ["SGSIN", "VNSGN", "MYPKG", "THLCH"],
  ASIA_NORDESTE: ["KRPUS", "JPTYO", "JPYOK", "TWKHH"],
  EUROPA_NORTE: ["NLRTM", "BEANR", "DEHAM", "DEBRV", "GBFXT"],
  EUROPA_SUL: ["ESVLC", "ESBCN", "ITGOA", "GRPIR"],
  AMERICAS: ["USLAX", "USLGB", "USNYC", "USSAV", "ARBUE", "CLVAP"],
  HUBS: ["PAPTY", "PACOL", "JMKIN", "AEJEA", "ESALG"],
};

export const PORTOS_LABELS: Record<string, string> = {
  BRSSZ: "Santos",
  BRPNG: "Paranaguá",
  CNSHA: "Xangai",
  NLRTM: "Rotterdam",
  // ... mapeamento completo
};
```

### Migração da Tabela

```sql
-- Adicionar novas colunas
ALTER TABLE dados_dachser.t_sea_regras_notificacao 
  ADD COLUMN portos_origem TEXT AFTER tipo_processo,
  ADD COLUMN portos_destino TEXT AFTER portos_origem,
  ADD COLUMN is_default BOOLEAN DEFAULT FALSE AFTER ativo;

-- Migrar dados existentes (portos genéricos vão para ambos)
UPDATE dados_dachser.t_sea_regras_notificacao 
SET 
  portos_origem = COALESCE(portos, '[]'),
  portos_destino = COALESCE(portos, '[]')
WHERE portos IS NOT NULL;

-- Índice para busca de regra padrão
CREATE INDEX idx_sea_regras_default ON dados_dachser.t_sea_regras_notificacao(is_default);
```

### Lógica de Validação (Frontend)

```typescript
// Validação para regra normal
const isValid = (clienteNome || cnpj) && eventosDisparo.length > 0;

// Validação para regra default
const isValidDefault = isDefault && eventosDisparo.length > 0;

// Botão salvar habilitado
disabled={saving || (!isDefault && !clienteNome && !cnpj) || eventosDisparo.length === 0}
```
