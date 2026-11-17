// Gera PDFs mínimos e válidos, sem dependências, para os testes.
// Cada página é preenchida por uma cor sólida, assim os testes conseguem
// descobrir QUAL página foi renderizada lendo um pixel do canvas.

const COLORS = [
  [1, 0, 0], // página 1: vermelho
  [0, 1, 0], // página 2: verde
  [0, 0, 1], // página 3: azul
  [1, 1, 0], // página 4: amarelo
  [1, 0, 1], // página 5: magenta
  [0, 1, 1], // página 6: ciano
];

const PAGE_COLORS_RGB = COLORS.map(([r, g, b]) => [
  r * 255,
  g * 255,
  b * 255,
]);

/**
 * @param {{
 *   pages?: number, width?: number, height?: number,
 *   text?: { str: string, x: number, y: number, size?: number }[]
 * }} options  `text` desenha linhas de texto (Helvetica) em todas as páginas;
 *   x e y seguem o PDF: origem no canto inferior esquerdo, em pontos.
 * @returns {Buffer}
 */
function makePdf({ pages = 5, width = 612, height = 792, text = [] } = {}) {
  if (pages < 1 || pages > COLORS.length) {
    throw new Error(`makePdf suporta de 1 a ${COLORS.length} páginas`);
  }

  const objects = [];
  // 1: catálogo, 2: árvore de páginas; páginas e conteúdos vêm depois.
  const pageObjectIds = [];
  for (let i = 0; i < pages; i++) pageObjectIds.push(3 + i * 2);

  const fontId = 3 + pages * 2;
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${pages} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`;

  for (let i = 0; i < pages; i++) {
    const pageId = 3 + i * 2;
    const contentId = pageId + 1;
    const [r, g, b] = COLORS[i];
    let stream = `${r} ${g} ${b} rg 0 0 ${width} ${height} re f`;

    for (const { str, x, y, size = 18 } of text) {
      const safe = str.replace(/[\\()]/g, "\\$&");
      stream += `\nBT 0 0 0 rg /F1 ${size} Tf ${x} ${y} Td (${safe}) Tj ET`;
    }

    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Contents ${contentId} 0 R ` +
      `/Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
    objects[contentId] =
      `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  }

  let body = "%PDF-1.4\n";
  const offsets = [];

  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body);
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length}\n`;
  body += "0000000000 65535 f \n";
  for (let id = 1; id < objects.length; id++) {
    body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body, "latin1");
}

module.exports = { makePdf, PAGE_COLORS_RGB };
