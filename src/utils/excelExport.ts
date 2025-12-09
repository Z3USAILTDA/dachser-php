// Excel Export Utility - Placeholder
// In production, use a library like xlsx or exceljs

export function exportToStyledExcel(data: any[]): string {
  // Create a simple CSV export as fallback
  const headers = [
    "Número SPO",
    "Fornecedor",
    "Valor",
    "Vencimento",
    "Etapa Atual",
    "Status Baixa",
    "Forma Pagamento",
  ];

  const rows = data.map((v) => [
    v.numero_spo || "",
    v.fornecedor || "",
    v.valor || "",
    v.vencimento || "",
    v.etapa_atual || "",
    v.status_baixa || "",
    v.forma_pagamento || "",
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `vouchers_${new Date().toISOString().split("T")[0]}.csv`;
  
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return fileName;
}
