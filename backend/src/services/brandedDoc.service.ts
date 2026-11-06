import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TabStopType,
  TextRun,
  WidthType,
} from 'docx';

/**
 * The SWFS company document template, shared by every PDF and Word export.
 *
 * Exports describe their content as a list of blocks (`BrandedDoc`), and the
 * two renderers below lay it out on the same fixed letterhead:
 *   - header on every page: SWFS logo + wordmark, document type and date, red rule
 *   - title + subtitle on page one
 *   - footer on every page: confidentiality note, company line, "Page X of Y"
 * Change the template here and both formats follow.
 */

export type ExportFormat = 'pdf' | 'docx';

export type Block =
  | { kind: 'section'; title: string }
  | { kind: 'facts'; rows: [string, unknown][] }
  | { kind: 'entry'; title: string; meta?: string; body?: string }
  | { kind: 'text'; text: string }
  | { kind: 'chips'; items: string[] }
  | { kind: 'score'; value: string; label: string; lines: { text: string; muted?: boolean }[] };

export interface BrandedDoc {
  /** e.g. "Candidate profile" — shown in the header on every page. */
  docType: string;
  title: string;
  subtitle?: string;
  /** Confidentiality line in the footer of every page. */
  footerNote: string;
  blocks: Block[];
}

/** Letterhead identity. `line` (tagline / address / website) is optional — shown under the wordmark when set. */
export const COMPANY: { name: string; line?: string } = {
  name: 'SWFS',
};

export const BRAND = '#E5484D';
const INK = '#111827';
const MUTED = '#6B7280';
const RULE = '#E5E7EB';
const hex = (c: string) => c.replace('#', '');

// Shipped with the backend (backend/assets) so it works in a deployed build;
// the frontend copy is a dev fallback.
const LOGO_PATH = [
  path.join(__dirname, '../../assets/logo.png'),
  path.join(__dirname, '../../../frontend/src/assets/SWFS-LOGO White Theme.png'),
].find((p) => fs.existsSync(p));
const LOGO: Buffer | null = LOGO_PATH ? fs.readFileSync(LOGO_PATH) : null;
/** PNG width / height, read from the IHDR chunk. */
const LOGO_RATIO = LOGO && LOGO.length > 24 ? LOGO.readUInt32BE(16) / LOGO.readUInt32BE(20) : 1;

const today = () => new Date().toLocaleDateString('en-US', { dateStyle: 'medium' });

// Built-in PDF fonts are WinAnsi; drop characters they can't render.
export const safe = (s: unknown) =>
  String(s ?? '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—•…]/g, '');

const factValue = (v: unknown) => (Array.isArray(v) ? v.join(', ') : String(v));
const visibleFacts = (rows: [string, unknown][]) =>
  rows.filter(([, v]) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length));

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------

const M = { top: 92, bottom: 64, left: 50, right: 50 };
type Doc = PDFKit.PDFDocument;

function pdfLetterhead(doc: Doc, d: BrandedDoc) {
  const w = doc.page.width;
  const logoH = 28;
  let x = M.left;
  if (LOGO_PATH) {
    try {
      // By path, so pdfkit embeds the image once and reuses it on every page.
      doc.image(LOGO_PATH, x, 32, { height: logoH });
      x += logoH * LOGO_RATIO + 8;
    } catch {
      /* unreadable logo — wordmark only */
    }
  }
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(COMPANY.name, x, COMPANY.line ? 35 : 39, { lineBreak: false });
  if (COMPANY.line) doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(safe(COMPANY.line), x, 52, { lineBreak: false });
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(8).text(d.docType.toUpperCase(), w - M.right - 200, 36, { width: 200, align: 'right', characterSpacing: 0.8, lineBreak: false });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(`Generated ${today()}`, w - M.right - 200, 50, { width: 200, align: 'right', lineBreak: false });
  doc.save().moveTo(M.left, 70).lineTo(w - M.right, 70).lineWidth(1.5).strokeColor(BRAND).stroke().restore();
}

function pdfFooter(doc: Doc, d: BrandedDoc, page: number, total: number) {
  const w = doc.page.width;
  const y = doc.page.height - 46;
  doc.save().moveTo(M.left, y - 8).lineTo(w - M.right, y - 8).lineWidth(0.75).strokeColor(RULE).stroke().restore();
  doc.fillColor(MUTED).font('Helvetica').fontSize(7.5).text(safe(d.footerNote), M.left, y, { width: w - 200, lineBreak: false });
  doc.text(`Page ${page} of ${total}`, w - M.right - 80, y, { width: 80, align: 'right', lineBreak: false });
}

