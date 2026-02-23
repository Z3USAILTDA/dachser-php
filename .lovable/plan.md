

## Troca de Master por Upload de Manifesto - Cadastro NOVA

### O que sera feito

Adicionar uma nova secao na pagina Cadastro NOVA (/air/cadastro-nova) que permite fazer upload de um PDF de manifesto para trocar o MAWB de processos existentes. O sistema extrai o MAWB e todos os HAWBs do manifesto, localiza os registros no banco e atualiza o MAWB na tabela `t_cadastro_aereo`.

### Fluxo do usuario

1. Na pagina Cadastro NOVA, uma nova secao "Troca de Master" aparece
2. O usuario arrasta ou seleciona um PDF de manifesto
3. O sistema extrai via IA: o novo MAWB e a lista de HAWBs com shipper/consignee
4. Uma tabela de preview mostra os HAWBs encontrados, o MAWB antigo (buscado do banco) e o novo MAWB
5. O usuario confirma e o sistema atualiza `t_cadastro_aereo`

### Detalhes Tecnicos

**1. Nova Edge Function: `parse-manifest-swap/index.ts`**

- Recebe o PDF via FormData (base64)
- Usa Lovable AI Gateway (Gemini 3 Pro) para extrair:
  - MAWB (AWB Number do manifesto, formato XXX-XXXXXXXX)
  - Lista de HAWBs com: hawb_number, shipper, consignee, pieces, weight
- Retorna JSON estruturado

**2. Nova action no `olimpo-proxy/index.ts`: `swap_master_cadastro_aereo`**

- Recebe: `new_mawb`, lista de `hawbs`, usuario
- Para cada HAWB na lista:
  - Busca em `t_cadastro_aereo` WHERE `hawb_number = ?` para encontrar o MAWB antigo (`awb_number`)
  - Atualiza `t_cadastro_aereo` SET `awb_number = new_mawb` WHERE `hawb_number = ?`
- Retorna resultado: quantos atualizados, quais nao encontrados

**3. Frontend: Nova secao na pagina `src/pages/air/CadastroNova.tsx`**

- Card separado com titulo "Troca de Master (Manifesto)"
- Upload zone para PDF de manifesto
- Tabela de preview com colunas: HAWB, Shipper, CNEE, MAWB Antigo, MAWB Novo
- Botao "Confirmar Troca" que chama a action `swap_master_cadastro_aereo`
- Feedback via toast com resultado

**Arquivos a criar/modificar:**

| Arquivo | Acao |
|---|---|
| `supabase/functions/parse-manifest-swap/index.ts` | Criar - edge function para parsear manifesto via IA |
| `supabase/functions/olimpo-proxy/index.ts` | Modificar - adicionar action `swap_master_cadastro_aereo` |
| `src/pages/air/CadastroNova.tsx` | Modificar - adicionar secao de troca de master |

