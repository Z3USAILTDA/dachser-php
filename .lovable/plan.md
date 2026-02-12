

## Visualizacao Clara de ARR Destino vs Conexao no Tracking Aereo

### Problema Atual

Quando uma AWB tem status "ARR", o sistema ja diferencia entre "ARR - DESTINO" (chegou no aeroporto final) e "ARR - CONEXAO" (parou em conexao), mas essa informacao so aparece como texto simples na coluna de status e em tooltips ao passar o mouse. Os usuarios nao percebem a diferenca.

### Solucao

Adicionar badges visuais coloridos e distintos para cada tipo de ARR, alem de ajustar a barra de progresso para refletir visualmente que conexao nao e o ponto final.

### Mudancas Visuais

1. **Badge de Status diferenciado**
   - "ARR - DESTINO": badge verde com icone de check, texto "Destino Final"
   - "ARR - CONEXAO": badge laranja/amarelo com icone de escala (ArrowLeftRight), texto "Em Conexao"
   - ARR generico (sem sufixo): mantém o badge azul atual

2. **Barra de progresso ajustada**
   - "ARR - CONEXAO": progresso em 85% (nao 100%), indicando que a carga ainda nao chegou ao destino final. Cor da barra muda para laranja.
   - "ARR - DESTINO": progresso em 100%, cor verde.

3. **Coluna "Situacao"**
   - "ARR - DESTINO": exibe badge verde "Destino Final" com icone de pin/localizacao
   - "ARR - CONEXAO": exibe badge laranja "Em Conexao" com icone de troca

### Detalhes Tecnicos

**Arquivo:** `src/pages/Index.tsx`

**1. Funcao `getTimelineProgress`** (linha ~275):
- Adicionar entrada `"ARR - CONEXÃO": 85` e `"ARR - DESTINO": 100` no `progressMap`
- Verificar o statusCode com sufixo antes de buscar no mapa

**2. Coluna de Status** (linha ~2707):
- Onde hoje exibe `getStatusCode(awb.last_event)` como texto verde simples, adicionar logica condicional:
  - Se statusCode === "ARR - DESTINO": renderizar badge verde com icone MapPin e texto "Destino"
  - Se statusCode === "ARR - CONEXAO": renderizar badge laranja com icone ArrowLeftRight e texto "Conexao"
  - Demais: manter comportamento atual

**3. Coluna de Situacao** (linha ~2744):
- Adicionar tratamento especifico para ARR - DESTINO (badge verde "No Destino") e ARR - CONEXAO (badge laranja "Em Trânsito") antes dos checks genericos

**4. Cores da barra de progresso** (area ~2569):
- Quando statusCode for "ARR - CONEXAO", usar gradiente laranja ao inves de verde
- Quando "ARR - DESTINO", usar verde intenso

**5. Cor do aviao na barra**:
- ARR - CONEXAO: aviao laranja
- ARR - DESTINO: aviao verde

