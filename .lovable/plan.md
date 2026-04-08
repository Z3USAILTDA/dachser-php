

## Plano: Polir tabela de Faturas Detalhadas

### Alterações — `ClientDetailSheet.tsx`

**Reduzir para 6 colunas essenciais:**
- **ND** (em vez de NF)
- Vencimento
- Valor (formatado BRL)
- Disputa (badge colorido)
- Cond. Pagamento
- Vendedor

Remover da tabela: Documento, NF, Ref. Cliente, Tipo, Emissão, Processo.

**Visual polish:**
- Usar componentes `Table`/`TableHeader`/`TableRow`/`TableCell` do design system
- Badge de disputa refinado (emerald/rose)
- Hover suave, espaçamento confortável
- Reduzir sheet para `sm:max-w-3xl`

### Arquivo alterado
| Arquivo | Alteração |
|---------|-----------|
| `src/components/olimpo/ClientDetailSheet.tsx` | Simplificar tabela para 6 colunas (ND, Vencimento, Valor, Disputa, Cond. Pagamento, Vendedor), usar componentes Table do design system |

