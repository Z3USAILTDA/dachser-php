

# Correção do Pipeline Multi-Modelo SEA

## Diagnóstico

O pipeline multi-modelo **está funcionando corretamente** -- todas as 3 etapas foram executadas, a tabela `t_sea_analytics_extr` foi criada e os dados foram persistidos. O único problema é na **Etapa 3 (Arbitragem GPT)**, onde o parâmetro `max_tokens: 64000` excede o limite do modelo GPT-4.1 (máximo: 32768).

O sistema usou o fallback do Claude como resultado final, por isso a análise foi concluída com sucesso mas sem a arbitragem do GPT.

## Correção

Alterar `max_tokens` de `64000` para `32000` na chamada do GPT-4.1 dentro da função `runGptArbitration` no arquivo `supabase/functions/sea-submit-analysis/index.ts` (linha 1216).

## Detalhes Técnicos

**Arquivo**: `supabase/functions/sea-submit-analysis/index.ts`

**Mudança**: Linha 1216, trocar `max_tokens: 64000` por `max_tokens: 32000`

Isso é suficiente para que o GPT-4.1 processe a arbitragem corretamente na próxima execução. As outras duas ocorrências de `max_tokens: 64000` (linhas 893 e 1131) são chamadas ao Claude Sonnet 4.5, que suporta 64000 tokens -- essas não precisam mudar.

