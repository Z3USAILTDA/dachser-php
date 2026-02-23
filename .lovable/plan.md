

## Melhoria: Badge e Timeline "Novo Master" no Rastreio Aereo

### Resumo

Quando um processo tiver o master (MAWB) atualizado via "Troca de Master", duas coisas acontecerao:

1. Na **tabela principal** de rastreio (/air/tracking), um badge amarelo "Novo Master" aparecera ao lado do AWB
2. Na **timeline de eventos** (modal), um evento sintetico "NOVO MASTER" sera injetado com a data da troca e detalhes do master antigo/novo

### Etapas

**1. Criar tabela de log no MariaDB**

Adicionar uma nova tabela `dados_dachser.t_master_swap_log` para registrar cada troca de master, via olimpo-proxy:

```text
t_master_swap_log
- id (INT AUTO_INCREMENT)
- hawb_number (VARCHAR)
- old_mawb (VARCHAR)
- new_mawb (VARCHAR)
- swapped_by (VARCHAR)
- swapped_at (DATETIME, default NOW())
```

**2. Atualizar olimpo-proxy (swap_master_cadastro_aereo)**

Apos atualizar o `t_cadastro_aereo`, inserir um registro em `t_master_swap_log` para cada HAWB atualizado com sucesso, gravando old_mawb, new_mawb, usuario e timestamp.

**3. Atualizar fetch-status-aereo**

No retorno dos dados, fazer LEFT JOIN com `t_master_swap_log` para verificar se o AWB (MAWB atual) aparece como `new_mawb`. Se sim, adicionar `master_changed: true` no objeto retornado.

**4. Atualizar Index.tsx (tabela de rastreio)**

- Adicionar campo `master_changed?: boolean` na interface `AWBData`
- Mapear o campo no `fetchStatusAereoData`
- Na coluna do AWB (linha ~2634), renderizar um badge "Novo Master" quando `master_changed === true`:

```text
  AWB: 020-12345678  [Novo Master]
```

Badge com estilo amarelo/dourado (bg-amber-500/15, text-amber-400) para destaque visual sem indicar erro.

**5. Atualizar mariadb-proxy (get_awb_tracking_events)**

Apos montar a timeline de eventos, consultar `t_master_swap_log` pelo AWB. Para cada registro encontrado, injetar um evento sintetico na timeline:

```text
codigo_evento: "NOVO_MASTER"
descricao_evento: "Master atualizado: 020-OLD -> 020-NEW"
data_hora_evento: swapped_at
fonte: "SISTEMA"
aeroporto: ""
```

**6. Atualizar AwbTimelineModal**

Adicionar estilo visual para o codigo "NOVO_MASTER":
- Icone: RefreshCw (troca/rotacao)
- Cor: amber/dourado (bg-amber-500/20, text-amber-400)

### Arquivos Modificados

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/olimpo-proxy/index.ts` | Criar tabela + inserir log na acao swap_master |
| `supabase/functions/fetch-status-aereo/index.ts` | LEFT JOIN com t_master_swap_log, retornar master_changed |
| `supabase/functions/mariadb-proxy/index.ts` | Injetar evento sintetico NOVO_MASTER na timeline |
| `src/pages/Index.tsx` | Badge "Novo Master" na coluna AWB |
| `src/components/air/AwbTimelineModal.tsx` | Estilo visual para evento NOVO_MASTER |

### Fluxo Completo

```text
Troca de Master (CadastroNova)
    |
    v
olimpo-proxy: UPDATE t_cadastro_aereo + INSERT t_master_swap_log
    |
    v
fetch-status-aereo: LEFT JOIN t_master_swap_log -> master_changed=true
    |
    v
Index.tsx: Badge [Novo Master] ao lado do AWB
    |
    v
AwbTimelineModal: Evento sintetico "NOVO_MASTER" na timeline
```

