

# Plano: Integrar t_aereo_cct + Filtro temporal + Ordem de eventos no CCT

## Resumo

Três alterações principais no CCT Dashboard:

1. **Filtro temporal**: Mostrar apenas processos com status DEP ou posterior cujo evento mais recente seja >= ontem (05/03, ou seja, usar sliding window de 1 dia atrás)
2. **Integrar t_aereo_cct como fonte complementar**: Mesclar dados da RFB (pesos, volumes, consignatário, RUC, manuseios especiais, rota, partes envolvidas, frete, status de estoque/manifestação, HAWBs associados) com os dados já existentes do LeadComex e t_aereo_ws_firecrawl
3. **Ordem canônica de eventos CCT**: Informada → Manifestada → Em Área de Transferência → Recepcionada → Em Troca entre Recintos → Em Trânsito Terrestre → Entregue

---

## Detalhamento Técnico

### 1. Filtro temporal no `get_cct_shipments` (mariadb-proxy)

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (action `get_cct_shipments`)

Alterar a query do Step 1 (t_aereo_ws_firecrawl) para usar `scraped_at >= NOW() - INTERVAL 1 DAY` em vez de `INTERVAL 30 DAY`. Isso garante que apenas AWBs com atividade a partir de ontem apareçam. O filtro de status CCT-relevantes (`DEP, ARR, ATA, RCF, ...`) já existe.

### 2. Integrar t_aereo_cct como fonte de dados

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (action `get_cct_shipments`)

Adicionar um Step intermediário após obter os MAWBs do Step 1:

- **Query t_aereo_cct**: Buscar por `identificacao` (formato `XXX-XXXXXXXX`) correspondendo aos AWBs já encontrados
- **Campos a extrair**:
  - `ruc` (Referência Única de Carga)
  - `codigoAeroportoOrigemConhecimento`, `codigoAeroportoDestinoConhecimento` (enriquecer origem/destino)
  - `recintoAduaneiroDestino`
  - `quantidadeVolumesConhecimento` → volume_declarado
  - `pesoBrutoConhecimento` → peso_declarado
  - `indicadorPartesMadeira` (flag fitossanitária)
  - `manuseiosEspeciais` → tratamentos_especiais (parse JSON dos códigos IATA como GCR, HEA)
  - `partesEstoque` → status de manifestação RFB (ex: "Manifestada")
  - Partes envolvidas (consignatário CNPJ, nome) do JSON `partes`
  - `hawbAssociados` → lista de Houses vinculados
  - `frete` → informações financeiras (moeda, forma pagamento, totais)
  - `viagensAssociadas` → número do voo, aeroporto de chegada
  - `dataEmissao`

- **Lógica de merge**: Dados da t_aereo_cct preenchem campos que estejam nulos/vazios. Se o LeadComex já trouxe um status mais avançado na ordem canônica, manter o mais avançado. Se a t_aereo_cct tem um status mais avançado, usar o da t_aereo_cct.

### 3. Ordem canônica de eventos e merge de status

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts`

Definir a hierarquia de status CCT para comparação:

```text
INFORMADA (1) → MANIFESTADA (2) → EM_AREA_TRANSFERENCIA (3) → RECEPCIONADA (4) → EM_TROCA_RECINTOS (5) → EM_TRANSITO_TERRESTRE (6) → ENTREGUE (7)
```

Quando houver dados de duas fontes (LeadComex e t_aereo_cct), usar o status com índice MAIOR (mais avançado). Se ambos retornarem o mesmo status, nada muda.

Mapear `partesEstoque.situacao` da t_aereo_cct para a hierarquia:
- "Manifestada" → MANIFESTADA
- "Informada" / "Chegada informada" → INFORMADA
- "Recepcionada" → RECEPCIONADA
- "Entregue" → ENTREGUE
- etc.

### 4. Enriquecer dados na UI

**Arquivo**: `src/hooks/useCCTData.ts` (mapRowToProcessoCCT)

Adicionar novos campos do backend ao mapeamento:
- `ruc`, `recinto_aduaneiro`, `numero_voo`, `data_emissao`, `indicador_madeira`, `info_frete`

**Arquivo**: `src/types/cct.ts`

Adicionar campos opcionais ao `CCTShipment`:
- `ruc?: string`
- `recinto_aduaneiro?: string`  
- `numero_voo?: string`
- `data_emissao?: string`
- `indicador_madeira?: boolean`
- `info_frete?: { moeda: string; formaPgto: string; total: number } | null`

**Arquivo**: `src/pages/cct/ProcessoTimeline.tsx` ou componente de detalhes

Exibir os novos campos nas seções de detalhes do processo.

### 5. Atualizar `get_cct_events` para incluir eventos da t_aereo_cct

**Arquivo**: `supabase/functions/mariadb-proxy/index.ts` (action `get_cct_events`)

Além de buscar em `t_cct_eventos_historico`, também extrair eventos a partir de `partesEstoque` da t_aereo_cct (cada mudança de situação é um evento) e mergear com os eventos existentes, removendo duplicatas pelo código do evento.

### Arquivos a modificar

1. `supabase/functions/mariadb-proxy/index.ts` — actions `get_cct_shipments` e `get_cct_events`
2. `src/types/cct.ts` — novos campos no CCTShipment
3. `src/hooks/useCCTData.ts` — mapear novos campos
4. `src/components/cct/ProcessosTable.tsx` — exibir novos dados se relevante

