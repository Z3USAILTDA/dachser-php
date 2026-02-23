

## Adicionar opcao manual "Forcar Novo Master" na tabela de rastreio

### Objetivo

Permitir que o usuario force manualmente a marcacao de "Novo Master" em qualquer AWB da tabela de rastreio, inserindo um registro em `t_master_swap_log` via `olimpo-proxy`. Isso permite testar visualmente o badge e o evento sintetico na timeline sem precisar de uma troca real de master.

### Etapas

**1. Nova acao no olimpo-proxy: `force_master_swap_log`**

Criar uma acao simples que recebe `awb` (MAWB atual), `old_mawb` (valor ficticio ou informado), e `hawb` opcional. Ela insere diretamente em `t_master_swap_log` sem precisar atualizar `t_cadastro_aereo`.

Parametros:
- `awb` - o MAWB atual (sera gravado como `new_mawb`)
- `old_mawb` - o master antigo (pode ser informado ou gerado como "000-00000000")
- `hawb` - opcional

**2. Atualizar Index.tsx**

Na coluna de acoes de cada linha (onde ja existem os botoes "Ver Timeline" e "Abrir Rastreio Externo"), adicionar um terceiro botao com icone `RefreshCw` e tooltip "Forcar Novo Master".

Ao clicar:
- Abre um pequeno dialog pedindo o "Master antigo" (com valor padrao "000-00000000")
- Ao confirmar, chama `olimpo-proxy` com a acao `force_master_swap_log`
- Exibe toast de sucesso
- Recarrega os dados (`fetchStatusAereoData`) para o badge aparecer

**3. Recarregar dados apos a insercao**

Apos a insercao bem-sucedida, a funcao `fetchStatusAereoData` sera chamada novamente para que o `LEFT JOIN` com `t_master_swap_log` retorne `master_changed: true` e o badge "Novo Master" apareca imediatamente.

### Detalhes tecnicos

| Arquivo | Alteracao |
|---|---|
| `supabase/functions/olimpo-proxy/index.ts` | Nova acao `force_master_swap_log` que insere em `t_master_swap_log` |
| `src/pages/Index.tsx` | Botao "Forcar Novo Master" na coluna de acoes + dialog simples + chamada ao olimpo-proxy + reload dos dados |

### Fluxo

```text
Usuario clica "Forcar Novo Master" no AWB 020-12345678
    |
    v
Dialog: informa master antigo (default: 000-00000000)
    |
    v
olimpo-proxy (force_master_swap_log): INSERT INTO t_master_swap_log
    |
    v
Reload fetchStatusAereoData -> master_changed = true
    |
    v
Badge [Novo Master] aparece + evento sintetico na timeline
```

