

## Plano: Detecção automática de transbordo via last_event vs destino

### Lógica
Quando o `last_event` contém uma localização (formato "Evento - LOCALIZAÇÃO"), comparar essa localização com o campo `destino`. Se forem diferentes e o `transshipment_port` ainda estiver vazio, gravar automaticamente a localização como porto de transbordo.

Exemplo: `last_event = "Vessel departed - YANTIAN"`, `destino = "HAMBURG"` → `transshipment_port = "YANTIAN"`.

### Onde aplicar

**Arquivo: `supabase/functions/olimpo-proxy/index.ts`**

Adicionar um novo bloco de detecção logo após o fallback de transshipment por keywords (linha ~3293), antes do UPDATE final:

1. **Extrair localização do `last_event`**: Usar split no separador ` - ` para pegar a parte após o último hífen.

2. **Comparar com `destino`**: Normalizar ambos (uppercase, trim, primeiro token) e verificar se são diferentes. Também excluir a `origem` para evitar falsos positivos (ex: "Gate out empty - SANTOS" onde origem é Santos).

3. **Só aplicar se `transshipmentPort` ainda for null**: Não sobrescrever detecções anteriores (API, keywords, ou valor já no banco).

4. **Filtrar eventos relevantes**: Apenas eventos de navegação/movimento devem ser considerados (ex: "Vessel departed", "Arrival in", "Discharged"). Excluir eventos locais como "Gate out empty", "Loaded", etc.

```text
Fluxo:
last_event = "Vessel departed - YANTIAN"
                                  ↓
              extrair "YANTIAN" via split(" - ")
                                  ↓
              comparar com destino ("HAMBURG") e origem ("NINGBO")
                                  ↓
              YANTIAN ≠ HAMBURG e YANTIAN ≠ NINGBO
                                  ↓
              transshipment_port = "YANTIAN"
```

### Eventos que ativam a detecção
- "Vessel departed"
- "Arrival in" / "Arrived"  
- "Discharged"
- "Departure"

### Eventos ignorados (localização = origem, não indica transbordo)
- "Gate out empty"
- "Loaded"
- "Gate in"

### Alteração

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/olimpo-proxy/index.ts` | Adicionar bloco de detecção de transbordo via comparação `last_event` location vs `destino`, após linha ~3293, antes do UPDATE |

