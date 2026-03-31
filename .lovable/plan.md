

## Alterar nome do remetente do e-mail

### Alteração

**Arquivo:** `supabase/functions/demurrage-send-alert/index.ts` (linha 513)

Trocar:
```
from: "DACHSER CRONOS <alerts@hermes.z3us.ai>"
```
Por:
```
from: "Dachser <alerts@hermes.z3us.ai>"
```

### O que NÃO muda
- Endereço de e-mail (continua `alerts@hermes.z3us.ai`)
- Corpo, assunto, anexo — tudo permanece igual

