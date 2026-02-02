

# Plano: Adicionar Colunas de Método de Coleta e API no Modal de Companhias Monitoradas

## Resumo
Adicionar duas novas colunas ao modal de "Companhias Aéreas Monitoradas" na tela de rastreio aéreo (`/`), visíveis apenas para usuários administradores:
1. **Método de Coleta** - Indica como os dados são obtidos (scraping de agregador, site oficial com Firecrawl, ou API direta)
2. **Tem API** - Checkbox indicando se a companhia tem integração direta (sem Firecrawl)

---

## Alterações

### 1. Atualizar estrutura de dados das companhias monitoradas

**Arquivo:** `src/pages/Index.tsx` (linhas 1346-1396)

Modificar o array `monitoredAirlines` dentro do `useMemo` para incluir os novos campos:

```typescript
interface MonitoredAirline {
  code: string;
  name: string;
  method: 'aggregator' | 'official_scraping' | 'direct_api';
  hasDirectApi: boolean;
}
```

Mapeamento baseado na sua análise:

| Código | Método | Tem API |
|--------|--------|---------|
| 001, 014, 016, 074, 057, 083, 112, 118, 147, 160, 615, 827, 865, 999 | aggregator | Não |
| 996 | aggregator | Não |
| 023, 139 | official_scraping | Não |
| 020, 045, 047, 055, 075, 125, 127, 157, 172, 176, 202, 235, 318, 369, 549, 577, 605, 724, 729, 805 | direct_api | Sim |

---

### 2. Adicionar verificação de administrador

**Arquivo:** `src/pages/Index.tsx`

Adicionar um `useMemo` para verificar se o usuário logado é admin:

```typescript
const isAdmin = useMemo(() => {
  try {
    const storedUser = localStorage.getItem("user") || localStorage.getItem("dachser_user");
    if (storedUser) {
      const parsed = JSON.parse(storedUser);
      return parsed.is_admin === 1 || parsed.is_admin === "1" || parsed.is_admin === true;
    }
  } catch {
    return false;
  }
  return false;
}, []);
```

---

### 3. Atualizar o Modal com as novas colunas

**Arquivo:** `src/pages/Index.tsx` (linhas 2836-2879)

Modificar o modal para:

- Adicionar cabeçalhos condicionais (apenas admin):
  - "Método de Coleta"
  - "API Direta"

- Adicionar células condicionais com:
  - Badge colorido para o método (Ex: verde para API direta, amarelo para scraping, laranja para agregador)
  - Checkbox desabilitado mostrando se tem API ou não

```text
┌─────────┬────────────────────────┬──────────────────────┬───────────┐
│ Código  │ Companhia Aérea        │ Método de Coleta     │ API Direta│
├─────────┼────────────────────────┼──────────────────────┼───────────┤
│ 001     │ American Airlines      │ 🟠 Agregador         │    ☐      │
│ 020     │ Lufthansa Cargo        │ 🟢 API Direta        │    ☑      │
│ 023     │ FedEx Express          │ 🟡 Site Oficial      │    ☐      │
└─────────┴────────────────────────┴──────────────────────┴───────────┘
```

---

## Detalhes Técnicos

### Labels para Métodos de Coleta:
- `aggregator` → "Agregador + Firecrawl" (badge laranja)
- `official_scraping` → "Site Oficial + Firecrawl" (badge amarelo)
- `direct_api` → "API/HTML Direto" (badge verde)

### Mapeamento Completo das Companhias:

**Agregador + Firecrawl (14 cias):**
- 001-American Airlines, 014-Air Canada, 016-United, 074/057-AFKL, 083-SAA, 112-China Cargo, 118-TAAG, 147-Royal Air Maroc, 160-Cathay, 615-DHL Aviation, 827-RUSA, 865-MasAir, 996-Air Europa, 999-Air China

**Site Oficial + Firecrawl (2 cias):**
- 023-FedEx, 139-Aeromexico

**API/HTML Direto (17 cias):**
- 020-Lufthansa, 045/549-LATAM, 047-TAP, 055-ITA, 075/125-IAG, 127-GOLLOG, 157-Qatar, 172-Cargolux, 176-Emirates, 235-Turkish, 318-SKY Carga, 369-Atlas Air, 577-Azul, 605-SKY Chile, 724-Swiss, 729/202-Avianca, 805-GSA Force

### Estilo Visual:

- Largura do modal: aumentar de `max-w-2xl` para `max-w-4xl` (admin) ou manter `max-w-2xl` (usuário comum)
- Badge de método com cores:
  - Verde (`bg-emerald-500/20 text-emerald-400`): API Direta
  - Amarelo (`bg-yellow-500/20 text-yellow-400`): Site Oficial
  - Laranja (`bg-orange-500/20 text-orange-400`): Agregador
- Checkbox desabilitado com estilo visual de check/uncheck

---

## Resumo das Alterações de Arquivos

| Arquivo | Tipo de Alteração |
|---------|-------------------|
| `src/pages/Index.tsx` | Modificar `monitoredAirlinesData`, adicionar `isAdmin`, expandir modal UI |

