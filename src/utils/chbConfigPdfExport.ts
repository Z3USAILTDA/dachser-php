import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChbClientConfig } from "@/hooks/useChbClientConfig";

const CAMPOS_LABELS: Record<string, string> = {
  peso_bruto: "Peso Bruto",
  peso_liquido: "Peso Líquido",
  valor_total: "Valor Total",
  valor_item: "Valor por Item",
  moeda: "Moeda",
  incoterm: "Incoterm",
  frete: "Frete",
  quantidade: "Quantidade",
  ncm: "NCM",
  descricao: "Descrição",
};

const BENEFICIO_LABELS: Record<string, string> = {
  NENHUM: "Nenhum",
  RECOF: "RECOF",
  DRAWBACK: "Drawback Isenção",
  EX_TARIFARIO: "Ex-Tarifário",
};

interface GeneralConfig {
  toleranciaPesoDefault: number;
  toleranciaValorDefault: number;
  camposObrigatoriosDefault: string[];
}

export const exportChbConfigToPDF = (
  configs: ChbClientConfig[],
  generalConfig?: GeneralConfig
) => {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;

  // ============ CAPA ============
  // Header dourado
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 0, pageWidth, 50, "F");

  // Logo area (simulado com texto)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text("Z3US.AI", margin, 25);

  doc.setFontSize(14);
  doc.setFont("helvetica", "normal");
  doc.text("Sistema de Conferência CHB", margin, 35);

  // Título principal
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text("Configurações de SOP", margin, 75);

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text(
    `Documento gerado em ${format(new Date(), "dd 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}`,
    margin,
    85
  );

  // Estatísticas gerais
  const activeConfigs = configs.filter((c) => c.ativo);
  const inactiveConfigs = configs.filter((c) => !c.ativo);

  let yPos = 110;

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, yPos - 5, contentWidth, 45, 3, 3, "F");

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text("Resumo", margin + 10, yPos + 5);

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  yPos += 15;
  doc.text(`• Total de Clientes Configurados: ${configs.length}`, margin + 10, yPos);
  yPos += 8;
  doc.text(`• Configurações Ativas: ${activeConfigs.length}`, margin + 10, yPos);
  yPos += 8;
  doc.text(`• Configurações Inativas: ${inactiveConfigs.length}`, margin + 10, yPos);

  // ============ CONFIGURAÇÕES GERAIS (se fornecidas) ============
  if (generalConfig) {
    doc.addPage();
    drawPageHeader(doc, "Configurações Gerais (Padrão)", margin);

    yPos = 45;

    // Card de tolerâncias
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos, contentWidth, 50, 3, 3, "F");

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text("Tolerâncias Padrão", margin + 10, yPos + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    yPos += 22;
    doc.text(`Tolerância de Peso: ${generalConfig.toleranciaPesoDefault}%`, margin + 10, yPos);
    yPos += 8;
    doc.text(`Tolerância de Valor: ${generalConfig.toleranciaValorDefault}%`, margin + 10, yPos);

    yPos += 25;

    // Campos obrigatórios padrão
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos, contentWidth, 60, 3, 3, "F");

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Campos Obrigatórios (Padrão)", margin + 10, yPos + 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    let fieldY = yPos + 24;
    const camposLabels = generalConfig.camposObrigatoriosDefault.map(
      (c) => CAMPOS_LABELS[c] || c
    );
    
    // Organizar em duas colunas
    const midPoint = Math.ceil(camposLabels.length / 2);
    camposLabels.slice(0, midPoint).forEach((campo, i) => {
      doc.text(`• ${campo}`, margin + 10, fieldY + i * 7);
    });
    camposLabels.slice(midPoint).forEach((campo, i) => {
      doc.text(`• ${campo}`, margin + contentWidth / 2, fieldY + i * 7);
    });
  }

  // ============ TABELA DE CLIENTES ============
  doc.addPage();
  drawPageHeader(doc, "Lista de Clientes Configurados", margin);

  const tableData = configs.map((c) => [
    c.cliente_nome || c.cliente_cnpj,
    c.cliente_cnpj,
    c.ativo ? "Ativo" : "Inativo",
    `${c.tolerancia_peso}%`,
    `${c.tolerancia_valor}%`,
    c.estado_uf || "-",
    BENEFICIO_LABELS[c.beneficio_fiscal || "NENHUM"] || "-",
  ]);

  autoTable(doc, {
    startY: 45,
    head: [["Cliente", "CNPJ", "Status", "Tol. Peso", "Tol. Valor", "UF", "Benefício Fiscal"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [212, 175, 55],
      textColor: [0, 0, 0],
      fontStyle: "bold",
      fontSize: 9,
      halign: "center",
    },
    bodyStyles: {
      fontSize: 8,
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250],
    },
    columnStyles: {
      0: { cellWidth: 45 },
      1: { cellWidth: 35, halign: "center" },
      2: { cellWidth: 18, halign: "center" },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 20, halign: "center" },
      5: { cellWidth: 15, halign: "center" },
      6: { cellWidth: 27, halign: "center" },
    },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2) {
        if (data.cell.raw === "Inativo") {
          data.cell.styles.textColor = [180, 83, 9];
          data.cell.styles.fontStyle = "bold";
        } else {
          data.cell.styles.textColor = [22, 101, 52];
          data.cell.styles.fontStyle = "bold";
        }
      }
    },
    margin: { left: margin, right: margin },
  });

  // ============ DETALHES POR CLIENTE ============
  configs.forEach((config, index) => {
    doc.addPage();
    drawPageHeader(doc, `Configuração: ${config.cliente_nome || config.cliente_cnpj}`, margin);

    yPos = 45;

    // Status badge
    if (config.ativo) {
      doc.setFillColor(220, 252, 231);
      doc.setTextColor(22, 101, 52);
    } else {
      doc.setFillColor(254, 243, 199);
      doc.setTextColor(180, 83, 9);
    }
    doc.roundedRect(pageWidth - margin - 25, yPos - 8, 25, 8, 2, 2, "F");
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text(config.ativo ? "ATIVO" : "INATIVO", pageWidth - margin - 22, yPos - 2);

    // Informações Básicas
    doc.setTextColor(50, 50, 50);
    yPos = drawSectionTitle(doc, "Identificação", margin, yPos);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    yPos += 8;
    doc.text(`Cliente: ${config.cliente_nome || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`CNPJ: ${formatCNPJ(config.cliente_cnpj)}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`E-mail de Contato: ${config.contato_email || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Prazo de Resposta: ${config.prazo_resposta_dias || 2} dias`, margin + 5, yPos);

    // Logística
    yPos += 15;
    yPos = drawSectionTitle(doc, "Informações de Logística", margin, yPos);
    
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Armador: ${config.armador || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Agente de Destino: ${config.agente_destino || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Porto de Descarga Real: ${config.porto_descarga_real || "-"}`, margin + 5, yPos);

    // Tolerâncias
    yPos += 15;
    yPos = drawSectionTitle(doc, "Tolerâncias de Conferência", margin, yPos);

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, yPos + 3, contentWidth / 2 - 5, 25, 2, 2, "F");
    doc.roundedRect(margin + contentWidth / 2 + 5, yPos + 3, contentWidth / 2 - 5, 25, 2, 2, "F");

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text("Peso", margin + 10, yPos + 12);
    doc.text("Valor", margin + contentWidth / 2 + 15, yPos + 12);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(50, 50, 50);
    doc.text(`${config.tolerancia_peso}%`, margin + 10, yPos + 22);
    doc.text(`${config.tolerancia_valor}%`, margin + contentWidth / 2 + 15, yPos + 22);

    // Campos Obrigatórios
    yPos += 40;
    yPos = drawSectionTitle(doc, "Campos Obrigatórios", margin, yPos);

    const campos = (config.campos_obrigatorios || []).map((c) => CAMPOS_LABELS[c] || c);
    yPos += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    if (campos.length === 0) {
      doc.text("Nenhum campo obrigatório configurado", margin + 5, yPos);
    } else {
      const midPoint = Math.ceil(campos.length / 2);
      campos.slice(0, midPoint).forEach((campo, i) => {
        doc.text(`• ${campo}`, margin + 5, yPos + i * 7);
      });
      campos.slice(midPoint).forEach((campo, i) => {
        doc.text(`• ${campo}`, margin + contentWidth / 2, yPos + i * 7);
      });
      yPos += Math.ceil(campos.length / 2) * 7;
    }

    // Informações Fiscais
    yPos += 15;
    yPos = drawSectionTitle(doc, "Configurações Fiscais", margin, yPos);

    yPos += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Estado (UF): ${config.estado_uf || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`CFOP Padrão: ${config.cfop_padrao || "-"}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Benefício Fiscal: ${BENEFICIO_LABELS[config.beneficio_fiscal || "NENHUM"]}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`ICMS Diferido: ${config.icms_diferido ? "Sim" : "Não"}`, margin + 5, yPos);

    // Instruções Personalizadas
    if (config.instrucoes_personalizadas) {
      yPos += 15;
      yPos = drawSectionTitle(doc, "Instruções Personalizadas", margin, yPos);

      yPos += 8;
      doc.setFontSize(9);
      doc.setFont("helvetica", "italic");
      
      // Word wrap para instruções longas
      const lines = doc.splitTextToSize(config.instrucoes_personalizadas, contentWidth - 10);
      doc.text(lines, margin + 5, yPos);
    }

    // Rodapé com número da página
    drawPageFooter(doc, index + 1, configs.length);
  });

  // Salvar arquivo
  const fileName = `configuracoes_chb_${format(new Date(), "yyyy-MM-dd_HH-mm")}.pdf`;
  doc.save(fileName);

  return fileName;
};

