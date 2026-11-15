// Funções puras do leitor (sem DOM, sem PDF.js), para poderem ser testadas
// isoladamente com `node --test`. Extensão .mjs: Node e navegador tratam
// o arquivo como ES module sem depender do "type" do package.json.

/**
 * Limita a página ao intervalo [1, total]. Entradas inválidas viram 1.
 */
export function clampPage(page, total) {
  const max = Math.max(1, Math.floor(Number(total)) || 1);
  const n = Math.floor(Number(page)) || 1;
  return Math.min(Math.max(1, n), max);
}

/**
 * Escala que faz a página inteira caber na área disponível,
 * sem rolagem e sem distorcer a proporção.
 */
export function computeFitScale({
  availableWidth,
  availableHeight,
  pageWidth,
  pageHeight,
}) {
  if (!availableWidth || !availableHeight || !pageWidth || !pageHeight) {
    return 0;
  }

  return Math.min(availableWidth / pageWidth, availableHeight / pageHeight);
}

/**
 * Decide o que um toque/clique faz, conforme a posição horizontal.
 * Retorna "prev" (extremidade esquerda), "next" (direita) ou null (centro).
 */
export function resolveEdgeAction({ clientX, left, width, zone = 0.25 }) {
  if (!width) return null;

  const ratio = (clientX - left) / width;

  if (ratio <= zone) return "prev";
  if (ratio >= 1 - zone) return "next";
  return null;
}
