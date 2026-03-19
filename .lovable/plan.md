

## Plano: Corrigir status do processo 724-85006073

### Diagnóstico

Investiguei o `timeline_json` do AWB no MariaDB e encontrei:

| Timestamp | Status | Descrição |
|-----------|--------|-----------|
| 20 Mar 2026 20:10 | DEP | Departed CDG-ZRH (timestamp futuro, filtrado) |
| 19 Mar 2026 13:15 | RCS | Ready for Carriage at CDG |
| 19 Mar 2026 13:15 | RCS | Ready for Carriage at CDG (duplicata) |
| 19 Mar 2026 13:15 | FOH | Received in Warehouse at CDG |
| 19 Mar 2026 11:13 | BKD | Booked on Flight |
| 18 Mar 2026 15:31 | BKD | Booked on Flight |

Os eventos `RCS` e `FOH` têm **exatamente o mesmo timestamp**. A hierarquia IATA atualizada no código dá `FOH: 16` > `RCS: 10`, portanto `FOH` deveria vencer o desempate. Mas a tela mostra `RCS`.

**Causa raiz**: A edge function `fetch-status-aereo` não foi re-implantada após a última alteração da hierarquia (FOH de 9 para 16). O código fonte está correto mas a versão em produção é a antiga.

### Ação

1. **Reimplantar a edge function `fetch-status-aereo`** — sem alteração de código, apenas deploy para que a versão com `FOH: 16` entre em produção.

### Resultado esperado
- AWB 724-85006073: status muda de `RCS` para `FOH` na tabela principal, alinhando com o banco de dados e a timeline.

