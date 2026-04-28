# Ajustes na Esteira do Voucher

## 1. Renomear título do botão/modal "Fornecedores sem Fiscal"

**Arquivo:** `src/components/esteira/FornecedoresSemFiscalDialog.tsx`

- Alterar o label do trigger padrão de:
  - `"Ver fornecedores que não precisam da etapa Fiscal"`
  - para: `"Documentos em nome do cliente - Ver fornecedores que não precisam da etapa Fiscal"`
- Manter o `DialogTitle` interno como está (ou ajustar para refletir o novo contexto, se preferir).

## 2. Adicionar campo "Origem do Processo" no Editar Voucher (Operacional)

**Arquivo:** `src/components/esteira/EditVoucherDialog.tsx`

- Adicionar o campo `origemProcesso` (AIR / SEA / CHB / ROD) no formulário de edição, replicando o padrão de botões usado no `CreateVoucherDialog.tsx` (linhas ~1003).
- Persistir via `update_voucher` no MariaDB através do mariadb-proxy, salvando em `origem_processo` na `t_dados_financeiro_voucher`.
- Pré-popular com o valor atual do voucher (`voucher.origemProcesso`).

## 3. Migrar lista de "Fornecedores sem Fiscal" do hardcode para tabela + permitir Fiscal cadastrar

### 3.1 Banco de dados (MariaDB via migration no mariadb-proxy)

Criar tabela `t_voucher_fornecedores_sem_fiscal`:
```sql
CREATE TABLE t_voucher_fornecedores_sem_fiscal (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cnpj VARCHAR(20) NOT NULL UNIQUE,
  nome VARCHAR(255) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  active TINYINT(1) DEFAULT 1
) COLLATE=utf8mb4_unicode_ci;
```

Seed inicial: importar os 37 registros atuais de `src/data/fornecedoresSemFiscal.ts`.

### 3.2 Edge function (`mariadb-proxy`)

Adicionar 3 actions:
- `get_fornecedores_sem_fiscal` — lista todos onde `active = 1`.
- `add_fornecedor_sem_fiscal` — recebe `{ cnpj, nome }`, valida CNPJ não-duplicado, registra `created_by`. Permitido apenas para roles `FISCAL`, `GESTOR_FISCAL`, `ADMIN`.
- `remove_fornecedor_sem_fiscal` — soft delete (`active = 0`). Mesmas roles.

### 3.3 Frontend

**`src/components/esteira/FornecedoresSemFiscalDialog.tsx`:**
- Substituir importação de `FORNECEDORES_SEM_FISCAL` por hook que busca da edge function.
- Adicionar formulário no topo (visível apenas para Fiscal/Gestor/Admin via `useUserRole`) com campos CNPJ + Nome e botão "Adicionar".
- Adicionar botão de remover por linha (mesmas roles).
- Manter lógica de busca/filtragem.

**Locais que usam `FORNECEDORES_SEM_FISCAL` para roteamento (pular Fiscal):**
- Verificar `src/utils/voucherAjusteRouting.ts` e `CreateVoucherDialog`/fluxos que checam CNPJ — adaptar para consultar a tabela (cache em hook compartilhado para evitar múltiplas chamadas).

Manter `src/data/fornecedoresSemFiscal.ts` apenas como fallback até confirmação de migração; depois remover.

## 4. Filtro por Fornecedor na tela de Pagamentos

**Arquivo:** `src/components/esteira/PagamentosTab.tsx`

- Backend já suporta (`filterFornecedor` em mariadb-proxy linha 9508 — `LIKE %...%`).
- Adicionar `const [filterFornecedor, setFilterFornecedor] = useState("")` com debounce (~400ms).
- Renderizar `<Input>` na barra de filtros (próximo aos demais Selects, ~linha 637) com placeholder `"Buscar por fornecedor..."`.
- Incluir `filterFornecedor` no payload (linha ~249) e nas dependências do useEffect (linha 315).

## Resumo técnico

| Item | Tipo | Esforço |
|------|------|---------|
| 1. Título do modal | Frontend pontual | ~1 linha |
| 2. Origem no editor | Frontend + 1 update SQL | médio |
| 3. Tabela fornecedores | Migration MariaDB + 3 actions edge + UI com permissões | maior |
| 4. Filtro fornecedor | Frontend (backend pronto) | pequeno |

Nada quebra fluxos atuais; mudanças são aditivas. O item 3 exige seed dos 37 fornecedores existentes para preservar o comportamento de roteamento.
