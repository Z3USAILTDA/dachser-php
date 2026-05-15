---
name: Voucher dedupe rule (SPO + fornecedor + valor)
description: Marca cópias idênticas de vouchers como sync_status='DUPLICADO' preservando o de updated_at mais recente
type: feature
---

## Regra

Action `dedupe_vouchers_by_spo_fornecedor_valor` no `mariadb-proxy` agrupa por:
- `SUBSTRING_INDEX(TRIM(numero_spo),' ',1)` (ignora sufixos " DIM-BY", " SAN")
- `TRIM(fornecedor)`
- `COALESCE(valor, 0)`

Considera apenas vouchers com `sync_status='ATIVO'` E sem `id_rm` (`id_rm IS NULL OR id_rm=''`). Quando o grupo tem 2+ linhas, **mantém a de `MAX(updated_at)`** (desempate: maior `id`) e marca as demais como `sync_status='DUPLICADO'`.

## Schema

`t_vouchers.sync_status` é `ENUM('ATIVO','BAIXADO','DUPLICADO')`. O valor `DUPLICADO` foi adicionado para soft-delete reversível — anexos/logs ficam intactos, basta voltar para `ATIVO` para restaurar.

## Filtragem na UI

Tela de processos (`get_vouchers_combined`) já filtra `sync_status='ATIVO'`, então DUPLICADO some automaticamente.

## Prevenção contínua

`voucher-check-baixas` (cron de 10min) chama em sequência: `sync_voucher_statuses` → `mirror_vouchers_from_dfv` → `dedupe_vouchers_by_spo_fornecedor_valor`. Não foi adicionado guard nos INSERTs do importador (mais invasivo); o dedupe periódico cobre o caso.

## Fora de escopo

Vouchers com `id_rm` definido NÃO são tocados. Grupos com `valor IS NULL` ou `fornecedor IS NULL` também são ignorados (rascunhos).