function pdfRule(doc: Doc, color = RULE, width = 0.75) {
  const y = doc.y + 4;
  doc.save().moveTo(M.left, y).lineTo(doc.page.width - M.right, y).lineWidth(width).strokeColor(color).stroke().restore();
  doc.y = y + 8;
}

function pdfBlock(doc: Doc, b: Block) {
  const contentW = doc.page.width - M.left - M.right;
  const bottom = doc.page.height - M.bottom;
  switch (b.kind) {
    case 'section':
      if (doc.y > bottom - 90) doc.addPage();
      doc.moveDown(0.8);
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(9).text(safe(b.title).toUpperCase(), M.left, doc.y, { characterSpacing: 0.8 });
      pdfRule(doc);
      doc.fillColor(INK).font('Helvetica').fontSize(10);
      break;
    case 'facts': {
      const items = visibleFacts(b.rows);
      const colW = contentW / 2;
      for (let i = 0; i < items.length; i += 2) {
        if (doc.y > bottom - 30) doc.addPage();
        const y = doc.y;
        let maxY = y;
        [items[i], items[i + 1]].forEach((it, col) => {
          if (!it) return;
          const x = M.left + col * colW;
          doc.fillColor(MUTED).font('Helvetica').fontSize(8).text(safe(it[0]), x, y, { width: colW - 12 });
          doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(factValue(it[1])), x, doc.y + 1, { width: colW - 12 });
          maxY = Math.max(maxY, doc.y);
        });
        doc.y = maxY + 6;
      }
      doc.x = M.left;
      break;
    }
    case 'entry':
      if (doc.y > bottom - 50) doc.addPage();
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(10.5).text(safe(b.title), M.left, doc.y, { width: contentW });
      if (b.meta) doc.fillColor(MUTED).font('Helvetica').fontSize(9).text(safe(b.meta), { width: contentW });
      if (b.body) doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(b.body), { width: contentW });
      doc.moveDown(0.5);
      break;
    case 'text':
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(b.text), M.left, doc.y, { width: contentW });
      break;
    case 'chips':
      doc.fillColor(INK).font('Helvetica').fontSize(10).text(safe(b.items.join('  •  ')), M.left, doc.y, { width: contentW, lineGap: 2 });
      break;
    case 'score': {
      const y = doc.y;
      doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(22).text(safe(b.value), M.left, y, { lineBreak: false });
      const valueW = doc.widthOfString(safe(b.value));
      doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(safe(b.label), M.left + valueW + 8, y + 9, { lineBreak: false });
      doc.x = M.left;
      doc.y = y + 30;
      for (const l of b.lines) doc.fillColor(l.muted ? MUTED : INK).fontSize(10).text(safe(l.text), M.left, doc.y, { width: contentW });
      break;
    }
  }
}

function renderPdf(d: BrandedDoc): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margins: M,
    bufferPages: true,
    info: { Title: `${safe(d.title)} — ${d.docType}`, Author: COMPANY.name, Creator: COMPANY.name },
  });
  const done = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20).text(safe(d.title), M.left, M.top);
  if (d.subtitle) doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(safe(d.subtitle));
  doc.moveDown(0.3);
  for (const b of d.blocks) pdfBlock(doc, b);

  // Letterhead + footer on every page, once the page count is known.
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins = { top: 0, bottom: 0, left: 0, right: 0 };
    pdfLetterhead(doc, d);
    pdfFooter(doc, d, i - range.start + 1, range.count);
  }
  doc.end();
  return done;
}

// ---------------------------------------------------------------------------
// Word (.docx)
// ---------------------------------------------------------------------------

const FONT = 'Calibri';
const PT = (n: number) => n * 2; // docx sizes are half-points
const TW = (pt: number) => pt * 20; // twips
const A4 = { w: 11906, h: 16838 };
const DOCX_MARGIN = TW(50);
const CONTENT_TW = A4.w - DOCX_MARGIN * 2;
const RIGHT_TAB = [{ type: TabStopType.RIGHT, position: CONTENT_TW }];
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };

const run = (text: string, o: { size?: number; bold?: boolean; color?: string; spacing?: number } = {}) =>
  new TextRun({ text, font: FONT, size: PT(o.size ?? 10), bold: o.bold, color: hex(o.color ?? INK), characterSpacing: o.spacing });

