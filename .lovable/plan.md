
## Remover ícone âmbar — manter apenas o ícone informativo da Azul (577)

### O que existe hoje

Há dois ícones de informação na coluna "Último Status" da tabela em `src/pages/StatusAereoList.tsx`:

1. **Ícone âmbar** (linhas 167–178) — aparece para os prefixos `083`, `147`, `160`, `615`, `865`, `016`, `996` com a mensagem: *"Essa companhia está passando por ajustes, podendo apresentar inconsistência."*

2. **Ícone azul** (linhas 179–190) — aparece para o prefixo `577` (Azul) com a mensagem: *"Rastreio feito por API direta com a companhia."*

### O que será feito

Remover apenas o bloco do ícone âmbar (linhas 167–178), mantendo intacto o ícone azul da Azul.

### Arquivo a editar

- `src/pages/StatusAereoList.tsx` — excluir o bloco `{['083', '147', ...].some(...) && (...)}` entre as linhas 167 e 178.

### Technical details

- Nenhuma alteração de lógica, tipos, hooks ou edge functions.
- O import de `Info` e os componentes `Tooltip*` continuam sendo usados pelo ícone azul remanescente, portanto nenhum import precisa ser removido.
