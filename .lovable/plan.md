

## Plano: Robô de Comprovantes — Suporte a Vouchers Master via Filhos

### Problema
Quando um voucher master é criado, ele agrupa vários filhos. Os comprovantes de pagamento geralmente contêm o número SPO de um **filho**, não do master. O robô atual não consegue resolver um SPO filho para o master correspondente, resultando em "Voucher não encontrado".

Além disso, um master provavelmente terá um comprovante por filho, e cada comprovante deve ser vinculado ao **master** (pois é ele que está na etapa ROBO/FINANCEIRO), mas registrando qual filho ele corresponde.

### Solução

**1. Backend — `mariadb-proxy/index.ts` (actions `find_voucher_by_spo` e `find_voucher_by_nd`)**

Adicionar uma etapa extra de busca após as tentativas existentes: se nenhum voucher foi encontrado diretamente, buscar na tabela como **filho** (`voucher_master_id IS NOT NULL`) e retornar o **master** correspondente.

```sql
-- Nova query: buscar se o SPO é de um voucher filho e retornar o master
SELECT m.id, m.numero_spo, m.fornecedor, m.valor, m.vencimento, m.etapa_atual,
       m.cobranca_em_nome_de, m.moeda, m.is_master, m.nome_master,
       c.id as child_voucher_id, c.numero_spo as child_spo
FROM dados_dachser.t_vouchers c
JOIN dados_dachser.t_vouchers m ON m.id = c.voucher_master_id
WHERE c.numero_spo = ? AND c.voucher_master_id IS NOT NULL AND c.voucher_master_id != ''
LIMIT 5
```

O resultado incluirá flag `is_master: true` e `child_spo` para que o frontend saiba que o match veio via filho.

**2. Frontend — `RoboTab.tsx`**

- Atualizar `searchVoucherBySPO` e `searchVoucherByND` para aceitar o resultado com `is_master` e exibir informação ao usuário (ex: "Vinculado ao Master: NOME_MASTER via filho SPO XXXX")
- Na interface `FileMatch`, adicionar campos opcionais `masterName` e `childSpo` para exibir contexto
- Na lista de arquivos, quando vinculado a um master, mostrar badge "Master" com o nome e o SPO filho identificado

**3. Anexação — `attach_comprovante_batch`**

O comprovante será anexado ao **master** (pois é ele que precisa do status `VALIDADO`), mas o detalhe do log incluirá o SPO filho correspondente para rastreabilidade.

### Arquivos alterados
| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/mariadb-proxy/index.ts` | Adicionar busca por filhos nos actions `find_voucher_by_spo` e `find_voucher_by_nd` |
| `src/components/tabs/RoboTab.tsx` | Interface FileMatch + exibição de contexto master/filho |

