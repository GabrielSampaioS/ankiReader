// Montagem do cartão do Anki. Funções puras (sem DOM), testáveis com
// `node --test`.
//
// Mapeamento para o AnkiDroid (nota "Básico"): ao receber um compartilhamento
// de texto, o AnkiDroid usa o ASSUNTO como Frente e o TEXTO como Verso.
// No Web Share, `title` vira o assunto e `text` vira o texto.
// Se o mapeamento mudar, ajuste só buildSharePayload.

import { collapseWhitespace } from "./sentence.mjs";

// Pontuação que costuma vir colada na palavra ao arrastar a seleção.
const EDGE_PUNCTUATION = /^[\s.,;:!?"“”‘’()[\]{}…—–-]+|[\s.,;:!?"“”‘’()[\]{}…—–-]+$/gu;

/**
 * Texto da frente: espaços colapsados e sem pontuação nas pontas.
 */
export function cleanFront(selected) {
  const collapsed = collapseWhitespace(selected ?? "");
  const stripped = collapsed.replace(EDGE_PUNCTUATION, "");
  // Seleção só de pontuação: mantém o que o usuário selecionou.
  return stripped || collapsed;
}

/**
 * Verso: o que o usuário digitou e, opcionalmente, a frase de contexto.
 */
export function buildBack({ back = "", context = "", includeContext = true }) {
  const typed = String(back).trim();
  const sentence = includeContext ? collapseWhitespace(context) : "";

  if (typed && sentence) return `${typed}\n\n${sentence}`;
  return typed || sentence;
}

/**
 * Dados do cartão prontos para envio.
 */
export function buildCard({
  selected,
  context = "",
  back = "",
  includeContext = true,
}) {
  return {
    front: cleanFront(selected),
    back: buildBack({ back, context, includeContext }),
  };
}

/**
 * Argumento de navigator.share(): title → Frente, text → Verso.
 * O Web Share recusa dados sem nenhum campo, por isso o verso vazio é omitido.
 */
export function buildSharePayload(card) {
  const payload = { title: card.front };
  if (card.back) payload.text = card.back;
  return payload;
}

/**
 * Arquivo de texto no formato de importação do Anki (campos separados por
 * tab, uma nota por linha). As diretivas "#" dizem ao Anki como ler.
 */
export function buildImportFile(card) {
  const lines = ["#separator:tab", "#html:false", `${quote(card.front)}\t${quote(card.back)}`];
  return `${lines.join("\n")}\n`;
}

// Campos com tab, quebra de linha ou aspas vão entre aspas (regra do CSV).
function quote(field) {
  if (/[\t\n\r"]/.test(field)) return `"${field.replace(/"/g, '""')}"`;
  return field;
}

/**
 * Nome de arquivo seguro, a partir da frente do cartão.
 */
export function buildFileName(front) {
  const slug = String(front)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return `anki-${slug || "cartao"}.txt`;
}
