

# Correção: Dois Campos de Novo Container Aparecendo

## Problema Identificado

Quando o modal de cadastro LCL é reaberto e um MBL já cadastrado é digitado:

- O sistema faz o **auto-preenchimento** dos campos (Coloader, Consignee, ETA, Transbordo)
- O campo **"Container"** fica vazio com instrução "Informe o novo container" (destaque cyan)
- O campo **"Novo Container (pós-transbordo)"** também aparece porque `transbordo` foi preenchido

**Resultado:** Dois campos para informar o novo container, causando confusão.

## Causa Raiz

O campo "Novo Container (pós-transbordo)" (linhas 2748-2768) aparece baseado apenas em:

```tsx
{lclFormData.transbordo && (
  <div className="space-y-2 p-3 rounded-lg border border-orange-500/30">
    ...Novo Container (pós-transbordo)...
  </div>
)}
```

Mas quando o MBL é auto-preenchido (`lclAutoFilled = true`), o campo "Container" já está sendo reaproveitado para essa finalidade (com placeholder "Informe o novo container" e destaque cyan).

## Solução

Modificar a condição de exibição do campo "Novo Container (pós-transbordo)" para **não aparecer quando houver auto-preenchimento**:

```tsx
{lclFormData.transbordo && !lclAutoFilled && (
  ...
)}
```

---

## Alteração Técnica

**Arquivo:** `src/pages/ContainerTracking.tsx`

**Linha 2749:** Alterar a condição de exibição

| Antes | Depois |
|-------|--------|
| `{lclFormData.transbordo && (` | `{lclFormData.transbordo && !lclAutoFilled && (` |

---

## Comportamento Esperado

| Cenário | Campo Container | Campo Novo Container |
|---------|-----------------|----------------------|
| Cadastro manual (sem auto-fill) + com transbordo | Aparece normal | Aparece (para preencher pós-transbordo) |
| Auto-fill de MBL existente com transbordo | Aparece com destaque cyan ("Informe o novo container") | **Não aparece** |

---

## Resumo

Uma única linha de código corrige o bug, adicionando `!lclAutoFilled` à condição do campo "Novo Container (pós-transbordo)".

