

# Melhorias de Visualização do Mapa Olimpo

## Resumo
Substituir os ícones de emoji (✈️ e 🚢) por ícones Font Awesome profissionais com rotação dinâmica baseada no tipo de operação (importação/exportação), e alterar a lógica das rotas para só exibir a linha quando um veículo for selecionado.

---

## Mudanças Visuais

### Ícones Novos

| Tipo | Ícone Atual | Ícone Novo |
|------|-------------|------------|
| Avião Importação | ✈️ | `faPlane` com rotação 120° (apontando para baixo/esquerda) |
| Avião Exportação | ✈️ | `faPlane` com rotação 300° (apontando para cima/direita) |
| Navio | 🚢 | `faShip` |

### Lógica de Rotas
- **Antes**: Todas as linhas/rotas são exibidas para todos os veículos
- **Depois**: Linhas só aparecem quando um veículo é selecionado (clicado)

---

## Implementação Técnica

### Arquivo: `src/pages/Olimpo.tsx`

#### 1. Adicionar imports do Font Awesome (início do arquivo)

```typescript
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlane, faShip } from "@fortawesome/free-solid-svg-icons";
```

#### 2. Determinar se é importação ou exportação

A lógica usará o campo `tipo_label` que já existe nos dados:
- Se contiver "IMPORT" → Importação (avião aponta para baixo: 120°)
- Se contiver "EXPORT" → Exportação (avião aponta para cima: 300°)

#### 3. Alterar criação dos marcadores (linhas ~751-755)

**De:**
```typescript
const el = document.createElement("div");
el.className = "cursor-pointer text-2xl";
el.innerHTML = item.mode === "air" ? "✈️" : "🚢";
el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.5))";
```

**Para:**
```typescript
const el = document.createElement("div");
el.className = "cursor-pointer";
el.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.5))";
el.style.fontSize = "20px";

if (item.mode === "air") {
  // Determina rotação: IMPORT = 120°, EXPORT = 300°
  const isImport = item.tipo_label.toUpperCase().includes("IMPORT");
  const rotation = isImport ? 120 : 300;
  el.innerHTML = `<i class="fa-solid fa-plane" style="color: #7fd0ff; transform: rotate(${rotation}deg);"></i>`;
} else {
  el.innerHTML = `<i class="fa-solid fa-ship" style="color: #ffc800;"></i>`;
}
```

#### 4. Mostrar rotas apenas para veículo selecionado

Alterar a lógica de renderização das rotas (linhas ~707-743) para só desenhar a linha quando o `key` do grupo corresponder ao asset selecionado.

**Lógica:**
```typescript
// Só desenha rota se este veículo estiver selecionado
const isSelected = selectedAssetDetails && (
  selectedAssetDetails.asset === item.asset ||
  selectedAssetDetails.flight === item.flight
);

if (isSelected && line.length > 1) {
  // ... código existente para desenhar a rota
}
```

#### 5. Redesenhar mapa quando seleção mudar

Adicionar `selectedAssetDetails` como dependência do useEffect que atualiza o mapa:

```typescript
}, [filteredData, mapboxToken, selectedAssetDetails]);
```

---

## Arquivos Modificados

| Arquivo | Tipo de Mudança |
|---------|-----------------|
| `src/pages/Olimpo.tsx` | Adicionar imports Font Awesome, alterar criação de marcadores, condicionar exibição de rotas |

---

## Resultado Esperado

1. **Ícones profissionais**: Ícones Font Awesome substituem emojis
2. **Direção visual**: Aviões de importação apontam "chegando" (120°), exportação apontam "partindo" (300°)
3. **Mapa limpo**: Sem linhas de rota até clicar em um veículo
4. **Foco no selecionado**: Ao clicar, só a rota daquele veículo aparece

