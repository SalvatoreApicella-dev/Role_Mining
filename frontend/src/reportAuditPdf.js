const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const PAGE_MARGIN = 28;
const TABLE_TOP = 520;
const TABLE_BOTTOM = 44;
const TABLE_ROW_PADDING_Y = 4;
const TABLE_LINE_HEIGHT = 9;
const TABLE_FONT_SIZE = 7;
const TABLE_HEADER_HEIGHT = 20;

function pdfText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E]/g, "?");
}

function splitLongToken(token, maxChars) {
  const chunks = [];
  let start = 0;
  while (start < token.length) {
    chunks.push(token.slice(start, start + maxChars));
    start += maxChars;
  }
  return chunks;
}

function wrapText(value, maxChars) {
  const raw = String(value ?? "");
  if (!raw) return [""];
  const tokens = raw.replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";

  tokens.forEach((token) => {
    const parts = token.length > maxChars ? splitLongToken(token, maxChars) : [token];
    parts.forEach((part) => {
      if (!current) {
        current = part;
        return;
      }
      if (`${current} ${part}`.length <= maxChars) {
        current = `${current} ${part}`;
        return;
      }
      lines.push(current);
      current = part;
    });
  });

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function addText(lines, fontRef, x, y, size, text, color = [0.93, 0.96, 1]) {
  const [r, g, b] = color;
  lines.push(`BT ${fontRef} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${y} Tm (${pdfText(text)}) Tj ET`);
}

function addRect(lines, x, y, w, h, fillRgb) {
  const [r, g, b] = fillRgb;
  lines.push(`${r} ${g} ${b} rg ${x} ${y} ${w} ${h} re f`);
}

function normalizeTableRows(rows, headers) {
  return (Array.isArray(rows) ? rows : []).map((row) =>
    headers.map((header) => String(row?.[header] ?? "")),
  );
}

function buildSummaryPage(model) {
  const lines = [];

  addRect(lines, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, [0.03, 0.06, 0.11]);
  addRect(lines, PAGE_MARGIN, 446, PAGE_WIDTH - PAGE_MARGIN * 2, 112, [0.11, 0.2, 0.38]);
  addRect(lines, PAGE_MARGIN, 332, 240, 72, [0.08, 0.13, 0.24]);
  addRect(lines, 301, 332, 240, 72, [0.08, 0.13, 0.24]);
  addRect(lines, 574, 332, 240 - 28, 72, [0.08, 0.13, 0.24]);
  addRect(lines, PAGE_MARGIN, 220, PAGE_WIDTH - PAGE_MARGIN * 2, 88, [0.08, 0.12, 0.2]);
  addRect(lines, PAGE_MARGIN, 58, PAGE_WIDTH - PAGE_MARGIN * 2, 136, [0.06, 0.1, 0.18]);

  addText(lines, "/F1", 48, 526, 11, "ROLE MINING AUDIT REPORT", [0.66, 0.78, 1]);
  addText(lines, "/F1", 48, 486, 24, model.title, [0.97, 0.98, 1]);
  addText(lines, "/F1", 48, 460, 11, model.description, [0.77, 0.84, 0.95]);

  addText(lines, "/F1", 46, 380, 9, "ROWS EXPORTED", [0.56, 0.68, 0.88]);
  addText(lines, "/F1", 46, 350, 22, String(model.rowCount), [0.97, 0.98, 1]);
  addText(lines, "/F1", 319, 380, 9, "COLUMNS", [0.56, 0.68, 0.88]);
  addText(lines, "/F1", 319, 350, 22, String(model.columnCount), [0.97, 0.98, 1]);
  addText(lines, "/F1", 592, 380, 9, "AUDIENCE", [0.56, 0.68, 0.88]);
  addText(lines, "/F1", 592, 350, 18, model.audience, [0.97, 0.98, 1]);

  addText(lines, "/F1", 48, 284, 12, "Audit Highlights", [0.94, 0.96, 1]);
  model.highlights.forEach((item, index) => {
    addText(lines, "/F1", 58, 258 - index * 18, 10, `- ${item}`, [0.8, 0.87, 0.97]);
  });

  addText(lines, "/F1", 48, 164, 12, "Export Scope", [0.94, 0.96, 1]);
  addText(lines, "/F1", 58, 138, 10, "This PDF contains the full report table on the following pages.", [0.8, 0.87, 0.97]);
  addText(lines, "/F1", 58, 118, 10, "Rows are wrapped across lines when needed. No report rows are truncated.", [0.8, 0.87, 0.97]);
  addText(lines, "/F1", 58, 98, 10, `Generated at ${model.generatedAt}`, [0.8, 0.87, 0.97]);

  return lines.join("\n");
}

function renderTablePage({ model, headers, pageRows, pageIndex, totalPages }) {
  const lines = [];
  const usableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const colWidth = usableWidth / Math.max(1, headers.length);

  addRect(lines, 0, 0, PAGE_WIDTH, PAGE_HEIGHT, [0.03, 0.06, 0.11]);
  addRect(lines, PAGE_MARGIN, 548, usableWidth, 24, [0.11, 0.2, 0.38]);
  addText(lines, "/F1", 36, 556, 11, `${model.title} - Full Table`, [0.95, 0.97, 1]);
  addText(lines, "/F1", PAGE_WIDTH - 118, 556, 9, `Page ${pageIndex} / ${totalPages}`, [0.77, 0.84, 0.95]);

  addRect(lines, PAGE_MARGIN, TABLE_TOP - TABLE_HEADER_HEIGHT, usableWidth, TABLE_HEADER_HEIGHT, [0.12, 0.18, 0.3]);
  headers.forEach((header, headerIndex) => {
    const cellX = PAGE_MARGIN + headerIndex * colWidth + 4;
    addText(lines, "/F2", cellX, TABLE_TOP - 14, 7, header, [0.95, 0.97, 1]);
  });

  let y = TABLE_TOP - TABLE_HEADER_HEIGHT - 6;

  pageRows.forEach((row, rowIndex) => {
    const rowHeight = row.height;
    const bgY = y - rowHeight + 2;
    addRect(lines, PAGE_MARGIN, bgY, usableWidth, rowHeight, rowIndex % 2 === 0 ? [0.08, 0.12, 0.2] : [0.06, 0.1, 0.17]);

    row.cells.forEach((cellLines, cellIndex) => {
      const cellX = PAGE_MARGIN + cellIndex * colWidth + 4;
      cellLines.forEach((line, lineIndex) => {
        const lineY = y - 9 - lineIndex * TABLE_LINE_HEIGHT;
        addText(lines, "/F2", cellX, lineY, TABLE_FONT_SIZE, line, [0.86, 0.91, 0.99]);
      });
    });

    y -= rowHeight;
  });

  addText(lines, "/F1", PAGE_MARGIN, 18, 8, "Complete audit table export", [0.66, 0.78, 1]);
  return lines.join("\n");
}

function paginateTable(model) {
  const headers = model.headers;
  const usableWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const colWidth = usableWidth / Math.max(1, headers.length);
  const maxCharsPerCol = Math.max(6, Math.floor((colWidth - 8) / 4.6));
  const sourceRows = normalizeTableRows(model.rows, headers);

  const preparedRows = sourceRows.map((row) => {
    const cells = row.map((cell) => wrapText(cell, maxCharsPerCol));
    const maxLines = Math.max(...cells.map((cellLines) => cellLines.length), 1);
    return {
      cells,
      height: maxLines * TABLE_LINE_HEIGHT + TABLE_ROW_PADDING_Y * 2 + 4,
    };
  });

  const pages = [];
  let current = [];
  let usedHeight = 0;
  const availableHeight = TABLE_TOP - TABLE_BOTTOM - TABLE_HEADER_HEIGHT - 8;

  preparedRows.forEach((row) => {
    if (current.length && usedHeight + row.height > availableHeight) {
      pages.push(current);
      current = [];
      usedHeight = 0;
    }
    current.push(row);
    usedHeight += row.height;
  });

  if (current.length || !pages.length) {
    pages.push(current);
  }

  return pages;
}

export function buildAuditPdfModel(report, generatedAtIso = new Date().toISOString()) {
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const headers = rows.length ? Object.keys(rows[0]) : [];

  return {
    title: String(report?.title || "Audit Report"),
    description: String(report?.description || ""),
    audience: String(report?.audience || "Audit"),
    generatedAt: generatedAtIso,
    rowCount: rows.length,
    columnCount: headers.length,
    headers,
    rows,
    filename: String(report?.filename || "audit_report.csv").replace(/\.csv$/i, ".pdf"),
    highlights: [
      `Rows exported: ${rows.length}`,
      `Columns included: ${headers.length}`,
      `Audience: ${String(report?.audience || "Audit")}`,
    ],
  };
}

export function buildAuditPdfBytes(model) {
  const encoder = new TextEncoder();
  const tablePages = paginateTable(model);
  const pageStreams = [
    buildSummaryPage(model),
    ...tablePages.map((pageRows, index) =>
      renderTablePage({
        model,
        headers: model.headers,
        pageRows,
        pageIndex: index + 2,
        totalPages: tablePages.length + 1,
      }),
    ),
  ];

  const objects = [];
  const pageObjectNumbers = [];

  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  objects.push("PAGES_PLACEHOLDER");

  pageStreams.forEach((stream) => {
    const pageObjectNumber = objects.length + 1;
    const contentObjectNumber = objects.length + 2;
    pageObjectNumbers.push(pageObjectNumber);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${contentObjectNumber + 1} 0 R /F2 ${contentObjectNumber + 2} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );
    objects.push(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>");

  objects[1] = `<< /Type /Pages /Count ${pageStreams.length} /Kids [${pageObjectNumbers.map((n) => `${n} 0 R`).join(" ")}] >>`;

  let output = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = output.length;
  output += `xref\n0 ${objects.length + 1}\n`;
  output += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    output += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return encoder.encode(output);
}
