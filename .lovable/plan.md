
Diagnóstico

- O frontend do CCT não parece ser o problema.
  - A grid já tenta mostrar `processo.shipment.analista?.nome || processo.shipment.nome_analista_legado || "-"`.
  - O hook `mapRowToProcessoCCT` também monta corretamente o objeto `analista` quando `row.nome_analista` vem preenchido.
- Os logs do navegador mostram que a tela carrega normalmente 180 processos, então não é falha de renderização nem erro 500 agora. O mais provável é que o backend esteja devolvendo `nome_analista` vazio/null.

Por que os analistas não estão aparecendo

1. No `mariadb-proxy`, o analista principal vem de `t_dados_aereo.clerk`.
2. Se vier vazio, existe fallback para:
   - `t_dados_aereo` novamente
   - `t_master_dados.nome_analista`
3. O problema é que esses fallbacks usam comparação exata por `hawb`/`hawb_number`:
   - `WHERE hawb_number IN (...)`
   - `WHERE hawb IN (...)`
4. Na mesma função existe `hawb_normalizado`, e em outras partes do arquivo já há lógica de normalização de HAWB removendo separadores e variações de formato.
5. Então o cenário mais provável é:
   - o processo existe na `t_cct_hawb_api_atual`
   - o analista existe na `t_master_dados`
   - mas o HAWB está em formato diferente entre as tabelas
   - resultado: o lookup não encontra correspondência e o campo chega vazio no frontend

Ponto adicional importante

- O endpoint de detalhe (`get_cct_shipment`) ainda retorna só `sRow.analista || null`, sem reaplicar o fallback de `t_master_dados`.
- Então, mesmo corrigindo a listagem principal, o detalhe pode continuar sem analista se essa parte não for alinhada também.

Plano de correção

1. Ajustar o matching de analista no `get_cct_shipments`
   - usar `hawb_normalizado` como chave preferencial
   - ou normalizar HAWB dos dois lados na query/fallback
2. Aplicar a mesma regra no fallback de:
   - `t_dados_aereo`
   - `t_master_dados`
3. Manter o frontend exatamente como está
   - porque ele já exibe corretamente quando `nome_analista` vem preenchido
4. Alinhar também `get_cct_shipment`
   - para o analista aparecer igual na tela de detalhe

Detalhes técnicos

- Arquivo principal do problema: `supabase/functions/mariadb-proxy/index.ts`
- Trechos críticos:
  - join principal `base_cct` x `aereo_latest`
  - fallback por `missingAnalistaHawbs`
  - endpoint único `get_cct_shipment`
- Sinal de que a causa é lookup e não UI:
  - `src/hooks/useCCTData.ts` e `src/components/cct/ProcessosTable.tsx` já estão preparados para mostrar o analista se ele vier no payload

Resultado esperado após o ajuste

- A tela `/air/cct` passa a mostrar os analistas já existentes na `t_master_dados` mesmo quando o HAWB estiver em formato diferente entre as tabelas.
- A grid e o detalhe ficam consistentes entre si.
