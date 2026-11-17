// Lê a seleção do usuário dentro da camada de texto do PDF.js e descobre a
// frase em que ela está. A parte DOM fica aqui; a lógica de frases é pura e
// vive em /src/anki/sentence.mjs.

import { extractSentence, collapseWhitespace } from "/src/anki/sentence.mjs";

/**
 * Texto corrido da camada (uma linha vira um espaço) e a posição inicial de
 * cada nó de texto dentro dele.
 */
export function buildPageText(layer) {
  const offsets = new Map();
  let text = "";

  const walker = document.createTreeWalker(
    layer,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT
  );

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      offsets.set(node, text.length);
      text += node.nodeValue;
    } else if (node.nodeName === "BR") {
      // O PDF.js marca o fim de linha com <br>; no texto corrido vira espaço.
      text += " ";
    }
  }

  return { text, offsets };
}

// Converte um ponto do DOM (nó + deslocamento) em posição no texto corrido.
function toTextOffset(container, offset, { text, offsets }, layer) {
  if (container.nodeType === Node.TEXT_NODE) {
    const base = offsets.get(container);
    return base === undefined ? null : base + offset;
  }

  // Ponto em um elemento: vale o primeiro texto que começa a partir dele.
  const point = document.createRange();
  point.setStart(container, offset);
  point.collapse(true);

  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (point.comparePoint(node, 0) >= 0) return offsets.get(node);
  }

  return text.length;
}

/**
 * @returns {{ selected: string, context: string } | null}
 *   `selected` é o texto selecionado; `context` é a frase que o contém
 *   (vazio se não foi possível localizar). Null se não há seleção na camada.
 */
export function readSelectionContext(layer) {
  const selection = window.getSelection();

  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);

  if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer)) {
    return null;
  }

  const rawSelected = selection.toString();
  const selected = collapseWhitespace(rawSelected);

  if (!selected) return null;

  const info = buildPageText(layer);

  let start = toTextOffset(range.startContainer, range.startOffset, info, layer);
  let end = toTextOffset(range.endContainer, range.endOffset, info, layer);

  // Plano B: procura o texto selecionado no texto corrido da página.
  if (start === null || end === null || end <= start) {
    start = info.text.indexOf(rawSelected);
    end = start >= 0 ? start + rawSelected.length : -1;
  }

  const context = start >= 0 && end > start ? extractSentence(info.text, start, end) : "";

  return { selected, context };
}
