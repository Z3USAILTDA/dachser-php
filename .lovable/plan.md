

## Plano: Esconder apenas abas Robô e Pagamentos para usuários sem role

### Objetivo
Apenas as abas **Robô** e **Pagamentos** devem ser restritas. As demais abas (Comprovantes, Histórico Baixas, etc.) continuam visíveis para todos.

### Alteração

**`src/pages/esteira/EsteiraIndex.tsx`**

1. **Filtrar abas no array** (linhas ~1925-1964): Adicionar `.filter()` antes do `.map()` para remover as abas `robo` e `pagamentos` quando `!hasEsteiraAccess`.

2. **Proteger conteúdo** (linhas ~2115 e ~2117-2119): Envolver os renders de `robo` e `pagamentos` com `hasEsteiraAccess &&`.

```text
Antes:
  [...tabs].map(tab => ...)

Depois:
  [...tabs].filter(tab => {
    if ((tab.id === "robo" || tab.id === "pagamentos") && !hasEsteiraAccess) return false;
    return true;
  }).map(tab => ...)
```

### Resultado
Usuários sem role verão todas as abas exceto Robô e Pagamentos. As restrições já feitas em ComprovanteRobot.tsx e EsteiraVoucherDetails.tsx permanecem como estão.

