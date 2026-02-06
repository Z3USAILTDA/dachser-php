
# Correção: Interpretar Data com Apenas Mês e Dia (mm/dd) como Ano Atual

## Problema

Na tela de Upload Master, quando uma planilha contém datas no formato abreviado apenas com mês e dia (como `"02/21"`), o sistema não interpreta corretamente e retorna `null`. O esperado é que `"02/21"` seja interpretado como `"2026-02-21"` (usando o ano atual).

## Análise

A função `parseDate` em `src/lib/parseExcelMaster.ts` (linhas 335-392) atualmente reconhece:
- Números Excel (dias desde 1899-12-30)
- Formato `dd/mm/yyyy` ou `dd-mm-yyyy`
- Formato `yyyy-mm-dd`
- Parse nativo do JavaScript

Mas **NÃO reconhece** o formato `mm/dd` (apenas mês e dia sem ano).

## Solução

Adicionar um novo padrão de regex na função `parseDate` para detectar o formato `mm/dd` e usar o ano atual automaticamente.

---

## Alterações Técnicas

### Arquivo: `src/lib/parseExcelMaster.ts`

**Função: `parseDate`** (linhas 335-392)

Adicionar novo padrão **antes do parse nativo** para capturar datas no formato `mm/dd`:

```typescript
export function parseDate(value: unknown): string | null {
  if (!value && value !== 0) return null;
  
  // Data numérica Excel (dias desde 1899-12-30)
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86400000);
    return formatDateTime(date);
  }
  
  if (typeof value === "string") {
    const str = value.trim();
    if (!str) return null;
    
    // Formato dd/mm/yyyy ou dd-mm-yyyy (com ano completo)
    const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (brMatch) {
      const [, d, m, y, hh, mm, ss] = brMatch;
      const date = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(hh || "0"),
        parseInt(mm || "0"),
        parseInt(ss || "0")
      );
      return formatDateTime(date);
    }
    
    // Formato yyyy-mm-dd
    const isoMatch = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (isoMatch) {
      const [, y, m, d, hh, mm, ss] = isoMatch;
      const date = new Date(
        parseInt(y),
        parseInt(m) - 1,
        parseInt(d),
        parseInt(hh || "0"),
        parseInt(mm || "0"),
        parseInt(ss || "0")
      );
      return formatDateTime(date);
    }
    
    // ▼▼▼ NOVO: Formato mm/dd (apenas mês e dia - usa ano atual) ▼▼▼
    const shortMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
    if (shortMatch) {
      const [, first, second] = shortMatch;
      const currentYear = new Date().getFullYear();
      
      // Interpretar como mm/dd (mês/dia)
      const month = parseInt(first);
      const day = parseInt(second);
      
      // Validar se é uma data válida
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const date = new Date(currentYear, month - 1, day, 0, 0, 0);
        // Verificar se a data é válida (ex: 02/30 seria inválida)
        if (date.getMonth() === month - 1 && date.getDate() === day) {
          return formatDateTime(date);
        }
      }
    }
    // ▲▲▲ FIM DA NOVA LÓGICA ▲▲▲
    
    // Tentar parse nativo
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      return formatDateTime(parsed);
    }
  }
  
  if (value instanceof Date) {
    return formatDateTime(value);
  }
  
  return null;
}
```

---

## Exemplos de Comportamento

| Entrada | Interpretação | Resultado |
|---------|---------------|-----------|
| `"02/21"` | Mês 02, Dia 21, Ano 2026 | `"2026-02-21 00:00:00"` |
| `"12/05"` | Mês 12, Dia 05, Ano 2026 | `"2026-12-05 00:00:00"` |
| `"1/7"` | Mês 1, Dia 7, Ano 2026 | `"2026-01-07 00:00:00"` |
| `"02-21"` | Mês 02, Dia 21, Ano 2026 | `"2026-02-21 00:00:00"` |
| `"02/30"` | Inválido (fevereiro não tem 30 dias) | `null` (fallback para parse nativo) |
| `"15/06/2025"` | Formato completo (não alterado) | `"2025-06-15 00:00:00"` |

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/parseExcelMaster.ts` | Adicionar padrão regex para `mm/dd` na função `parseDate` |

---

## Considerações

1. **Interpretação mm/dd**: A lógica assume que o primeiro número é o mês e o segundo é o dia (padrão americano/Excel comum)
2. **Validação de data**: Verifica se a data resultante é válida para evitar datas impossíveis como 02/30
3. **Ano atual**: Usa `new Date().getFullYear()` para obter o ano vigente (2026)
4. **Compatibilidade**: Não afeta os formatos existentes (dd/mm/yyyy, yyyy-mm-dd, números Excel)
5. **Fallback**: Se a validação falhar, continua para o parse nativo do JavaScript