// Helpers
function drawPageHeader(doc: jsPDF, title: string, margin: number) {
  const pageWidth = doc.internal.pageSize.width;

  doc.setFillColor(212, 175, 55);
  doc.rect(0, 0, pageWidth, 30, "F");

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(title, margin, 18);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(
    format(new Date(), "dd/MM/yyyy HH:mm"),
    pageWidth - margin,
    18,
    { align: "right" }
  );
}

function drawSectionTitle(doc: jsPDF, title: string, margin: number, yPos: number): number {
  doc.setFillColor(212, 175, 55);
  doc.rect(margin, yPos, 3, 12, "F");

  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(50, 50, 50);
  doc.text(title, margin + 8, yPos + 9);

  return yPos + 5;
}

function drawPageFooter(doc: jsPDF, clientIndex: number, totalClients: number) {
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;

  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Cliente ${clientIndex} de ${totalClients}`,
    pageWidth / 2,
    pageHeight - 10,
    { align: "center" }
  );
  doc.text(
    "Z3US.AI - Sistema CHB",
    pageWidth - 15,
    pageHeight - 10,
    { align: "right" }
  );
}

function formatCNPJ(cnpj: string): string {
  if (!cnpj) return "-";
  const cleaned = cnpj.replace(/\D/g, "");
  if (cleaned.length !== 14) return cnpj;
  return cleaned.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5"
  );
}
