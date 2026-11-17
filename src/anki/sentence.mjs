// Frase de contexto de uma seleção. Funções puras (sem DOM), testáveis com
// `node --test`. Extensão .mjs: Node e navegador tratam como ES module.

// Abreviações comuns em inglês cujo ponto NÃO termina a frase.
const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "sr", "jr", "st", "mt", "vs", "etc",
  "inc", "ltd", "co", "no", "fig", "approx", "dept", "est",
  "e.g", "i.e", "u.s", "u.k", "a.m", "p.m",
]);

const DEFAULT_MAX_LENGTH = 400;

/**
 * Índices onde cada frase COMEÇA (sempre inclui 0).
 */
export function findSentenceStarts(text) {
  const starts = [0];
  // Pontuação final + fechamentos opcionais (aspas, parênteses) + espaço.
  const pattern = /[.!?…]+["'”’)\]]*\s+/g;
  let match;

  while ((match = pattern.exec(text)) !== null) {
    const next = match.index + match[0].length;
    if (next >= text.length) continue;

    if (!isRealBoundary(text, match.index, match[0], next)) continue;

    starts.push(next);
  }

  return starts;
}

function isRealBoundary(text, punctuationIndex, matched, nextIndex) {
  const nextChar = text[nextIndex];

  // "etc. and" / "Mr. smith": continuação em minúscula não abre frase nova.
  if (/\p{Ll}/u.test(nextChar)) return false;

  // Só pontos finais podem ser abreviação; ! e ? sempre terminam.
  if (!matched.startsWith(".")) return true;

  const before = text.slice(0, punctuationIndex);
  const word = (before.match(/[\p{L}.]+$/u) || [""])[0].toLowerCase();

  // Inicial isolada ("J. K. Rowling").
  if (/^\p{L}$/u.test(word)) return false;
  if (ABBREVIATIONS.has(word)) return false;

  return true;
}

/**
 * Frase que contém a seleção [start, end). Se a seleção atravessa várias
 * frases, devolve do começo da primeira ao fim da última.
 */
export function extractSentence(
  text,
  start,
  end,
  { maxLength = DEFAULT_MAX_LENGTH } = {}
) {
  if (!text || start < 0 || end > text.length || end <= start) return "";

  const starts = findSentenceStarts(text);

  let sentenceStart = 0;
  for (const s of starts) {
    if (s <= start) sentenceStart = s;
  }

  const lastCharIndex = end - 1;
  let sentenceEnd = text.length;
  for (const s of starts) {
    if (s > lastCharIndex) {
      sentenceEnd = s;
      break;
    }
  }

  let from = sentenceStart;
  let to = sentenceEnd;
  let cutStart = false;
  let cutEnd = false;

  // Trecho sem pontuação muito longo: recorta ao redor da seleção.
  if (to - from > maxLength) {
    const room = Math.max(0, Math.floor((maxLength - (end - start)) / 2));
    const newFrom = Math.max(from, start - room);
    const newTo = Math.min(to, end + room);
    cutStart = newFrom > from;
    cutEnd = newTo < to;
    from = snapToWord(text, newFrom, "forward", cutStart);
    to = snapToWord(text, newTo, "backward", cutEnd);
  }

  const sentence = collapseWhitespace(text.slice(from, to));
  return `${cutStart ? "… " : ""}${sentence}${cutEnd ? " …" : ""}`;
}

function snapToWord(text, index, direction, shouldSnap) {
  if (!shouldSnap) return index;

  let i = index;
  if (direction === "forward") {
    while (i < text.length && !/\s/.test(text[i])) i++;
  } else {
    while (i > 0 && !/\s/.test(text[i - 1])) i--;
  }
  return i;
}

export function collapseWhitespace(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
