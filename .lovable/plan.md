

## Plano: View de Armadores Mapeados + Botão Cadastro LCL

Este plano adiciona à página "Monitoramento FCL" (ContainerTracking) uma view similar à existente no tracking aéreo para exibir os armadores cadastrados/mapeados, além de um botão para cadastro de containers LCL.

---

### Resumo das Alterações

1. **Botão "Armadores Mapeados"** - Exibe modal com lista de armadores com suporte à API
2. **Botão "Cadastrar LCL"** - Abre dialog para cadastro manual de containers LCL
3. **Modal de Armadores** - Tabela visual mostrando código, nome, país e cores de cada armador
4. **Dialog de Cadastro LCL** - Formulário para cadastro de containers Less than Container Load

---

### Detalhes Técnicos

#### 1. Alterações em ContainerTracking.tsx

**Novos estados:**
```
showArmaodoresModal: boolean
showLclDialog: boolean
```

**Novos botões na seção de filtros (ao lado de "Registrar FT"):**

| Botão | Cor | Ação |
|-------|-----|------|
| Armadores Mapeados (13) | Emerald/Verde | Abre modal com lista dos armadores |
| Cadastrar LCL | Cyan/Azul | Abre dialog de cadastro |

**Modal "Armadores Mapeados":**
- Usa os dados de `getTrackableCarriers()` já existente
- Tabela com colunas: Código, Nome, País
- Badge colorido para cada armador usando as cores de `SHIPPING_LINE_INFO`
- Footer mostrando "13 armadores com integração ativa"

**Dialog "Cadastrar LCL":**
- Campos do formulário:
  - MBL (texto obrigatório)
  - Container (texto obrigatório) 
  - Armador (select com armadores mapeados)
  - Consignee (texto)
  - ETA (date picker)
- Integração: Chamará edge function para salvar no banco

#### 2. Estrutura Visual

```text
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Barra de Filtros                                                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│  [Tipo ▼] [Armador ▼] [Coordenador ▼]                                           │
│                                                                                 │
│  ... botões admin ...                                                           │
│                                                                                 │
│  [🚢 Armadores (13)] [📦 Cadastrar LCL] [⏱ Registrar FT] [🔄 Atualizar]         │
│           ↑ Verde        ↑ Cyan            ↑ Amarelo       ↑ Amarelo            │
└─────────────────────────────────────────────────────────────────────────────────┘
```

#### 3. Arquivos Modificados

| Arquivo | Alterações |
|---------|------------|
| `src/pages/ContainerTracking.tsx` | Adicionar botões, estados, modais e dialog |
| `src/lib/shippingLineMapping.ts` | Nenhuma (utilizar funções existentes) |

#### 4. Componentes Reutilizados

- `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` do shadcn/ui
- `Select`, `SelectContent`, `SelectItem` para dropdown de armador
- `Button`, `Input`, `Label` para formulário

---

### Comportamento Esperado

**Modal de Armadores Mapeados:**
- Clicando no botão "Armadores (13)" abre modal
- Exibe tabela com 13 armadores que possuem integração API (Hapag-Lloyd, MSC, Maersk, etc.)
- Cada linha mostra badge colorido seguindo o padrão visual do `SHIPPING_LINE_INFO`

**Dialog Cadastrar LCL:**
- Clicando em "Cadastrar LCL" abre formulário
- Usuário preenche dados do container LCL manualmente
- Ao submeter, container é adicionado ao monitoramento

---

### Dependências

Nenhuma nova dependência necessária - todas as funcionalidades utilizam componentes já existentes no projeto.

