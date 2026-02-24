

## Mover barra de aging para dentro do card da tabela

O objetivo e mover a visualizacao da barra segmentada de aging (com percentuais, valores e badge de % overdue) para dentro do card "Brazil Customer Aging Overview", posicionando-a entre o titulo do card e o cabecalho da tabela -- exatamente como na imagem de referencia.

### Arquivo a modificar

`src/pages/olimpo/OlimpoCobranca.tsx`

### Mudancas

1. **Remover o card separado** de "Aging Distribution Header Card" (linhas 242-310) que hoje aparece como um card independente acima da tabela.

2. **Integrar a barra segmentada dentro do CardHeader** do card da tabela (linhas 312-316). O layout ficara:
   - Titulo "Brazil Customer Aging Overview" no topo
   - Logo abaixo, a barra segmentada colorida com o badge "24%" no canto direito
   - Linha de percentuais alinhados com cada segmento
   - Linha de valores absolutos (formatados) alinhados com cada segmento
   - Depois, o cabecalho da tabela e os dados

O resultado sera um unico card contendo titulo + barra de distribuicao + tabela, como mostrado na imagem de referencia.

