
## Diagnóstico

O bug ocorre em vouchers **simples** (não master). A raiz é uma combinação de dois fatores na aba Pagamentos (`src/components/esteira/PagamentosTab.tsx`):

### 1. Race condition no `setAnexosDialog`
Quando o usuário clica no olho (`Eye`), o fluxo é:
1. `setSelectedPagamento(pag)` + `setDetailsDialogOpen(true)` + `setAnexosDialog([])` + `setLoadingAnexos(true)`
2. `await invoke("get_voucher_anexos", { voucher_id: pag.id })`
3. `setAnexosDialog(data?.data || [])`

Não há **request token / abort** entre cliques. Se o usuário fecha o dialog e abre outro voucher antes da primeira request retornar (ou se o dialog é re-renderizado), a primeira resposta pode chegar **depois** e sobrescrever a lista do voucher correto com a do anterior — ou pior: a primeira response com `[]` (porque o backend silenciou um erro) sobrescreve uma resposta posterior já populada. Idem para o `onUploaded` do `ExtraAnexoUpload`, que dispara um segundo `get_voucher_anexos` em paralelo sem proteção.

### 2. Erro silenciado no edge function vira "lista vazia"
No handler `get_voucher_anexos` (linhas 6909–6921 de `supabase/functions/mariadb-proxy/index.ts`):

```ts
let anexos: any[] = [];
try {
  anexos = await client.query(`SELECT ... FROM dados_dachser.t_voucher_anexos WHERE voucher_id = ? ...`, [voucher_id]);
} catch (anexosErr) {
  console.log('Error fetching anexos:', anexosErr);
}
result = { success: true, data: anexos || [] };
```

Qualquer falha transitória do MariaDB (timeout, conexão derrubada, lock) é engolida e o cliente recebe `{ success: true, data: [] }`. O frontend interpreta como "voucher sem anexos" e mostra "Nenhum documento anexado", **mesmo existindo registros em `t_voucher_anexos`**. Como em `get_voucher_by_id` o mesmo `try/catch silencioso` existe, se o usuário abrir o detalhe pela rota `/voucher/:id` no momento errado, vai ver o mesmo problema — confirmando que não é diferença de query e sim falha transitória mascarada.

### Por que parece intermitente
O usuário disse "em alguns casos aparecem, em outros não, mesmo existindo documentos". Isso bate com (a) flap de conexão MariaDB ou (b) race entre cliques sucessivos no olho. Não é problema de filhos/master, nem de id incorreto — `pag.id` é exatamente `t_vouchers.id`, e o handler usa o mesmo critério do `get_voucher_by_id` que sabidamente funciona.

---

## Mudanças propostas

### A. `supabase/functions/mariadb-proxy/index.ts` — handler `get_voucher_anexos`
- **Parar de mascarar erros**. Em vez de retornar `{ success: true, data: [] }` quando a query falha, retornar `{ success: false, error: <mensagem>, data: [] }` (mantendo HTTP 200 para não derrubar o invoke). O frontend então saberá distinguir "voucher sem anexos" de "falha técnica".
- Adicionar 1 retry simples (uma re-tentativa após pequeno delay) antes de desistir, já que erros do MariaDB nesse projeto costumam ser transitórios (alinhado com a memory `mariadb-connection-details`).
- Preservar todas as outras queries; mudança cirúrgica só nesse case.

### B. `src/components/esteira/PagamentosTab.tsx` — handler do olho
- Introduzir um **request token** (ref incremental) para descartar respostas que chegam fora de ordem. Pseudocódigo:
  ```ts
  const reqIdRef = useRef(0);
  ...
  const myReq = ++reqIdRef.current;
  const { data } = await invoke(...);
  if (myReq !== reqIdRef.current) return; // descarta resposta tardia
  if (data?.success === false) {
    toast({ title: "Falha ao carregar anexos", description: data.error, variant: "destructive" });
  }
  setAnexosDialog(data?.data || []);
  ```
- Aplicar o mesmo padrão no `onUploaded` do `ExtraAnexoUpload` (linha ~1209) para que ele também respeite o token.
- Quando o dialog fecha (`onOpenChange` para false), incrementar o token e limpar `anexosDialog` para evitar que uma resposta antiga "renasça".
- Quando `data.success === false`, exibir um toast informando o usuário e **não** sobrescrever a lista atual (deixar tentar de novo via reabrir o olho). Isso evita o "sumiço" de anexos que existiam.

### C. (Opcional, baixo custo) `VoucherDetailsView.tsx` na rota `/fin/esteira/voucher/:id`
- Mesma blindagem: se `get_voucher_by_id` voltar com `anexos: []` mas o backend tiver registrado erro de query, o usuário precisa saber. Posso aplicar o mesmo `success:false` para o sub-fetch de anexos no `get_voucher_by_id`. Surgical, mesmo padrão da seção A.

---

## Memory a atualizar
Criar `mem://vouchers/anexos-fetch-resilience` registrando:
> Handlers que carregam anexos (`get_voucher_anexos`, `get_voucher_by_id`) não devem mascarar falhas de MariaDB como `data: []`. Frontend deve usar request token para evitar race condition entre múltiplos cliques no olho da Pagamentos.

---

## Não faz parte do escopo
- Não vou tocar na lógica de master/filhos (irrelevante para vouchers simples).
- Não vou alterar a query SQL — ela já é correta.
- Não vou refatorar os handlers; é cirúrgico, alinhado com a sua preferência.

Posso prosseguir com A + B + C?
