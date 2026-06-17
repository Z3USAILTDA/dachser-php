## Causa raiz

Quando 2 pré-lançados recebem 1 boleto único formando um master:

1. No frontend (`BatchDocumentBinderDialog.doBind`), após `bind_batch_document_to_master_group`, `extract-boleto-barcode` é chamado e `save_linha_digitavel` grava nos **child voucher ids** (ids dos pré-lançados). O master ainda não existe.
2. Em `finalize_batch_import` (mariadb-proxy), o master é criado como **novo voucher** sem `linha_digitavel`/`codigo_barras`. Os anexos do boleto-grupo são corretamente vinculados ao master, mas a linha digitável não é extraída/gravada nele.

Resultado: master sem linha digitável.

## Correção (alinhada à regra de negócio)

A linha digitável do master deve vir **do BOLETO/DAI vinculado ao próprio grupo master** (`grp.docs` em `finalize_batch_import`), nunca dos boletos individuais dos filhos. Isso é necessário porque um pré-lançado pode ter sido criado com um boleto antigo que será substituído pelo boleto único do master.

Editar **`supabase/functions/mariadb-proxy/index.ts`** dentro de `finalize_batch_import`, logo após o bloco que cria os anexos do master a partir de `grp.docs` (~linha 22739) e antes do espelhamento dos anexos dos filhos:

```ts
// Extrair linha digitável a partir do BOLETO/DAI vinculado ao MASTER
// (prioridade BOLETO > DAI; ignora anexos individuais dos filhos).
try {
  const boletoDoc = grp.docs.find((d: any) =>
    ['BOLETO', 'BOLETO_INSTRUCOES'].includes(String(d.tipo_anexo || '').toUpperCase())
  );
  const daiDoc = grp.docs.find((d: any) =>
    String(d.tipo_anexo || '').toUpperCase() === 'DAI'
  );
  const sourceDoc = boletoDoc || daiDoc;
  if (sourceDoc?.file_url) {
    const extRes = await fetch(`${SUPABASE_URL}/functions/v1/extract-boleto-barcode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ fileUrl: sourceDoc.file_url }),
    });
    const ext = await extRes.json().catch(() => null);
    if (ext?.success && ext?.linhaDigitavel) {
      await client.execute(
        `UPDATE dados_dachser.t_vouchers
            SET linha_digitavel = ?, codigo_barras = ?, updated_at = NOW()
          WHERE id = ?`,
        [ext.linhaDigitavel, ext.codigoBarras || null, masterId]
      );
    } else {
      console.warn('[finalize_batch_import] extract-boleto-barcode falhou p/ master', masterId, ext?.error);
    }
  }
} catch (e) {
  console.error('[finalize_batch_import] linha_digitavel master falhou:', (e as any)?.message || e);
}
```

Observações:
- Usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já disponíveis no módulo (confirmar referências existentes no arquivo; reaproveitar o mesmo padrão já utilizado em outras invocações de edge functions dentro do mariadb-proxy).
- Não altera `linha_digitavel` dos filhos (eles vão para `CONSOLIDADO_NO_MASTER` e ficam ocultos).
- Para grupos só com `FATURA` (sem BOLETO/DAI), nada é gravado — master pode não exigir linha digitável (forma_pagamento ≠ BOLETO).

Deploy do `mariadb-proxy` após editar.

## Memória

Atualizar `mem://vouchers/batch-boleto-dai-priority.md` adicionando regra:
**A linha digitável do voucher master vem exclusivamente do BOLETO/DAI vinculado ao próprio grupo master (`t_voucher_batch_documents` com `is_master_group=1`), extraída em `finalize_batch_import` no momento da criação do master. Nunca herdar do `linha_digitavel` dos filhos individuais.**

## Fora de escopo

- Frontend `BatchDocumentBinderDialog` (continua gravando nos filhos no fluxo individual; sem alteração).
- `extract-boleto-barcode` (sem mudanças).
- Fluxo unitário e PRE_LANCAMENTO sem master.
