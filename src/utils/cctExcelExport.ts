import * as XLSX from "xlsx";
import { ProcessoCCT } from "@/types/cct";

const airlineNames: Record<string, string> = {
  "006": "Delta Cargo",
  "014": "Air Canada Cargo",
  "020": "Lufthansa Cargo",
  "023": "LATAM Airlines",
  "045": "Avianca Cargo",
  "047": "TAP Air Portugal Cargo",
  "055": "Austrian Airlines Cargo",
  "057": "Air France Cargo",
  "064": "Turkish Airlines Cargo",
  "074": "KLM Cargo",
  "082": "Korean Air Cargo",
  "086": "China Airlines Cargo",
  "105": "Air India Cargo",
  "112": "Copa Airlines Cargo",
  "117": "Emirates SkyCargo",
  "125": "British Airways Cargo",
  "131": "Japan Airlines Cargo",
  "139": "China Eastern Cargo",
  "157": "Qatar Airways Cargo",
  "160": "Cathay Pacific Cargo",
  "172": "EVA Air Cargo",
  "176": "Ethiopian Airlines Cargo",
  "180": "All Nippon Airways Cargo",
  "205": "Cargolux",
  "217": "Thai Airways Cargo",
  "232": "Aeromexico Cargo",
  "235": "Iberia Cargo",
  "256": "TAM Cargo",
  "257": "Finnair Cargo",
  "295": "VARIG Logistica",
  "412": "Aerolineas Argentinas Cargo",
  "489": "American Airlines Cargo",
  "577": "Azul Cargo",
  "618": "Singapore Airlines Cargo",
  "695": "Saudia Cargo",
  "710": "Nippon Cargo Airlines",
  "724": "Atlas Air",
  "729": "Polar Air Cargo",
  "774": "Lufthansa Cargo",
  "784": "Asiana Cargo",
  "907": "GOL Linhas Aéreas",
};

function getAirlineName(mawb: string): string {
  if (!mawb) return "-";
  const code = mawb.substring(0, 3).replace(/-/g, "");
  return airlineNames[code] || `Código ${code}`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function exportCCTWithoutDepDateToExcel(processos: ProcessoCCT[]): number {
  // Filter only those without dep_datetime
  const semDecolagem = processos.filter(
    (p) => !p.shipment?.dep_datetime && !p.shipment?.data_decolagem_ultimo_trecho
  );

  if (semDecolagem.length === 0) {
    return 0;
  }

  // Map to Excel rows
  const rows = semDecolagem.map((p, idx) => ({
    "#": idx + 1,
    "MAWB": p.shipment?.master || "-",
    "HAWB": p.shipment?.house || "-",
    "Cliente": p.shipment?.cliente || "-",
    "Status": p.status_atual?.status_cct_oficial || "-",
    "Companhia Aérea": getAirlineName(p.shipment?.master || ""),
    "Origem": p.shipment?.aeroporto_origem || "-",
    "Destino": p.shipment?.aeroporto_destino || "-",
    "Último Evento": formatDate(p.eventos?.[0]?.data_hora_evento),
  }));

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws["!cols"] = [
    { wch: 5 },   // #
    { wch: 15 },  // MAWB
    { wch: 18 },  // HAWB
    { wch: 30 },  // Cliente
    { wch: 15 },  // Status
    { wch: 25 },  // Companhia Aérea
    { wch: 10 },  // Origem
    { wch: 10 },  // Destino
    { wch: 18 },  // Último Evento
  ];

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "AWBs Sem Decolagem");

  // Generate filename with date
  const today = new Date().toISOString().split("T")[0];
  const filename = `awbs-sem-decolagem-${today}.xlsx`;

  // Download
  XLSX.writeFile(wb, filename);

  return semDecolagem.length;
}