function docxLetterhead(d: BrandedDoc): Header {
  const logoH = 36;
  const left: (TextRun | ImageRun)[] = [];
  if (LOGO) {
    left.push(new ImageRun({ type: 'png', data: LOGO, transformation: { width: Math.round(logoH * LOGO_RATIO), height: logoH } }));
    left.push(run('  '));
  }
  left.push(run(COMPANY.name, { size: 15, bold: true }));
  return new Header({
    children: [
      new Paragraph({
        tabStops: RIGHT_TAB,
        children: [...left, new TextRun({ text: '\t', font: FONT }), run(d.docType.toUpperCase(), { size: 8, bold: true, color: BRAND, spacing: 16 })],
      }),
      new Paragraph({
        tabStops: RIGHT_TAB,
        border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: hex(BRAND), space: 6 } },
        spacing: { after: 120 },
        children: [run(COMPANY.line ?? '', { size: 7.5, color: MUTED }), new TextRun({ text: '\t', font: FONT }), run(`Generated ${today()}`, { size: 8, color: MUTED })],
      }),
    ],
  });
}

function docxFooter(d: BrandedDoc): Footer {
  const small = { font: FONT, size: PT(7.5), color: hex(MUTED) };
  return new Footer({
    children: [
      new Paragraph({
        tabStops: RIGHT_TAB,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: hex(RULE), space: 6 } },
        children: [
          new TextRun({ ...small, text: d.footerNote }),
          new TextRun({ ...small, children: ['\tPage ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });
}

function docxFacts(rows: [string, unknown][]): Table {
  const items = visibleFacts(rows);
  const half = Math.floor(CONTENT_TW / 2);
  const cell = (it?: [string, unknown]) =>
    new TableCell({
      width: { size: half, type: WidthType.DXA },
      borders: NO_BORDERS,
      margins: { bottom: 80, left: 0, right: 120 },
      children: it
        ? [new Paragraph({ children: [run(it[0], { size: 8, color: MUTED })] }), new Paragraph({ children: [run(factValue(it[1]))] })]
        : [new Paragraph('')],
    });
  const tableRows: TableRow[] = [];
  for (let i = 0; i < items.length; i += 2) tableRows.push(new TableRow({ children: [cell(items[i]), cell(items[i + 1])] }));
  return new Table({ width: { size: CONTENT_TW, type: WidthType.DXA }, columnWidths: [half, half], borders: NO_BORDERS, rows: tableRows });
}

function docxBlock(b: Block): (Paragraph | Table)[] {
  switch (b.kind) {
    case 'section':
      return [
        new Paragraph({
          keepNext: true,
          spacing: { before: 280, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: hex(RULE), space: 4 } },
          children: [run(b.title.toUpperCase(), { size: 9, bold: true, color: BRAND, spacing: 16 })],
        }),
      ];
    case 'facts':
      return visibleFacts(b.rows).length ? [docxFacts(b.rows)] : [];
    case 'entry':
      return [
        new Paragraph({ keepNext: !!(b.meta || b.body), children: [run(b.title, { size: 10.5, bold: true })] }),
        ...(b.meta ? [new Paragraph({ keepNext: !!b.body, children: [run(b.meta, { size: 9, color: MUTED })] })] : []),
        ...(b.body ? [new Paragraph({ children: [run(b.body)] })] : []),
        new Paragraph({ spacing: { after: 60 }, children: [] }),
      ];
    case 'text':
      return b.text.split(/\n+/).map((t) => new Paragraph({ spacing: { after: 80 }, children: [run(t)] }));
    case 'chips':
      return [new Paragraph({ children: [run(b.items.join('  •  '))] })];
    case 'score':
      return [
        new Paragraph({ children: [run(b.value, { size: 22, bold: true, color: BRAND }), run(`   ${b.label}`, { color: MUTED })] }),
        ...b.lines.map((l) => new Paragraph({ children: [run(l.text, { color: l.muted ? MUTED : INK })] })),
      ];
  }
}

function renderDocx(d: BrandedDoc): Promise<Buffer> {
  const doc = new Document({
    creator: COMPANY.name,
    title: `${d.title} — ${d.docType}`,
    styles: { default: { document: { run: { font: FONT, size: PT(10), color: hex(INK) } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: A4.w, height: A4.h },
            margin: { top: TW(100), bottom: TW(72), left: DOCX_MARGIN, right: DOCX_MARGIN, header: TW(30), footer: TW(24) },
          },
        },
        headers: { default: docxLetterhead(d) },
        footers: { default: docxFooter(d) },
        children: [
          new Paragraph({ children: [run(d.title, { size: 20, bold: true })] }),
          ...(d.subtitle ? [new Paragraph({ spacing: { after: 120 }, children: [run(d.subtitle, { size: 11, color: MUTED })] })] : []),
          ...d.blocks.flatMap(docxBlock),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}

// ---------------------------------------------------------------------------

export const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export const parseFormat = (v: unknown): ExportFormat => (v === 'docx' ? 'docx' : 'pdf');

export function renderBrandedDoc(d: BrandedDoc, format: ExportFormat): Promise<Buffer> {
  return format === 'docx' ? renderDocx(d) : renderPdf(d);
}
