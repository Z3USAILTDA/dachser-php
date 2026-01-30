

# Tela de Monitoramento de Tabelas do Banco de Dados (ADMIN)

## Visão Geral

Nova página administrativa para visualizar estatísticas das tabelas principais do banco `dados_dachser`:
- `t_master_dados` (com divisão por modal AIR/SEA)
- `t_dados_financeiro_nfs`
- `t_dados_financeiro_voucher`
- `tbaixas`

## Design da Interface

A página terá uma estrutura de cards organizados em grid, cada um representando uma tabela:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  DACHSER - Intelligent Logistics – Monitoramento de Dados               │
│  ← Voltar                                              @usuario  [Sair] │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  t_master_dados                                                  │   │
│  │  ─────────────────────────────────────────────────────────────── │   │
│  │  Última Atualização Geral:  há 2 minutos (30/01/2026 14:32)     │   │
│  │  Total de Registros:        245.832                              │   │
│  │                                                                  │   │
│  │  Aplicações:  [AIR]  [SEA]  [CCT]  [TRACKING]                   │   │
│  │                                                                  │   │
│  │  ┌─────────────────────┐  ┌─────────────────────┐                │   │
│  │  │      MODAL AIR      │  │      MODAL SEA      │                │   │
│  │  │  ───────────────────│  │  ───────────────────│                │   │
│  │  │  AIR IMPORT: 85.432 │  │  SEA IMPORT: 45.200 │                │   │
│  │  │  AIR EXPORT: 42.100 │  │  SEA EXPORT: 73.100 │                │   │
│  │  │  Última: há 5min    │  │  Última: há 2min    │                │   │
│  │  └─────────────────────┘  └─────────────────────┘                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────┐  ┌─────────────────────────────┐       │
│  │  t_dados_financeiro_nfs    │  │  t_dados_financeiro_voucher │       │
│  │  ──────────────────────────│  │  ────────────────────────── │       │
│  │  Última: há 15 minutos     │  │  Última: há 3 minutos       │       │
│  │  Total: 12.543 registros   │  │  Total: 8.721 registros     │       │
│  │                            │  │                             │       │
│  │  Aplicações: [REGUA]       │  │  Aplicações: [ESTEIRA]      │       │
│  └─────────────────────────────┘  └─────────────────────────────┘       │
│                                                                         │
│  ┌─────────────────────────────┐                                        │
│  │  tbaixas                   │                                        │
│  │  ──────────────────────────│                                        │
│  │  Última: há 1 hora         │                                        │
│  │  Total: 5.234 registros    │                                        │
│  │                            │                                        │
│  │  Aplicações: [ESTEIRA]     │                                        │
│  └─────────────────────────────┘                                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Mapeamento de Aplicações por Tabela

| Tabela | Aplicações que Utilizam |
|--------|-------------------------|
| `t_master_dados` | AIR (Check AWB, Tracking, CCT), SEA (Análise Documental, Tracking FCL, Demurrage), OLIMPO |
| `t_dados_financeiro_nfs` | Régua de Cobrança |
| `t_dados_financeiro_voucher` | Esteira de Vouchers/SPO |
| `tbaixas` | Esteira de Vouchers (Comprovantes) |

## Arquivos a Criar/Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/admin/DatabaseMonitor.tsx` | Criar (página principal) |
| `supabase/functions/fetch-database-stats/index.ts` | Criar (edge function) |
| `src/App.tsx` | Modificar (adicionar rota) |
| `src/pages/Dashboard.tsx` | Modificar (adicionar item no menu ADMIN) |

## Indicadores de Saúde (Atualizado)

| Cor | Condição |
|-----|----------|
| Verde | Atualização nos últimos 5 minutos |
| Amarelo | Atualização entre 5-60 minutos |
| Vermelho | Atualização há mais de 60 minutos |

## Detalhes Técnicos

### Edge Function: `fetch-database-stats`

