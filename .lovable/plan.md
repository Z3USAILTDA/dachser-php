

## Plano: Reduzir pressão de conexões no MariaDB (sem alterar limite do servidor)

### Contexto
O `max_user_connections = 30` não pode ser alterado. A solução é puramente no código: impedir chamadas duplicadas e reduzir concorrência.

### Alterações

**1. Guard de concorrência em `loadVouchers` — `src/pages/esteira/EsteiraIndex.tsx`**
- Adicionar `useRef<boolean>` (`isLoadingRef`) para evitar chamadas simultâneas
- No início de `loadVouchers`, se `isLoadingRef.current === true`, retornar imediatamente
- Setar `true` no início, `false` no finally
- No modo LEGACY (refresh manual), trocar `Promise.all` por chamadas sequenciais (2 conexões simultâneas → 1 por vez)

**2. Guard de in-flight no batch fetch — `src/components/esteira/VoucherTable.tsx`**
- Adicionar `useRef<boolean>` para evitar que o `useEffect` (L156-184) dispare requests duplicados durante re-renders do React StrictMode
- Se já estiver em flight, retornar imediatamente

**3. Sequencializar chamadas no modo legacy**
- Em `loadVouchers`, o modo legacy (L920-928) faz `Promise.all` com 2 chamadas simultâneas. Trocar por `await` sequencial para reduzir pico.

### Arquivos alterados
| Arquivo | Mudança |
|---|---|
| `src/pages/esteira/EsteiraIndex.tsx` | Ref guard + sequencializar legacy mode |
| `src/components/esteira/VoucherTable.tsx` | Ref guard no batch fetch |

### Resultado esperado
- Cada carregamento da esteira gera no máximo 1 conexão por vez (em vez de 2+ simultâneas)
- Re-renders e StrictMode não duplicam chamadas
- Redução de ~50% no pico de conexões concorrentes

