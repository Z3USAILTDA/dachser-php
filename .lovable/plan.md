## Diagnóstico

**Caso reportado:** arquivo `20261883270130520260.119.pdf` → "Voucher não encontrado". O badge mostra `876271039000060` (linha digitável extraída do conteúdo do PDF pelo LLM), e não o SPO real `20261883270` que está embutido no nome do arquivo.

**Voucher real existe** em MariaDB: `numero_spo = 20261883270`, `etapa_atual = ROBO`.

**Duas falhas combinadas em `parse-comprovante-pdf`:**

1. **Filename não foi parametrizado** para extrair `20261883270`:
   - Nome sem extensão: `20261883270130520260.119` (corrida única de 20 dígitos + `.119`).
   - Decomposição correta: `20261883270` (SPO 11) + `13052026` (DDMMYYYY) + `0` (sufixo) + `.119` (sequência).
   - Regex `voucherRemessaFull` exige `^(\d{18,21})\.(\d{1,2})$` — `.119` tem 3 dígitos, não casa.
   - Mesmo aceitando `.119`, a lógica `digits.length - ndLen === 8` não permite o `0` extra entre data e ponto.
   - `collectNumericCandidates` só pega substrings com fronteira não-dígito; numa corrida única de 20 dígitos, não extrai nada.
   - Resultado: nenhum candidato sai do nome.

2. **Caiu no LLM do conteúdo**, que retornou a linha digitável do boleto. **Isso nunca deveria ser usado para identificação** (regra já existente em `mem://vouchers/comprovante-robot-matching-rules`), mas hoje o parser ainda devolve `linhaDigitavel` em `data` e o `RoboTab` (linha 163) faz `push("nd", extracted.linhaDigitavel)` e tenta casar.

## Mudanças propostas

### 1. `supabase/functions/parse-comprovante-pdf/index.ts` — só usar filename

- **Remover toda a etapa de LLM/conteúdo** desta função. O resultado passa a ser sempre o de `extractFromFilename`. Isso elimina a janela em que `linhaDigitavel` (ou qualquer texto do PDF) vira candidato.
- Manter o campo `linhaDigitavel` no schema de retorno **sempre `null`** (compatibilidade com chamadores), mas garantir que **nunca seja preenchido** a partir do conteúdo.
- Remover do log e do header o trecho "Extração via LLM/conteúdo".

### 2. Parametrizar o filename para o caso `20261883270130520260.119.pdf`

Em `extractFromFilename`:

a. Trocar `^(\d{18,21})\.(\d{1,2})$` por `^(\d{18,22})\.(\d{1,3})$` (aceita `.119`, `.999`).

b. No loop de `voucherRemessaFull`, em vez de exigir `digits.length - ndLen === 8`, varrer `ndLen ∈ {10,11,12,13}` × `extra ∈ {0,1,2}`:
   - condição: `digits.length - ndLen - 8 === extra`
   - validar `digits.slice(ndLen, ndLen+8)` como DDMMYYYY plausível
   - validar `ndCandidate.startsWith('20')`
   - adicionar o candidato em **ambos** os mapas (SPO e ND) com score `95 + ndLen` (104–108), pois nesse padrão o número antes da data tanto pode ser SPO quanto ND.

c. Adicionar fallback posicional para corridas longas (>14 dígitos puramente numéricas): varrer toda janela de 8 dígitos plausível como data; o prefixo de 10–13 dígitos começando com `20` vira candidato SPO/ND com score 90.

### 3. `src/components/tabs/RoboTab.tsx` — não tentar linha digitável

- Remover a linha `push("nd", extracted.linhaDigitavel);` (linha 163). Mesmo que o backend nunca mais devolva, defesa em profundidade.
- Atualizar comentário da prioridade para refletir: ND principal → demais ND → SPO principal → demais SPO. Sem linha digitável.

### 4. Memória

- Atualizar `mem://vouchers/comprovante-robot-matching-rules` para reforçar: **identificação do robô vem exclusivamente do nome do arquivo** (parser do filename), nunca do conteúdo do PDF nem da linha digitável.
- Criar memória curta `mem://vouchers/parser-filename-pattern-spo-date-suffix` documentando o padrão `<SPO/ND><DDMMYYYY>[sufixo 0-2 dígitos].<seq 1-3>`.

## Fora de escopo

- `extract-boleto-barcode` (continua existindo para outras telas onde o usuário explicitamente pede leitura de boleto — não é usado pelo robô).
- `mariadb-proxy`, banco, UI fora do `RoboTab`.

## Verificação após implementar

Filenames de regressão (devem continuar casando):
- `20261883270130520260.119.pdf` → SPO `20261883270` (novo)
- `2026377674530042026.13.pdf` → ND `20263776745`
- `2025156579326122025.53.pdf` → ND `2025156579`
- `101-286102D26122025.35.pdf` → SPO `286102`
- `101-286105.pdf` → SPO `286105`

Conferir via `console.log` da função após upload de cada caso.

## Arquivos afetados

- `supabase/functions/parse-comprovante-pdf/index.ts`
- `src/components/tabs/RoboTab.tsx` (1 linha)
- `.lovable/memory/vouchers/comprovante-robot-matching-rules.md` (atualizar)
- `.lovable/memory/vouchers/parser-filename-pattern-spo-date-suffix.md` (novo)
- `.lovable/memory/index.md` (entrada nova)
