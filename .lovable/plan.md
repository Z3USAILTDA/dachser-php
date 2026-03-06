

# Corrigir: usar `in_transit` nos cards/filtros, não na coluna Situação

## O que o usuário quer

O flag `in_transit` deve afetar a **contagem dos cards** (Em Trânsito) e o **filtro do card**, não a coluna "Situação". A Situação deve voltar ao comportamento original (Crítico/Atraso/No Prazo).

## Correções em `src/pages/Index.tsx`

### 1. Remover o bloco "Em Trânsito" da coluna Situação (linhas 2899-2908)
Apagar o bloco que força "Em Trânsito" na coluna Situação baseado em `in_transit`. A Situação volta a mostrar apenas Crítico/Atraso/No Prazo como antes.

### 2. Atualizar contagem do card "Em Trânsito" (linhas 2323-2336)
Adicionar `awb.in_transit` como condição alternativa:
```typescript
emTransito={
  statusAereoData.filter((awb) => {
    if (excludedStatuses.includes(awb.status || "")) return false;
    const status = getStatusCode(awb.last_event).toUpperCase();
    return ["DEP", "MAN", "RCF", "ARR", "TRA", "FOH"].includes(status) || awb.in_transit === true;
  }).length
}
```

### 3. Atualizar filtro do card "transito" (linhas 2028-2029)
Mesma lógica no filtro da tabela:
```typescript
case "transito":
  return ["DEP", "MAN", "RCF", "ARR", "TRA", "FOH"].includes(status) || awb.in_transit === true;
```

Isso garante que AWBs como 139-47195142 (BKD atual, mas já teve DEP) apareçam no card "Em Trânsito" e sejam filtrados corretamente, sem alterar a coluna Situação.

