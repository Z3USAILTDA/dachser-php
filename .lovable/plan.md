

## Plano: Aumentar timeout do `sea-tracking-cron` para máximo

O Edge Functions tem um limite máximo de **300 segundos** (5 minutos) — não é possível remover completamente o timeout, mas podemos configurar o máximo permitido.

### Alteração

**`supabase/config.toml`** — linha 299-300, adicionar `timeout = 300`:

```toml
[functions.sea-tracking-cron]
verify_jwt = false
timeout = 300
```

Isso dá 5 minutos para a função completar todos os 5 passos da orquestração, que é o máximo suportado pela plataforma.

### Arquivo alterado
- `supabase/config.toml` — timeout = 300 no bloco `sea-tracking-cron`

