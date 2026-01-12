import * as XLSX from "xlsx-js-style";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import type { DemurrageContainer } from "@/hooks/useDemurrageData";

const COLORS = {
  header: { fgColor: { rgb: "FFC800" } }, // Dachser yellow
  headerText: { color: { rgb: "000000" } },
  criticalRow: { fgColor: { rgb: "FFCDD2" } }, // Red light
  atRiskRow: { fgColor: { rgb: "FFF9C4" } }, // Yellow light
  safeRow: { fgColor: { rgb: "C8E6C9" } }, // Green light
  alternateRow: { fgColor: { rgb: "F5F5F5" } }, // Gray light
  border: {
    top: { style: "thin", color: { rgb: "CCCCCC" } },
    bottom: { style: "thin", color: { rgb: "CCCCCC" } },
    left: { style: "thin", color: { rgb: "CCCCCC" } },
    right: { style: "thin", color: { rgb: "CCCCCC" } },
  },
};

const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || value === null || value === 0) return "-";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
  }).format(value);
};

const formatDate = (dateStr: string | null): string => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatDateTime = (dateStr: string | null): string => {
  if (!dateStr) return "-";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const getRiskLabel = (status: string): string => {
  switch (status) {
    case "safe": return "OK";
    case "at_risk": return "Em Risco";
    case "critical": return "Crítico";
    case "exceeded": return "Excedido";
    default: return "Pendente";
  }
};

const getFtSourceLabel = (source: string | null): string => {
  switch (source) {
    case "PROCESSO": return "MBL Específico";
    case "CONTRATO": return "Contrato Cliente";
    case "TARIFA": return "Tarifa Armador";
    case "CONTAINER": return "Container";
    default: return "Padrão";
  }
};

export const exportDemurrageToExcel = (data: DemurrageContainer[]) => {
  // Preparar dados para exportação
  const excelData = data.map((c) => ({
    "Container": c.numero,
    "MBL": c.mbl,
    "Cliente": c.cliente || "-",
    "Armador": c.armador || "-",
    "Tipo Container": c.tipo_conteiner || "-",
    "Status Cronos": c.cronos_status || "-",
    "Free Time (Dias)": c.free_time_days,
    "Origem Free Time": getFtSourceLabel(c.ft_source),
    "Início Free Time": formatDate(c.ft_started_at),
    "Fim Free Time": formatDate(c.free_time_end_date),
    "Dias Restantes": c.days_remaining ?? "-",
    "Dias Excedidos": c.excedente_dias ?? "-",
    "Custo Estimado (USD)": formatCurrency(c.expected_cost_usd),
    "Status Risco": getRiskLabel(c.risk_status),
    "Último Evento": c.last_event || "-",
    "Porto Origem": c.porto_origem || "-",
    "Porto Destino": c.porto_destino || "-",
    "ETA": formatDate(c.eta),
    "Data Gate Out": formatDate(c.data_gate_out),
    "Data Criação": formatDateTime(c.created_at),
    "Última Atualização": formatDateTime(c.updated_at),
  }));

  // Criar worksheet
  const ws = XLSX.utils.json_to_sheet(excelData);

  // Obter range
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Estilizar cabeçalho
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;

    ws[cellAddress].s = {
      fill: COLORS.header,
      font: {
        bold: true,
        sz: 11,
        color: COLORS.headerText.color,
      },
      alignment: {
        horizontal: "center",
        vertical: "center",
      },
      border: COLORS.border,
    };
  }

  // Estilizar linhas de dados baseado no status de risco
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const container = data[row - 1];
    const riskStatus = container?.risk_status;
    const isAlternate = row % 2 === 0;

    let fillColor;
    if (riskStatus === "exceeded" || riskStatus === "critical") {
      fillColor = COLORS.criticalRow;
    } else if (riskStatus === "at_risk") {
      fillColor = COLORS.atRiskRow;
    } else if (riskStatus === "safe") {
      fillColor = COLORS.safeRow;
    } else {
      fillColor = isAlternate ? COLORS.alternateRow : { fgColor: { rgb: "FFFFFF" } };
    }

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddress]) continue;

      ws[cellAddress].s = {
        fill: fillColor,
        font: {
          sz: 10,
          bold: riskStatus === "exceeded" || riskStatus === "critical",
        },
        alignment: {
          horizontal: col <= 1 ? "left" : "center",
          vertical: "center",
        },
        border: COLORS.border,
      };
    }
  }

  // Ajustar largura das colunas
  const colWidths = [
    { wch: 15 }, // Container
    { wch: 20 }, // MBL
    { wch: 25 }, // Cliente
    { wch: 15 }, // Armador
    { wch: 12 }, // Tipo Container
    { wch: 12 }, // Status Cronos
    { wch: 12 }, // Free Time (Dias)
    { wch: 16 }, // Origem Free Time
    { wch: 14 }, // Início FT
    { wch: 14 }, // Fim FT
    { wch: 12 }, // Dias Restantes
    { wch: 12 }, // Dias Excedidos
    { wch: 16 }, // Custo Estimado
    { wch: 12 }, // Status Risco
    { wch: 30 }, // Último Evento
    { wch: 15 }, // Porto Origem
    { wch: 15 }, // Porto Destino
    { wch: 12 }, // ETA
    { wch: 14 }, // Data Gate Out
    { wch: 16 }, // Data Criação
    { wch: 16 }, // Última Atualização
  ];
  ws["!cols"] = colWidths;

  // Ajustar altura das linhas
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 25 }; // Header height
  for (let row = 1; row <= range.e.r; row++) {
    rowHeights[row] = { hpt: 18 }; // Data row height
  }
  ws["!rows"] = rowHeights;

  // Criar workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Demurrage Monitor");

  // Adicionar aba de resumo
  const summaryData = [
    { "Métrica": "Total de Containers", "Valor": data.length },
    { "Métrica": "Containers OK", "Valor": data.filter(c => c.risk_status === "safe").length },
    { "Métrica": "Containers em Risco", "Valor": data.filter(c => c.risk_status === "at_risk").length },
    { "Métrica": "Containers Críticos", "Valor": data.filter(c => c.risk_status === "critical").length },
    { "Métrica": "Containers Excedidos", "Valor": data.filter(c => c.risk_status === "exceeded").length },
    { "Métrica": "Custo Total Estimado", "Valor": formatCurrency(data.reduce((sum, c) => sum + (c.expected_cost_usd || 0), 0)) },
    { "Métrica": "Data Exportação", "Valor": format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR }) },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  
  // Estilizar aba de resumo
  const summaryRange = XLSX.utils.decode_range(wsSummary["!ref"] || "A1");
  for (let col = summaryRange.s.c; col <= summaryRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!wsSummary[cellAddress]) continue;
    wsSummary[cellAddress].s = {
      fill: COLORS.header,
      font: { bold: true, sz: 12, color: COLORS.headerText.color },
      alignment: { horizontal: "center", vertical: "center" },
      border: COLORS.border,
    };
  }
  wsSummary["!cols"] = [{ wch: 25 }, { wch: 20 }];
  
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo");

  // Adicionar informações do documento
  wb.Props = {
    Title: "Relatório de Demurrage",
    Subject: "Monitoramento de Demurrage",
    Author: "Sistema Z3US.AI - Dachser",
    CreatedDate: new Date(),
  };

  // Gerar arquivo
  const fileName = `demurrage_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`;
  XLSX.writeFile(wb, fileName, { cellStyles: true });

  return fileName;
};

