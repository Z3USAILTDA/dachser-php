import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface PreviewItem {
  row_index: number;
  fornecedor: string | null;
  valor: number | null;
  vencimento: string | null;
  forma_pagamento: string | null;
  fatura: string | null;
  status: string;
  validation_message: string | null;
}

export function BatchImportPreviewTable({ items }: { items: PreviewItem[] }) {
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-white/10">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">#</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Fornecedor</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead>Forma</TableHead>
            <TableHead>Fatura</TableHead>
            <TableHead>Mensagem</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => (
            <TableRow key={it.row_index}>
              <TableCell>{it.row_index + 1}</TableCell>
              <TableCell>
                <span
                  className={
                    it.status === "VALID"
                      ? "text-emerald-400"
                      : it.status === "WARNING"
                      ? "text-amber-400"
                      : "text-red-400"
                  }
                >
                  {it.status}
                </span>
              </TableCell>
              <TableCell>{it.fornecedor || "—"}</TableCell>
              <TableCell>
                {it.valor != null
                  ? it.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                  : "—"}
              </TableCell>
              <TableCell>{it.vencimento || "—"}</TableCell>
              <TableCell>{it.forma_pagamento || "—"}</TableCell>
              <TableCell className="max-w-[160px] truncate">{it.fatura || "—"}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[280px]">
                {it.validation_message || ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
