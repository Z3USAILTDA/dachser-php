

## Plano: Sincronizar filtro de companhias e CIAs Monitoradas com todos os prefixos que possuem link

### Problema
O `urlBuilders` tem 33 companhias com link de rastreio, mas o filtro de companhias (`airlines`) tem apenas 12 e o modal de CIAs Monitoradas (`monitoredAirlinesData`) tem apenas 16. Vários prefixos com link não aparecem em nenhum dos dois.

### Alteração

**`src/pages/air/TrackingAereo.tsx`**

1. **`airlines` (lista de filtro)** — Substituir pela lista completa de 33 companhias, ordenada por código:

| Código | Nome |
|--------|------|
| 001 | American Airlines Cargo |
| 006 | Delta Cargo |
| 014 | Air Canada Cargo |
| 016 | United Cargo |
| 020 | Lufthansa Cargo |
| 045 | LATAM Cargo |
| 047 | TAP Air Portugal Cargo |
| 055 | ITA Airways Cargo |
| 057 | Air France Cargo |
| 074 | KLM Cargo |
| 075 | IAG Cargo |
| 083 | South African Airways Cargo |
| 086 | Singapore Airlines Cargo |
| 098 | Air India Cargo |
| 118 | Korean Air Cargo |
| 125 | British Airways Cargo |
| 127 | GOL Cargo (Gollog) |
| 139 | Aeroméxico Cargo |
| 147 | ABSA Cargo |
| 157 | Qatar Airways Cargo |
| 160 | Cathay Cargo |
| 172 | Cargolux |
| 176 | Emirates SkyCargo |
| 235 | Turkish Cargo |
| 369 | Atlas Air Cargo |
| 549 | LATAM Cargo (Alt) |
| 577 | Azul Cargo |
| 605 | Sky Airline Cargo |
| 615 | European Air Transport (DHL) |
| 724 | Swiss WorldCargo |
| 729 | Avianca Cargo |
| 881 | Condor Cargo |
| 996 | Air Europa Cargo |

2. **`monitoredAirlinesData`** — Substituir pela mesma lista completa de 33 companhias e atualizar `totalAirlines: 33`.

### Resultado
Todas as companhias com link de rastreio aparecerão no filtro de seleção e no modal de CIAs Monitoradas.

