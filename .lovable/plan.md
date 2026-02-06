

# Plano: Auto-preenchimento e Campo "Novo Container" no Cadastro LCL

## Contexto do Pedido

O usuário solicitou duas melhorias no diálogo de cadastro de containers LCL:

1. **Campo "Novo Container"**: Quando o campo "Transbordo" for preenchido, deve aparecer um campo adicional para informar o novo container (não obrigatório)
2. **Auto-preenchimento inteligente**: Ao reabrir o modal e começar a digitar um MBL que já existe como coloader com transbordo, todos os campos devem ser preenchidos automaticamente, deixando apenas o campo "Novo Container" aberto para input

---

## Análise Técnica

### Estado Atual do Diálogo LCL

O diálogo atual (`ContainerTracking.tsx`, linhas 2460-2611) contém os campos:
- MBL* (obrigatório)
- Container* (obrigatório)  
- Coloader* (obrigatório)
- Consignee (opcional)
- ETA (opcional)
- Transbordo (opcional)

O estado do formulário é gerenciado por:
```typescript
const [lclFormData, setLclFormData] = useState({
  mbl: '',
  container: '',
  armador: '', // coloader
  consignee: '',
  eta: '',
  transbordo: ''
});
```

### Dados Disponíveis para Auto-preenchimento

A lista `mblList` contém todos os MBLs carregados com os campos:
- `mbl_id`: ID do MBL
- `tipo_carga`: 'FCL' ou 'LCL'
- `coloader`: Nome do coloader
- `consignee`: Consignatário
- `eta`: Data estimada
- `transshipment_port`: Porto(s) de transbordo

---

## Alterações Técnicas

### 1. Frontend: `src/pages/ContainerTracking.tsx`

**1.1 Adicionar novo campo ao estado do formulário:**

```typescript
const [lclFormData, setLclFormData] = useState({
  mbl: '',
  container: '',
  armador: '',
  consignee: '',
  eta: '',
  transbordo: '',
  novoContainer: '' // NOVO: container após transbordo
});
```

**1.2 Lógica de auto-preenchimento no input de MBL:**

Adicionar um `useEffect` ou handler `onBlur`/`onChange` que verifica se o MBL digitado já existe como LCL com transbordo:

```typescript
// Dentro do componente, após os estados
const handleMblChange = (value: string) => {
  const mblUpper = value.toUpperCase();
  setLclFormData(prev => ({ ...prev, mbl: mblUpper }));
  
  // Verifica se o MBL existe na lista de LCLs com transbordo
  if (mblUpper.length >= 6) {
    const existingLcl = mblList.find(m => 
      m.tipo_carga === 'LCL' && 
      m.mbl_id.startsWith(mblUpper) && 
      m.transshipment_port
    );
    
    if (existingLcl) {
      // Auto-preenche todos os campos exceto novoContainer
      setLclFormData(prev => ({
        ...prev,
        mbl: existingLcl.mbl_id,
        container: '', // Limpa - usuário vai preencher o novo
        armador: existingLcl.coloader || '',
        consignee: existingLcl.consignee || '',
        eta: existingLcl.eta || '',
        transbordo: existingLcl.transshipment_port || '',
        novoContainer: '' // Campo novo para preenchimento
      }));
    }
  }
};
```

**1.3 Exibir campo "Novo Container" condicionalmente:**

Após o campo "Transbordo", adicionar:

```tsx
{/* Campo Novo Container - aparece quando há transbordo */}
{lclFormData.transbordo && (
  <div className="space-y-2">
    <Label className="text-white flex items-center gap-2">
      <ArrowLeftRight className="w-4 h-4 text-orange-400" />
      Novo Container (pós-transbordo)
    </Label>
    <Input 
      placeholder="Ex: MSCU1234567" 
      value={lclFormData.novoContainer} 
      onChange={e => setLclFormData(prev => ({
        ...prev,
        novoContainer: e.target.value.toUpperCase()
      }))} 
      className="bg-[rgba(0,0,0,.3)] border-[rgba(255,255,255,.14)] text-white placeholder:text-gray-500"
    />
    <span className="text-xs text-gray-500">
      Container atribuído após o transbordo (opcional)
    </span>
  </div>
)}
```

**1.4 Atualizar envio do formulário:**

Modificar a chamada à API para incluir o novo container:

```typescript
body: JSON.stringify({
  mbl_id: lclFormData.mbl,
  container: lclFormData.novoContainer || lclFormData.container, // Usa novo container se preenchido
  shipping_line: lclFormData.armador,
  consignee: lclFormData.consignee,
  eta: lclFormData.eta || null,
  transbordo: lclFormData.transbordo || null,
  container_original: lclFormData.container // Mantém referência ao original
})
```

**1.5 Reset do formulário ao cancelar/fechar:**

```typescript
setLclFormData({
  mbl: '',
  container: '',
  armador: '',
  consignee: '',
  eta: '',
  transbordo: '',
  novoContainer: ''
});
```

---

### 2. Backend (opcional): `supabase/functions/olimpo-proxy/index.ts`

Se necessário armazenar o container original como referência:

```typescript
// Dentro de add_lcl_container
const { mbl_id, container, shipping_line, consignee, eta, transbordo, container_original } = body;

// O container_original pode ser armazenado em um campo adicional ou log
// Por enquanto, apenas o novo container será inserido na tabela
```

---

## Fluxo de Usuário

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUXO: CADASTRO LCL COM TRANSBORDO                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Cenário 1: Cadastro Inicial (sem MBL existente)                          │
│   ──────────────────────────────────────────────────────────────────────   │
│                                                                             │
│   1. Usuário clica em "Cadastrar LCL"                                      │
│   2. Preenche MBL, Container, Coloader, Consignee, ETA                     │
│   3. Preenche campo "Transbordo" (ex: SGSIN)                               │
│   4. Campo "Novo Container" APARECE (opcional)                             │
│   5. Usuário pode ou não preencher                                         │
│   6. Clica "Cadastrar LCL"                                                 │
│                                                                             │
│   Cenário 2: Cadastro de Novo Container (MBL LCL já existe)                │
│   ──────────────────────────────────────────────────────────────────────   │
│                                                                             │
│   1. Usuário clica em "Cadastrar LCL"                                      │
│   2. Digita início do MBL (ex: "HLCU241")                                  │
│   3. Sistema detecta MBL existente como LCL com transbordo                 │
│   4. AUTO-PREENCHE:                                                        │
│      - MBL completo                                                         │
│      - Coloader                                                             │
│      - Consignee                                                            │
│      - ETA                                                                  │
│      - Transbordo                                                           │
│   5. Campo "Container" fica vazio (novo container)                         │
│   6. Campo "Novo Container" aparece automaticamente                        │
│   7. Usuário preenche apenas o novo container                              │
│   8. Clica "Cadastrar LCL"                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Resumo de Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/ContainerTracking.tsx` | Estado `lclFormData` com `novoContainer`, lógica de auto-preenchimento, campo condicional no dialog |

---

## Considerações

1. **Busca por prefixo**: O auto-preenchimento será acionado quando o usuário digitar pelo menos 6 caracteres do MBL (para evitar buscas prematuras)

2. **Prioridade do Container**: Se o campo "Novo Container" estiver preenchido, ele será usado; caso contrário, será usado o campo "Container" original

3. **Indicador visual**: Quando ocorrer o auto-preenchimento, os campos preenchidos podem ter uma borda diferenciada (verde suave) para indicar que foram auto-preenchidos