Consultas SQL para cada tabela:

```sql
-- t_master_dados (geral)
SELECT MAX(data_insert) as last_update, COUNT(*) as total_records
FROM t_master_dados WHERE active = 1;

-- t_master_dados por modal/tipo_processo
SELECT 
  CASE 
    WHEN tipo_processo IN ('AIR IMPORT', 'AIR EXPORT') THEN 'AIR'
    WHEN tipo_processo IN ('SEA IMPORT', 'SEA EXPORT') THEN 'SEA'
  END as modal,
  tipo_processo,
  MAX(data_insert) as last_update,
  COUNT(*) as total_records
FROM t_master_dados WHERE active = 1
GROUP BY modal, tipo_processo;

-- Tabelas financeiras
SELECT MAX(data_insert) as last_update, COUNT(*) as total_records
FROM t_dados_financeiro_nfs;

SELECT MAX(data_insert) as last_update, COUNT(*) as total_records
FROM t_dados_financeiro_voucher;

SELECT MAX(data_insert) as last_update, COUNT(*) as total_records
FROM tbaixas;
```

### Estrutura de Dados

```typescript
interface DatabaseStats {
  t_master_dados: {
    lastUpdate: string | null;
    totalRecords: number;
    byModal: {
      AIR: {
        lastUpdate: string | null;
        totalRecords: number;
        breakdown: {
          "AIR IMPORT": { lastUpdate: string | null; count: number };
          "AIR EXPORT": { lastUpdate: string | null; count: number };
        };
      };
      SEA: {
        lastUpdate: string | null;
        totalRecords: number;
        breakdown: {
          "SEA IMPORT": { lastUpdate: string | null; count: number };
          "SEA EXPORT": { lastUpdate: string | null; count: number };
        };
      };
    };
    applications: string[];
  };
  t_dados_financeiro_nfs: {
    lastUpdate: string | null;
    totalRecords: number;
    applications: string[];
  };
  t_dados_financeiro_voucher: {
    lastUpdate: string | null;
    totalRecords: number;
    applications: string[];
  };
  tbaixas: {
    lastUpdate: string | null;
    totalRecords: number;
    applications: string[];
  };
}
```

### Função de Indicador de Saúde

```typescript
function getHealthStatus(lastUpdate: string | null): 'green' | 'yellow' | 'red' {
  if (!lastUpdate) return 'red';
  
  const now = new Date();
  const updateTime = new Date(lastUpdate);
  const diffMinutes = (now.getTime() - updateTime.getTime()) / (1000 * 60);
  
  if (diffMinutes <= 5) return 'green';
  if (diffMinutes <= 60) return 'yellow';  // Atualizado para 60 minutos
  return 'red';
}
```

### Badges de Aplicação

| Módulo | Estilo |
|--------|--------|
| AIR | `bg-blue-500/20 text-blue-400 border-blue-500/30` |
| SEA | `bg-cyan-500/20 text-cyan-400 border-cyan-500/30` |
| FIN | `bg-green-500/20 text-green-400 border-green-500/30` |
| CCT | `bg-purple-500/20 text-purple-400 border-purple-500/30` |
| OLIMPO | `bg-amber-500/20 text-amber-400 border-amber-500/30` |
| REGUA | `bg-orange-500/20 text-orange-400 border-orange-500/30` |
| ESTEIRA | `bg-pink-500/20 text-pink-400 border-pink-500/30` |

### Formatação de Datas

Usando `date-fns` com locale `ptBR`:
- Relativo: "há 2 minutos", "há 1 hora"
- Absoluto: "30/01/2026 14:32"

### Rota

```typescript
// src/App.tsx
<Route path="/admin/database" element={<DatabaseMonitor />} />
```

### Menu no Dashboard

Adicionar no array `children` do menu ADMIN:
```typescript
{
  label: "Monitoramento de Dados",
  href: "/admin/database",
}
```

