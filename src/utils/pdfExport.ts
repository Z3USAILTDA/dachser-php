// PDF Export Utility - Placeholder
// In production, use a library like jsPDF or pdfmake

export function exportToPDF(data: any[]): string {
  // For now, create a simple text-based export
  const content = data.map((v) => 
    `SPO: ${v.numero_spo || "N/A"} | Fornecedor: ${v.fornecedor || "N/A"} | Valor: ${v.valor || "N/A"} | Etapa: ${v.etapa_atual || "N/A"}`
  ).join("\n");

  const blob = new Blob([content], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const fileName = `vouchers_${new Date().toISOString().split("T")[0]}.txt`;
  
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  return fileName;
}
