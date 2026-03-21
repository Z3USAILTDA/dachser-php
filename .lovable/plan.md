

## Plano: Acumular portos de transbordo no banco (append, não sobrescrever)

### Problema atual

Na linha 3374-3378 do `olimpo-proxy/index.ts`, o UPDATE do `transshipment_port` usa lógica que **nunca modifica** um valor existente:

```sql
CASE 
  WHEN transshipment_port IS NULL OR transshipment_port = '' 
  THEN COALESCE(?, transshipment_port) 
  ELSE transshipment_port  -- valor existente mantido, novo transbordo perdido
END
```

Se já existe "YANTIAN" e um novo transbordo "SANTOS" é detectado, o "SANTOS" é descartado.

### Solução

Modificar a lógica do UPDATE para **acumular** portos de transbordo separados por `; `:

1. Se `transshipment_port` está vazio/null → gravar o novo valor
2. Se já tem valor e o novo porto **já está contido** no valor existente → manter como está (evitar duplicatas)
3. Se já tem valor e o novo porto **é diferente** → concatenar: `"YANTIAN; SANTOS"`

### Alteração

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Modificar SQL do UPDATE (~linha 3374-3378) e lógica JS (~linha 3284-3286) para acumular portos |

### Detalhes técnicos

**JS (linha ~3284-3286)** — Quando já existe `transshipment_port` no banco, em vez de pular a detecção, continuar detectando e comparar com o existente. Se o novo porto não estiver contido no valor atual, concatenar.

**SQL UPDATE (linha ~3374-3378)** — Substituir o CASE por lógica que verifica se o novo valor já está contido no existente:

```sql
transshipment_port = CASE 
  WHEN ? IS NULL THEN transshipment_port
  WHEN transshipment_port IS NULL OR transshipment_port = '' THEN ?
  WHEN UPPER(transshipment_port) LIKE CONCAT('%', UPPER(?), '%') THEN transshipment_port
  ELSE CONCAT(transshipment_port, '; ', ?)
END
```

Isso garante: dado fixo, acumulativo, sem duplicatas.

