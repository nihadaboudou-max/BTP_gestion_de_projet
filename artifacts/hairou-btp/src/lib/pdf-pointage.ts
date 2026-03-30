import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PdfEntry {
  workerName: string;
  status: string;
  arrivalTime?: string | null;
  arrivalSignature?: string | null;
  arrivalSignedAt?: string | null;
  departureTime?: string | null;
  departureSignature?: string | null;
  departureSignedAt?: string | null;
  hoursWorked?: number | null;
  payMode: string;
  dailyWage?: number | null;
  taskAmount?: number | null;
  taskProgressPct?: number | null;
  amountDue?: number | null;
  notes?: string | null;
}

interface PdfSheet {
  projectName: string;
  date: string;
  chefName: string;
  status: string;
  chefSignature?: string | null;
  chefSignedAt?: string | null;
  adminSignature?: string | null;
  adminSignedAt?: string | null;
  adminComment?: string | null;
  entries: PdfEntry[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NAVY = "#0f2d4c";
const DARK_GREEN = "#1a5f3a";
const WHITE = "#ffffff";
const LIGHT_GRAY = "#f5f7fa";
const BORDER_COLOR = "#d1d5db";

function formatFCFA(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  } catch { return dateStr; }
}

function formatTime(t?: string | null): string { return t || "—"; }

function formatHours(h?: number | null): string {
  if (!h) return "—";
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h${mins.toString().padStart(2, "0")}`;
}

function statusLabel(s: string): string {
  const map: Record<string, string> = {
    PRESENT: "Présent",
    ABSENT: "Absent",
    DEMI_JOURNEE: "Demi-j.",
    HEURE_SUP: "H. Sup.",
  };
  return map[s] || s;
}

function statusColor(s: string): [number, number, number] {
  const map: Record<string, [number, number, number]> = {
    PRESENT: [22, 163, 74],
    ABSENT: [220, 38, 38],
    DEMI_JOURNEE: [217, 119, 6],
    HEURE_SUP: [124, 58, 237],
  };
  return map[s] || [107, 114, 128];
}

function calcAmount(e: PdfEntry): number {
  if (e.status === "ABSENT") return 0;
  if (e.payMode === "PAR_TACHE") return (e.taskAmount || 0) * ((e.taskProgressPct ?? 100) / 100);
  const wage = e.dailyWage || 0;
  const hours = e.hoursWorked || 0;
  if (e.status === "DEMI_JOURNEE") return wage / 2;
  if (hours > 0) return hours * (wage / 8);
  return wage;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

// ─── Watermark ────────────────────────────────────────────────────────────────

function addWatermark(doc: jsPDF, status: string, pageW: number, pageH: number) {
  const watermarks: Record<string, { text: string; r: number; g: number; b: number }> = {
    APPROUVEE: { text: "VALIDÉE", r: 22, g: 163, b: 74 },
    REJETEE:   { text: "REJETÉE", r: 220, g: 38, b: 38 },
    SOUMISE:   { text: "EN ATTENTE", r: 156, g: 163, b: 175 },
    BROUILLON: { text: "BROUILLON", r: 156, g: 163, b: 175 },
  };
  const wm = watermarks[status] || watermarks.BROUILLON;
  doc.saveGraphicsState();
  doc.setGState(doc.GState({ opacity: 0.08 }));
  doc.setTextColor(wm.r, wm.g, wm.b);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(72);
  doc.text(wm.text, pageW / 2, pageH / 2, { align: "center", baseline: "middle", angle: 45 });
  doc.restoreGraphicsState();
  doc.setTextColor(0, 0, 0);
}

// ─── Draw a signature block ───────────────────────────────────────────────────

function drawSignatureBlock(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  title: string,
  sigData: string | null | undefined,
  signedAt: string | null | undefined,
  signerName: string,
  pending: boolean = false,
) {
  const [nr, ng, nb] = hexToRgb(NAVY);

  if (sigData) {
    doc.setFillColor(249, 250, 251);
    doc.setDrawColor(...hexToRgb(BORDER_COLOR));
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");

    // Title bar
    doc.setFillColor(nr, ng, nb);
    doc.roundedRect(x, y, w, 7, 3, 3, "F");
    doc.rect(x, y + 4, w, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(title.toUpperCase(), x + w / 2, y + 4.5, { align: "center" });

    // Signature image
    try {
      doc.addImage(sigData, "PNG", x + 4, y + 9, w - 8, h - 18, undefined, "FAST");
    } catch {}

    // Separator line
    doc.setDrawColor(nr, ng, nb);
    doc.setLineWidth(0.5);
    doc.line(x + 4, y + h - 8, x + w - 4, y + h - 8);

    // Name + date
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(nr, ng, nb);
    doc.text(signerName, x + w / 2, y + h - 5, { align: "center" });
    if (signedAt) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(6);
      doc.setTextColor(107, 114, 128);
      const signedDate = (() => {
        try { return new Date(signedAt).toLocaleString("fr-FR"); } catch { return signedAt; }
      })();
      doc.text(`Signé le : ${signedDate}`, x + w / 2, y + h - 1.5, { align: "center" });
    }
  } else if (pending) {
    doc.setFillColor(255, 251, 235);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([2, 2], 0);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");
    doc.setLineDashPattern([], 0);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.text(title.toUpperCase(), x + w / 2, y + 7, { align: "center" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(160, 100, 30);
    doc.text("En attente de signature", x + w / 2, y + h / 2 + 2, { align: "center" });
    doc.text(signerName, x + w / 2, y + h - 5, { align: "center" });
  } else {
    // Empty box placeholder
    doc.setFillColor(248, 248, 248);
    doc.setDrawColor(...hexToRgb(BORDER_COLOR));
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, w, h, 3, 3, "FD");
    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(title.toUpperCase(), x + w / 2, y + h / 2, { align: "center" });
  }
}

// ─── Main export function ────────────────────────────────────────────────────

export async function exportPointagePDF(sheet: PdfSheet): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 15;

  // ─── HEADER BAND ────────────────────────────────────────────────────────
  const headerH = 42;
  const [nr, ng, nb] = hexToRgb(NAVY);
  doc.setFillColor(nr, ng, nb);
  doc.rect(0, 0, pageW, headerH, "F");

  const [gr, gg, gb] = hexToRgb(DARK_GREEN);
  doc.setFillColor(gr, gg, gb);
  doc.rect(0, headerH - 4, pageW, 4, "F");

  // Logo circle
  doc.setFillColor(255, 255, 255);
  doc.circle(margin + 12, headerH / 2, 10, "F");
  doc.setFillColor(nr, ng, nb);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(nr, ng, nb);
  doc.text("BTP", margin + 12, headerH / 2 + 1, { align: "center", baseline: "middle" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text("HAIROU", margin + 28, headerH / 2 - 3);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(180, 210, 235);
  doc.text("GESTION BTP", margin + 28, headerH / 2 + 5);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text("FICHE DE POINTAGE", pageW - margin, headerH / 2 - 4, { align: "right" });

  const statusBadge: Record<string, { text: string; r: number; g: number; b: number }> = {
    APPROUVEE: { text: "APPROUVÉE", r: 22, g: 163, b: 74 },
    REJETEE:   { text: "REJETÉE",   r: 220, g: 38, b: 38 },
    SOUMISE:   { text: "SOUMISE",   r: 59, g: 130, b: 246 },
    BROUILLON: { text: "BROUILLON", r: 107, g: 114, b: 128 },
  };
  const badge = statusBadge[sheet.status] || statusBadge.BROUILLON;
  doc.setFillColor(badge.r, badge.g, badge.b);
  doc.roundedRect(pageW - margin - 40, headerH / 2 + 2, 40, 8, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);
  doc.text(badge.text, pageW - margin - 20, headerH / 2 + 7, { align: "center" });

  // ─── PROJECT INFO BLOCK ─────────────────────────────────────────────────
  let y = headerH + 8;

  doc.setFillColor(245, 247, 250);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, "F");
  doc.setDrawColor(...hexToRgb(BORDER_COLOR));
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, pageW - margin * 2, 22, 3, 3, "S");

  const col1 = margin + 6;
  const col2 = pageW * 0.35;
  const col3 = pageW * 0.65;
  const labelY = y + 7;
  const valueY = y + 15;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(107, 114, 128);
  doc.text("PROJET", col1, labelY);
  doc.text("DATE", col2, labelY);
  doc.text("CHEF RESPONSABLE", col3, labelY);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(15, 45, 76);
  doc.text(sheet.projectName || "—", col1, valueY);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text(formatDate(sheet.date), col2, valueY);
  doc.text(sheet.chefName || "—", col3, valueY);

  y += 27;

  // ─── MAIN TABLE ─────────────────────────────────────────────────────────
  const tableRows = sheet.entries.map((e) => {
    const amount = calcAmount(e);
    return [
      e.workerName,
      formatTime(e.arrivalTime),
      e.arrivalSignature ? "[SIG_ARR]" : "—",
      formatTime(e.departureTime),
      e.departureSignature ? "[SIG_DEP]" : "—",
      formatHours(e.hoursWorked),
      statusLabel(e.status),
      formatFCFA(amount),
    ];
  });

  const totalAmount = sheet.entries.reduce((s, e) => s + calcAmount(e), 0);
  const presentCount = sheet.entries.filter(e => e.status !== "ABSENT").length;

  const usable = pageW - margin * 2;
  const colWidths = [52, 20, 32, 20, 32, 20, 24, 32];
  const colScale = usable / colWidths.reduce((a, b) => a + b, 0);
  const scaledWidths = colWidths.map(w => w * colScale);

  const ROW_H = 20; // mm height per row — enough room for sig image

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    head: [["Nom / Ouvrier", "Arrivée", "Signature Arrivée", "Départ", "Signature Départ", "Heures", "Statut", "Montant"]],
    body: tableRows,
    foot: [[
      { content: `TOTAL — ${presentCount} présent(s)`, colSpan: 7, styles: { fontStyle: "bold", halign: "right", fillColor: [15, 45, 76], textColor: 255 } },
      { content: formatFCFA(totalAmount), styles: { fontStyle: "bold", halign: "right", fillColor: [26, 95, 58], textColor: 255 } },
    ]],
    columnStyles: {
      0: { cellWidth: scaledWidths[0], fontStyle: "bold" },
      1: { cellWidth: scaledWidths[1], halign: "center" },
      2: { cellWidth: scaledWidths[2], halign: "center", cellPadding: 1 },
      3: { cellWidth: scaledWidths[3], halign: "center" },
      4: { cellWidth: scaledWidths[4], halign: "center", cellPadding: 1 },
      5: { cellWidth: scaledWidths[5], halign: "center" },
      6: { cellWidth: scaledWidths[6], halign: "center" },
      7: { cellWidth: scaledWidths[7], halign: "right" },
    },
    headStyles: {
      fillColor: [15, 45, 76], textColor: 255, fontStyle: "bold", fontSize: 7.5, cellPadding: 4, halign: "center",
    },
    bodyStyles: {
      fontSize: 8, cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
      minCellHeight: ROW_H, valign: "middle",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    footStyles: { fontSize: 9, cellPadding: 4 },
    tableLineColor: hexToRgb(BORDER_COLOR),
    tableLineWidth: 0.3,
    didParseCell: (data) => {
      // Clear placeholder text for sig + status cells
      if (data.section === "body" && [2, 4, 6].includes(data.column.index)) {
        data.cell.text = [];
      }
    },
    didDrawCell: (data) => {
      if (data.section !== "body") return;

      // Status badge (col 6)
      if (data.column.index === 6) {
        const entry = sheet.entries[data.row.index];
        if (!entry) return;
        const [r, g, b] = statusColor(entry.status);
        const cx = data.cell.x + data.cell.width / 2;
        const cy = data.cell.y + data.cell.height / 2;
        doc.setFillColor(r, g, b);
        doc.roundedRect(data.cell.x + 2, cy - 4, data.cell.width - 4, 8, 2, 2, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.setTextColor(255, 255, 255);
        doc.text(statusLabel(entry.status), cx, cy + 1, { align: "center" });
        return;
      }

      // Arrival signature (col 2)
      if (data.column.index === 2) {
        const entry = sheet.entries[data.row.index];
        if (!entry?.arrivalSignature) {
          // Draw empty box with "—" hint
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(180, 180, 180);
          doc.text("—", data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: "center" });
          return;
        }
        try {
          const pad = 2;
          doc.addImage(
            entry.arrivalSignature, "PNG",
            data.cell.x + pad, data.cell.y + pad,
            data.cell.width - pad * 2, data.cell.height - pad * 2,
            undefined, "FAST"
          );
        } catch {}
        return;
      }

      // Departure signature (col 4)
      if (data.column.index === 4) {
        const entry = sheet.entries[data.row.index];
        if (!entry?.departureSignature) {
          doc.setFont("helvetica", "italic");
          doc.setFontSize(7);
          doc.setTextColor(180, 180, 180);
          doc.text("—", data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: "center" });
          return;
        }
        try {
          const pad = 2;
          doc.addImage(
            entry.departureSignature, "PNG",
            data.cell.x + pad, data.cell.y + pad,
            data.cell.width - pad * 2, data.cell.height - pad * 2,
            undefined, "FAST"
          );
        } catch {}
        return;
      }
    },
  });

  const finalY = (doc as any).lastAutoTable.finalY || y + 60;

  // ─── SIGNATURE BLOCKS ───────────────────────────────────────────────────
  // Three side-by-side blocks: Chef | Admin | (Notes/Comment)
  const sigY = Math.min(finalY + 8, pageH - 58);
  const sigH = 48;
  const totalSigW = pageW - margin * 2;
  const blockW = Math.floor(totalSigW / 3) - 3;

  // Block 1: Chef de Chantier
  drawSignatureBlock(
    doc,
    margin, sigY, blockW, sigH,
    "Signature Chef de Chantier",
    sheet.chefSignature,
    sheet.chefSignedAt,
    sheet.chefName || "Chef de Chantier",
    !sheet.chefSignature,
  );

  // Block 2: Administrateur
  drawSignatureBlock(
    doc,
    margin + blockW + 3, sigY, blockW, sigH,
    "Visa Administrateur",
    sheet.adminSignature,
    sheet.adminSignedAt,
    "Administrateur",
    sheet.status === "APPROUVEE" && !sheet.adminSignature,
  );

  // Block 3: Comment / Notes
  const noteX = margin + (blockW + 3) * 2;
  const noteW = totalSigW - (blockW + 3) * 2;
  if (sheet.adminComment) {
    doc.setFillColor(254, 243, 199);
    doc.setDrawColor(217, 119, 6);
    doc.setLineWidth(0.3);
    doc.roundedRect(noteX, sigY, noteW, sigH, 3, 3, "FD");

    doc.setFillColor(217, 119, 6);
    doc.roundedRect(noteX, sigY, noteW, 7, 3, 3, "F");
    doc.rect(noteX, sigY + 4, noteW, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("COMMENTAIRE ADMINISTRATEUR", noteX + noteW / 2, sigY + 4.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 40, 0);
    const lines = doc.splitTextToSize(sheet.adminComment, noteW - 8);
    doc.text(lines.slice(0, 4), noteX + 4, sigY + 14);
  } else {
    // Show total summary instead
    doc.setFillColor(245, 247, 250);
    doc.setDrawColor(...hexToRgb(BORDER_COLOR));
    doc.setLineWidth(0.3);
    doc.roundedRect(noteX, sigY, noteW, sigH, 3, 3, "FD");

    doc.setFillColor(nr, ng, nb);
    doc.roundedRect(noteX, sigY, noteW, 7, 3, 3, "F");
    doc.rect(noteX, sigY + 4, noteW, 3, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text("RÉCAPITULATIF", noteX + noteW / 2, sigY + 4.5, { align: "center" });

    const lines = [
      [`Présents :`, `${presentCount} ouvrier(s)`],
      [`Absents :`, `${sheet.entries.length - presentCount} ouvrier(s)`],
      [`Total payé :`, formatFCFA(totalAmount)],
    ];
    lines.forEach(([label, val], i) => {
      const ly = sigY + 14 + i * 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(107, 114, 128);
      doc.text(label, noteX + 5, ly);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(15, 45, 76);
      doc.text(val, noteX + noteW - 5, ly, { align: "right" });
    });
  }

  // ─── WATERMARK ──────────────────────────────────────────────────────────
  addWatermark(doc, sheet.status, pageW, pageH);

  // ─── FOOTER ─────────────────────────────────────────────────────────────
  const footerY = pageH - 8;
  doc.setFillColor(nr, ng, nb);
  doc.rect(0, footerY - 3, pageW, 12, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(180, 210, 235);
  const archiveDate = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
  doc.text(
    `HAIROU - Gestion BTP  |  Document confidentiel  |  Archivé le ${archiveDate}`,
    pageW / 2, footerY + 2, { align: "center" }
  );
  doc.setTextColor(120, 160, 200);
  doc.text("Page 1/1", pageW - margin, footerY + 2, { align: "right" });

  // ─── SAVE ───────────────────────────────────────────────────────────────
  const safeName = (sheet.projectName || "projet").replace(/[^a-zA-Z0-9_\-]/g, "_");
  const safeDate = sheet.date.slice(0, 10);
  doc.save(`HAIROU_Pointage_${safeName}_${safeDate}.pdf`);
}
