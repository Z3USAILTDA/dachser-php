
# Plano: Refatorar PDF para Modelo HTML/CSS

## Objetivo
Substituir a geração de PDF via jsPDF por um PDF gerado via HTML/CSS que abre na janela de impressão do browser. Este modelo é mais flexível, visualmente mais bonito e mais fácil de customizar.

---

## Mudanças Propostas

### Arquivo: `src/utils/dbMonitorExport.ts`

Refatorar a função `exportDbMonitorPDF` para:
1. Abrir uma nova janela do browser (`window.open`)
2. Escrever HTML com CSS inline completo
3. Usar estilos modernos com cards, cores e ícones via Unicode
4. Disparar `window.print()` automaticamente

---

## Design do Novo PDF (HTML)

### Estrutura Visual

```text
┌────────────────────────────────────────────────────────────┐
│ [FAIXA AMARELA DACHSER]                                    │
│ RELATÓRIO DE MONITORAMENTO DE DADOS                        │
│ Sistema Z3US.AI                                             │
│ Gerado em: 02/02/2026 às 09:37                              │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ RESUMO EXECUTIVO                                            │
│ ┌──────────────────┐  ┌──────────────────┐                 │
│ │ Processados 24h  │  │ Situação Geral   │                 │
│ │ +5.128           │  │ ● 1 OK           │                 │
│ │                  │  │ ● 0 Atenção      │                 │
│ │                  │  │ ● 3 Crítico      │                 │
│ └──────────────────┘  └──────────────────┘                 │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ SITUAÇÃO POR ÁREA                                           │
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Dados Operacionais                    ● Ação Necessária ││
│ │ Última atualização: há 13 horas       +3 processados    ││
│ └─────────────────────────────────────────────────────────┘│
│ ┌─────────────────────────────────────────────────────────┐│
│ │ Notas Fiscais                         ● Ação Necessária ││
│ │ Última atualização: há 9 horas        +60 processados   ││
│ └─────────────────────────────────────────────────────────┘│
│ ... (outras áreas)                                          │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ O QUE CADA ÁREA REPRESENTA                                  │
│ • Dados Operacionais: Processos de importação e exportação │
│ • Notas Fiscais: Dados para régua de cobrança              │
│ • Vouchers/SPO: Solicitações de pagamento                  │
│ • Baixas Financeiras: Comprovantes processados             │
└────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────┐
│ LEGENDA DE STATUS                                           │
│ 🟢 Atualizado - Dados recebidos nos últimos 5 minutos      │
│ 🟡 Verificar - Sem atualização entre 5 e 60 minutos        │
│ 🔴 Ação Necessária - Sem atualização há mais de 60 minutos │
└────────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### CSS do Novo PDF

```css
body { 
  font-family: Arial, sans-serif; 
  padding: 40px; 
  color: #333;
  max-width: 800px;
  margin: 0 auto;
}

.header { 
  background: #FFC800; 
  color: #1E1E23;
  padding: 20px;
  margin: -40px -40px 30px -40px;
}

.section-title {
  font-weight: bold;
  font-size: 14px;
  margin: 25px 0 15px 0;
  background: #f3f4f6;
  padding: 10px 15px;
  border-left: 4px solid #FFC800;
}

.area-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin-bottom: 10px;
  display: flex;
  justify-content: space-between;
}

.status-badge {
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: bold;
}

.status-green { background: #dcfce7; color: #166534; }
.status-yellow { background: #fef3c7; color: #92400e; }
.status-red { background: #fee2e2; color: #991b1b; }
```

### Estrutura da Função

```typescript
export function exportDbMonitorPDF(stats: DatabaseStats): string {
  const { areas, summary } = transformToExportable(stats);
  
  // Abrir janela de impressão
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("Permita pop-ups para gerar o PDF");
  }
  
  // Escrever HTML
  printWindow.document.write(`
    <html>
      <head>
        <title>Relatório de Monitoramento</title>
        <style>...</style>
      </head>
      <body>
        <!-- Header -->
        <!-- Summary Cards -->
        <!-- Area Cards -->
        <!-- Description Section -->
        <!-- Legend Section -->
      </body>
    </html>
  `);
  
  // Imprimir
  setTimeout(() => {
    printWindow.print();
  }, 300);
  
  return fileName;
}
```

---

## Vantagens do Novo Modelo

| jsPDF (Atual) | HTML/CSS (Novo) |
|---------------|-----------------|
| Layout rígido | Layout flexível com CSS |
| Difícil ajustar | Fácil customizar cores/espaços |
| Texto pode cortar | Texto ajusta automaticamente |
| Sem suporte a emojis | Suporta emojis Unicode |
| Cards retangulares básicos | Cards arredondados, sombras |

---

## Arquivos a Modificar

1. **`src/utils/dbMonitorExport.ts`**
   - Refatorar `exportDbMonitorPDF` para usar HTML/CSS
   - Manter `exportDbMonitorExcel` inalterado

---

## Comportamento Esperado

1. Usuário clica em "PDF"
2. Abre nova janela do browser
3. HTML renderizado com CSS profissional
4. Dialog de impressão abre automaticamente
5. Usuário pode salvar como PDF ou imprimir
