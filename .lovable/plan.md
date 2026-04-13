

## Plano: Limpeza automática de cache do navegador

### Problema
Após atualizações do sistema, usuários podem ver versões antigas por causa do cache do navegador.

### Estratégia
Implementar um sistema de versionamento + limpeza de cache em 3 camadas:

### Alterações

**1. `src/utils/cacheControl.ts`** (novo arquivo)
- Criar constante `APP_VERSION` com timestamp do build
- Função `checkAndClearCache()` que:
  - Compara a versão salva em `localStorage` com `APP_VERSION`
  - Se diferente, limpa caches do Service Worker (`caches.delete()`), limpa `sessionStorage`, e força reload
  - Salva a nova versão no `localStorage`

**2. `src/main.tsx`**
- Importar e executar `checkAndClearCache()` antes do `createRoot`, para que a limpeza aconteça antes da app renderizar

**3. `vite.config.ts`**
- Adicionar `define: { __APP_VERSION__: JSON.stringify(Date.now().toString()) }` para injetar versão no build automaticamente

**4. `index.html`**
- Adicionar meta tags de cache control:
  ```html
  <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
  <meta http-equiv="Pragma" content="no-cache" />
  <meta http-equiv="Expires" content="0" />
  ```

### Resultado
A cada novo deploy, o sistema detecta mudança de versão e limpa todo cache automaticamente, garantindo que usuários sempre vejam a versão mais recente.

