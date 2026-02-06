# Sistema de Coloaders e Filtros LCL/FCL para Monitoramento Marítimo

## Status: ✅ IMPLEMENTADO

## Implementação Realizada

### 1. Banco de Dados (MariaDB)
✅ Adicionadas duas colunas na tabela `t_tracking_sea`:
- `tipo_carga` (ENUM: 'FCL', 'LCL') - Default: 'FCL'
- `coloader` (VARCHAR 255) - Nome do coloader/consolidador

### 2. Edge Function: `olimpo-proxy/index.ts`
✅ Nova action: `setup_lcl_columns` - Migration para criar as colunas
✅ Nova action: `add_lcl_container` - Inserir container LCL com coloader e tipo_carga='LCL'
✅ Atualização de `get_sea_tracking` - Retorna `tipo_carga` e `coloader` na query

### 3. Frontend: `ContainerTracking.tsx`
✅ Interface `MblTrackingData` atualizada com `tipo_carga` e `coloader`
✅ Novo estado `filterTipoCarga` para filtro LCL/FCL
✅ Novo filtro "Tipo Carga" (LCL/FCL/Todos) na barra de filtros
✅ Filtro "Armador" renomeado para "Armador/Coloader"
✅ Lista dinâmica `dynamicArmadoresColoaders` baseada no tipo de carga selecionado
✅ Coluna da tabela mostra coloader com ícone quando tipo_carga='LCL'
✅ Dialog "Cadastrar LCL" - Campo "Armador" renomeado para "Coloader" com hint explicativo
✅ Validação de toast atualizada para "Coloader"

---

## Próximos Passos (Futuro - IA)

Após acúmulo de dados manuais:

1. Criar tabela `t_coloader_patterns` para armazenar padrões detectados
2. Implementar sugestão automática baseada em MBL prefix, origem/destino
3. Exibir sugestão no dialog de cadastro com opção de aceitar ou editar
