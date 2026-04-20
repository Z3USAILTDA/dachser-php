

## Usar `t_eventos_awb` e `t_description_eventos` como fonte canônica de resolução de sigla

### Por que ainda não usamos

Hoje a `resolveCodeFromSlot` em `fetch-tracking-aereo` tenta resolver o código nesta ordem:

1. `status_code` nativo do JSON
2. Regex `| Code XXX |` (IBS)
3. Regex `^([A-Z]{2,5})\b` no início da descrição
4. Regex `(XXX)` (Lufthansa)
5. **Lookup em `t_eventos_awb` / `t_description_eventos`** — existe mas é o último recurso e usa apenas keyword/igualdade simples

O problema: descrições reais raramente caem em (1)-(4). Exemplos típicos do crawler:
- `"Received from Flight at FRA"` → não tem `status_code`, não tem `| Code |`, não começa com sigla, não tem `(XXX)` → cai no lookup, mas o lookup atual não casa por substring nem normaliza, então falha → vai pro fallback `lastStatusCode` cru → vira "FRA".

As duas tabelas no MariaDB já mantêm o mapeamento autoritativo de descrição → sigla IATA, mantido pela operação. Elas devem ser a fonte primária, não o último recurso.

### Mudança proposta

**1. Carregar as tabelas uma vez por execução em `fetch-tracking-aereo`**

Adicionar Q0 logo após a conexão:

```sql
SELECT codigo, descricao FROM t_eventos_awb WHERE codigo IS NOT NULL AND descricao IS NOT NULL;
SELECT codigo, descricao FROM t_description_eventos WHERE codigo IS NOT NULL AND descricao IS NOT NULL;
```

Montar dois mapas em memória:
- `EXACT_MAP: Map<descricao_normalizada, codigo>` — match exato
- `KEYWORD_INDEX: Array<{needle, codigo, weight}>` — match por substring, ordenado por tamanho da needle DESC (needle maior vence)

Normalização: `upper().trim().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '')`.

**2. Reordenar `resolveCodeFromSlot` para priorizar as tabelas**

Nova ordem:

1. `status_code` nativo do JSON (continua em primeiro — é dado estruturado do crawler)
2. **`EXACT_MAP[normalize(desc)]`** — match exato com `t_eventos_awb` / `t_description_eventos`
3. **`KEYWORD_INDEX`** — primeira needle (maior) que estiver contida em `normalize(desc)`
4. Regex `| Code XXX |` (IBS)
5. Regex `^([A-Z]{2,5})\b` validado contra whitelist
6. Regex `(XXX)` (Lufthansa)

O resultado precisa estar na whitelist `VALID_IATA` para ser aceito; caso contrário continua tentando os próximos passos.

**3. Manter o restante intacto**

- `pickTopByIATA` continua igual (recebe `code` resolvido melhor agora).
- `VALID_IATA` whitelist continua barrando localizações.
- Frontend `getStatusCode` continua devolvendo `UNK` quando código não é reconhecido.
- `mariadb-proxy.get_awb_tracking_events` recebe a mesma reordenação para o modal bater com o card.

### Performance

- 2 SELECTs adicionais por execução do cron (~milhares de linhas, mas é tabela pequena de mapeamento).
- Cache em memória dentro da invocação — zero impacto por AWB processado.
- Sem JOIN no SQL principal (mantém Q3 simples).

### Validação

1. AWB com `"Received from Flight at FRA"` → resolve `RCF` via lookup, não vira `FRA`.
2. AWB com `"Arrived at FCO"` → resolve `ARR`, não vira `FCO`.
3. AWB com `"Notified Consignee"` → resolve `NFD`.
4. AWBs já corretos (`020-01256754`, `020-07276290`, `020-65056110`) não regridem.
5. AWB com descrição desconhecida (não está em nenhuma tabela) → `UNK`, sem inventar sigla a partir de localização.

### Não muda

- SQL Q3 (`JSON_EXTRACT($[0..3])` + `ORDER BY id DESC`).
- Hierarquia IATA, `pickTopByIATA`, `MANUAL_OVERRIDES`, SLA, CTE de discrepância, schema de retorno, cron, demais módulos.

### Memória a atualizar

`mem://air/tracking/data-mirroring-intent-v2`: registrar que `t_eventos_awb` e `t_description_eventos` são fonte primária de resolução de sigla (passos 2-3), à frente dos regex específicos por airline.

