

# Plano: Alterar Filtro CCT para 26/01

## Objetivo

Mudar o filtro de data do CCT Dashboard de 27/01/2026 para 26/01/2026.

---

## Alteração Necessária

### Arquivo: `supabase/functions/mariadb-proxy/index.ts`

| Linha | Atual | Novo |
|-------|-------|------|
| 2790 | `AND s.dep_datetime >= '2026-01-27 00:00:00'` | `AND s.dep_datetime >= '2026-01-26 00:00:00'` |
| 2791 | `AND DATE(m.data_insert) = '2026-01-27'` | `AND DATE(m.data_insert) = '2026-01-26'` |

---

## Código

```typescript
// Linhas 2789-2791:
// CCT RESET: Filtrar por DEP >= 26/01 E data_insert em t_master_dados = 26/01
AND s.dep_datetime >= '2026-01-26 00:00:00'
AND DATE(m.data_insert) = '2026-01-26'
```

---

## Passos de Implementação

1. Atualizar `supabase/functions/mariadb-proxy/index.ts` (linhas 2790-2791)
2. Deploy da Edge Function `mariadb-proxy`
3. Verificar processos em /air/cct

