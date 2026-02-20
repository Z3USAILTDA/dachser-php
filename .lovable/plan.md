

# Aumentar Timeout do Polling SEA

## Problema

O pipeline multi-modelo (3 etapas com Claude, Gemini e GPT) demora mais que o timeout atual de 12 minutos configurado no `maritimoApi.ts`. Quando excede, o usuario ve a mensagem de erro "Tempo limite excedido (10 min)".

## Solucao

Aumentar o timeout do polling de 12 minutos para 20 minutos, permitindo tempo suficiente para as 3 etapas do pipeline completarem. A mensagem de timeout tambem sera atualizada para refletir o novo limite.

## Detalhes Tecnicos

**Arquivo**: `src/services/maritimoApi.ts`

1. **Linha 330**: Alterar o timeout padrao de `12 * 60 * 1000` (12 min) para `20 * 60 * 1000` (20 min)
2. **Linha 398**: A mensagem de erro ja e dinamica (usa `Math.round(timeoutMs/1000/60)`), entao se ajustara automaticamente

Essa mudanca afeta todas as paginas que usam o polling: `SubmeterManifestHbl`, `SubmeterHblMbl` e `InvoicesDraftHbl`.