const getAuditStatusLabel = (status: string | null): string => {
  switch (status) {
    case "validated": return "Validada";
    case "discrepancy": return "Discrepância";
    case "disputed": return "Em Disputa";
    default: return "Pendente";
  }
};

export const exportDiscrepancyReport = (data: DemurrageContainer[]) => {
  // Filter only discrepancy/disputed containers
  const discrepancyData = data.filter(c => 
    c.audit_status === 'discrepancy' || 
    c.audit_status === 'disputed' ||
    (c.armador_cost_usd && c.armador_cost_usd > 0 && Math.abs((c.armador_cost_usd || 0) - c.expected_cost_usd) > Math.max(c.expected_cost_usd * 0.05, 50))
  );

  // Calculate totals
  const totalCarrierCost = discrepancyData.reduce((sum, c) => sum + (c.armador_cost_usd || 0), 0);
  const totalCalculatedCost = discrepancyData.reduce((sum, c) => sum + c.expected_cost_usd, 0);
  const totalOvercharge = discrepancyData.reduce((sum, c) => {
    const diff = (c.armador_cost_usd || 0) - c.expected_cost_usd;
    return sum + (diff > 0 ? diff : 0);
  }, 0);
  const totalUndercharge = discrepancyData.reduce((sum, c) => {
    const diff = (c.armador_cost_usd || 0) - c.expected_cost_usd;
    return sum + (diff < 0 ? Math.abs(diff) : 0);
  }, 0);

  // Prepare detailed data
  const excelData = discrepancyData.map((c) => {
    const carrierCost = c.armador_cost_usd || 0;
    const calculatedCost = c.expected_cost_usd;
    const difference = carrierCost - calculatedCost;
    const diffPercent = calculatedCost > 0 ? (difference / calculatedCost) * 100 : 0;
    const carrierDays = c.armador_days_charged || 0;
    const calculatedDays = c.excedente_dias || 0;
    const daysDiff = carrierDays - calculatedDays;

    return {
      "Container": c.numero,
      "MBL": c.mbl,
      "Cliente": c.cliente || "-",
      "Armador": c.armador || "-",
      "Nº Fatura Armador": c.armador_invoice_number || "-",
      "Dias Calculados": calculatedDays,
      "Dias Cobrados": carrierDays,
      "Diferença Dias": daysDiff,
      "Valor Calculado (USD)": calculatedCost,
      "Valor Armador (USD)": carrierCost,
      "Diferença (USD)": difference,
      "Diferença (%)": `${diffPercent.toFixed(1)}%`,
      "Tipo Discrepância": difference > 0 ? "SOBRECOBRANÇA" : "SUBCOBRANÇA",
      "Recuperação Potencial (USD)": difference > 0 ? difference : 0,
      "Status Auditoria": getAuditStatusLabel(c.audit_status),
      "Status Disputa": c.dispute_status || "-",
      "Motivo Disputa": c.dispute_reason || "-",
      "Free Time (Dias)": c.free_time_days,
      "Origem Free Time": getFtSourceLabel(c.ft_source),
      "Taxa USD/Dia": c.rate_usd_per_day || "-",
      "Observações": c.notes || "-",
    };
  });

  // Create worksheet
  const ws = XLSX.utils.json_to_sheet(excelData);

  // Get range
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");

  // Style header
  for (let col = range.s.c; col <= range.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cellAddress]) continue;

    ws[cellAddress].s = {
      fill: { fgColor: { rgb: "D32F2F" } }, // Red for discrepancy report
      font: {
        bold: true,
        sz: 11,
        color: { rgb: "FFFFFF" },
      },
      alignment: {
        horizontal: "center",
        vertical: "center",
      },
      border: COLORS.border,
    };
  }

  // Style data rows
  for (let row = range.s.r + 1; row <= range.e.r; row++) {
    const container = discrepancyData[row - 1];
    const diff = (container?.armador_cost_usd || 0) - container?.expected_cost_usd;
    const isOvercharge = diff > 0;
    const isAlternate = row % 2 === 0;

    const fillColor = isOvercharge 
      ? { fgColor: { rgb: "FFCDD2" } }  // Red light for overcharge
      : { fgColor: { rgb: "FFF9C4" } }; // Yellow light for undercharge

    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!ws[cellAddress]) continue;

      ws[cellAddress].s = {
        fill: fillColor,
        font: {
          sz: 10,
          bold: col === 10 || col === 13, // Bold for difference and recovery columns
          color: col === 10 ? { rgb: isOvercharge ? "C62828" : "F57C00" } : undefined,
        },
        alignment: {
          horizontal: col <= 4 ? "left" : "center",
          vertical: "center",
        },
        border: COLORS.border,
      };
    }
  }

  // Column widths
  const colWidths = [
    { wch: 15 }, // Container
    { wch: 20 }, // MBL
    { wch: 25 }, // Cliente
    { wch: 15 }, // Armador
    { wch: 18 }, // Nº Fatura
    { wch: 12 }, // Dias Calculados
    { wch: 12 }, // Dias Cobrados
    { wch: 12 }, // Diferença Dias
    { wch: 18 }, // Valor Calculado
    { wch: 18 }, // Valor Armador
    { wch: 16 }, // Diferença USD
    { wch: 12 }, // Diferença %
    { wch: 16 }, // Tipo Discrepância
    { wch: 20 }, // Recuperação Potencial
    { wch: 14 }, // Status Auditoria
    { wch: 14 }, // Status Disputa
    { wch: 30 }, // Motivo Disputa
    { wch: 12 }, // Free Time
    { wch: 16 }, // Origem FT
    { wch: 12 }, // Taxa
    { wch: 30 }, // Observações
  ];
  ws["!cols"] = colWidths;

  // Row heights
  const rowHeights: { hpt: number }[] = [];
  rowHeights[0] = { hpt: 28 };
  for (let row = 1; row <= range.e.r; row++) {
    rowHeights[row] = { hpt: 20 };
  }
  ws["!rows"] = rowHeights;

  // Create workbook
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Discrepâncias Detalhadas");

  // Summary sheet
  const summaryData = [
    { "Métrica": "Total de Discrepâncias", "Valor": discrepancyData.length.toString() },
    { "Métrica": "Total Cobrado pelo Armador", "Valor": formatCurrency(totalCarrierCost) },
    { "Métrica": "Total Calculado Internamente", "Valor": formatCurrency(totalCalculatedCost) },
    { "Métrica": "Diferença Total", "Valor": formatCurrency(totalCarrierCost - totalCalculatedCost) },
    { "Métrica": "", "Valor": "" },
    { "Métrica": "SOBRECOBRANÇA (Recuperação Potencial)", "Valor": formatCurrency(totalOvercharge) },
    { "Métrica": "Containers com Sobrecobrança", "Valor": discrepancyData.filter(c => (c.armador_cost_usd || 0) > c.expected_cost_usd).length.toString() },
    { "Métrica": "", "Valor": "" },
    { "Métrica": "SUBCOBRANÇA", "Valor": formatCurrency(totalUndercharge) },
    { "Métrica": "Containers com Subcobrança", "Valor": discrepancyData.filter(c => (c.armador_cost_usd || 0) < c.expected_cost_usd).length.toString() },
    { "Métrica": "", "Valor": "" },
    { "Métrica": "Em Disputa", "Valor": discrepancyData.filter(c => c.audit_status === 'disputed').length.toString() },
    { "Métrica": "Valor em Disputa", "Valor": formatCurrency(discrepancyData.filter(c => c.audit_status === 'disputed').reduce((sum, c) => sum + (c.disputed_amount_usd || 0), 0)) },
    { "Métrica": "", "Valor": "" },
    { "Métrica": "Data do Relatório", "Valor": format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR }) },
  ];
  const wsSummary = XLSX.utils.json_to_sheet(summaryData);
  
  // Style summary
  const summaryRange = XLSX.utils.decode_range(wsSummary["!ref"] || "A1");
  for (let col = summaryRange.s.c; col <= summaryRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!wsSummary[cellAddress]) continue;
    wsSummary[cellAddress].s = {
      fill: { fgColor: { rgb: "D32F2F" } },
      font: { bold: true, sz: 12, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: COLORS.border,
    };
  }

  // Highlight recovery potential row
  for (let row = 1; row <= summaryRange.e.r; row++) {
    for (let col = summaryRange.s.c; col <= summaryRange.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      if (!wsSummary[cellAddress]) continue;
      
      const isRecoveryRow = row === 6; // "SOBRECOBRANÇA" row
      wsSummary[cellAddress].s = {
        fill: isRecoveryRow ? { fgColor: { rgb: "C8E6C9" } } : { fgColor: { rgb: "FFFFFF" } },
        font: { 
          bold: isRecoveryRow, 
          sz: isRecoveryRow ? 12 : 10,
          color: isRecoveryRow ? { rgb: "2E7D32" } : undefined,
        },
        alignment: { horizontal: col === 0 ? "left" : "right", vertical: "center" },
        border: COLORS.border,
      };
    }
  }

  wsSummary["!cols"] = [{ wch: 35 }, { wch: 25 }];
  
  XLSX.utils.book_append_sheet(wb, wsSummary, "Resumo Financeiro");

  // By carrier breakdown
  const carrierBreakdown: Record<string, { count: number; overcharge: number; undercharge: number; total: number }> = {};
  discrepancyData.forEach(c => {
    const carrier = c.armador || "Não Informado";
    if (!carrierBreakdown[carrier]) {
      carrierBreakdown[carrier] = { count: 0, overcharge: 0, undercharge: 0, total: 0 };
    }
    const diff = (c.armador_cost_usd || 0) - c.expected_cost_usd;
    carrierBreakdown[carrier].count++;
    carrierBreakdown[carrier].total += Math.abs(diff);
    if (diff > 0) carrierBreakdown[carrier].overcharge += diff;
    else carrierBreakdown[carrier].undercharge += Math.abs(diff);
  });

  const carrierData = Object.entries(carrierBreakdown).map(([carrier, data]) => ({
    "Armador": carrier,
    "Qtd Discrepâncias": data.count,
    "Sobrecobrança (USD)": formatCurrency(data.overcharge),
    "Subcobrança (USD)": formatCurrency(data.undercharge),
    "Total Discrepância (USD)": formatCurrency(data.total),
  })).sort((a, b) => {
    const aVal = carrierBreakdown[a.Armador].overcharge;
    const bVal = carrierBreakdown[b.Armador].overcharge;
    return bVal - aVal;
  });

  const wsCarrier = XLSX.utils.json_to_sheet(carrierData);
  const carrierRange = XLSX.utils.decode_range(wsCarrier["!ref"] || "A1");
  for (let col = carrierRange.s.c; col <= carrierRange.e.c; col++) {
    const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!wsCarrier[cellAddress]) continue;
    wsCarrier[cellAddress].s = {
      fill: { fgColor: { rgb: "D32F2F" } },
      font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center" },
      border: COLORS.border,
    };
  }
  wsCarrier["!cols"] = [{ wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 18 }, { wch: 22 }];
  
  XLSX.utils.book_append_sheet(wb, wsCarrier, "Por Armador");

  // Document properties
  wb.Props = {
    Title: "Relatório de Discrepâncias - Demurrage",
    Subject: "Auditoria de Custos de Armadores",
    Author: "Sistema Z3US.AI - Dachser",
    CreatedDate: new Date(),
  };

  // Generate file
  const fileName = `discrepancias_demurrage_${format(new Date(), "yyyy-MM-dd_HH-mm")}.xlsx`;
  XLSX.writeFile(wb, fileName, { cellStyles: true });

  return fileName;
};
