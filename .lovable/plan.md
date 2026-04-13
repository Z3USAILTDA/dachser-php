

## Plano: Corrigir priorização de Masters no Robô (ambos componentes)

### Causa raiz

O problema está em **duas camadas** no `RoboTab.tsx` (aba Robô dentro de `/fin/esteira`) e parcialmente no `ComprovanteRobot.tsx`:

1. **Seleção do voucher**: `searchVoucherBySPO` usa `data.vouchers.find(v => v.etapa_atual === 'ROBO')` — pega o primeiro ROBO, sem priorizar master.
2. **Badge "Master"**: Só aparece quando `matched_via_child` é true (ou seja, quando o SPO pertence a um filho). Quando o master tem o mesmo `numero_spo` que o filename (match direto), `matched_via_child` NÃO é setado, e o badge mostra apenas "SPO XXXX".
3. **Interface de retorno**: A função `searchVoucherBySPO` retorna `{ id, masterName?, childSpo? }` mas `masterName` só é preenchido quando `matched_via_child` — nunca quando o voucher é diretamente um master.

### Alterações

**1. `src/components/tabs/RoboTab.tsx`** (aba Robô principal)

- **Linhas 88-96 e 113-121**: Na seleção do voucher, priorizar master na etapa ROBO:
  ```typescript
  // Priorizar master na etapa ROBO
  const roboVoucher = data.vouchers.find((v: any) => v.etapa_atual === 'ROBO' && v.is_master)
    || data.vouchers.find((v: any) => v.etapa_atual === 'ROBO');
  ```

- **Linhas 91-95 e 116-120**: Incluir `is_master` direto no retorno:
  ```typescript
  return {
    id: roboVoucher.id,
    masterName: (roboVoucher.is_master || roboVoucher.matched_via_child) 
      ? (roboVoucher.nome_master || roboVoucher.numero_spo) 
      : undefined,
    childSpo: roboVoucher.child_spo,
  };
  ```

- **Linha 386-393**: Badge já funciona baseado em `masterName` — com a correção acima, passará a funcionar para masters diretos também.

**2. `src/pages/esteira/ComprovanteRobot.tsx`** (página separada)

- **Linhas 150-152 e 163-165**: Já corrigidos anteriormente com `.find(v => v.is_master)`. Manter.

**3. Backend `mariadb-proxy/index.ts`**

- Já retorna `is_master` nas queries. Já tem sort de priorização. Sem alteração necessária.

### Resumo

| Arquivo | Alteração |
|---------|-----------|
| `RoboTab.tsx` linhas 88-96 | Priorizar master ROBO no `find` |
| `RoboTab.tsx` linhas 113-121 | Idem para busca por ND |
| `RoboTab.tsx` linhas 91-95 | Preencher `masterName` quando `is_master` direto |
| `ComprovanteRobot.tsx` | Sem alteração (já corrigido) |

4 linhas alteradas no total. Fix cirúrgico.

