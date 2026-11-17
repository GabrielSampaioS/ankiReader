import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findSentenceStarts,
  extractSentence,
  collapseWhitespace,
} from "../../src/anki/sentence.mjs";

/** Seleciona `word` dentro de `text` e devolve a frase de contexto. */
function sentenceOf(text, word, options) {
  const start = text.indexOf(word);
  assert.ok(start >= 0, `"${word}" não está no texto de teste`);
  return extractSentence(text, start, start + word.length, options);
}

const TEXT =
  "The quick brown fox jumps over the lazy dog. Reading helps vocabulary grow! " +
  "Do you read every day? Yes, I do.";

test("findSentenceStarts", async (t) => {
  await t.test("sempre começa em 0", () => {
    assert.deepEqual(findSentenceStarts("Sem pontuação final"), [0]);
  });

  await t.test("encontra o começo de cada frase (. ! ?)", () => {
    const starts = findSentenceStarts(TEXT);
    assert.equal(starts.length, 4);
    assert.equal(TEXT.slice(starts[1]).startsWith("Reading"), true);
    assert.equal(TEXT.slice(starts[2]).startsWith("Do you"), true);
    assert.equal(TEXT.slice(starts[3]).startsWith("Yes"), true);
  });

  await t.test("não quebra em abreviações", () => {
    assert.deepEqual(findSentenceStarts("Mr. Smith met Dr. Jones today."), [0]);
    assert.deepEqual(findSentenceStarts("Bring pens, paper, etc. and a book."), [0]);
  });

  await t.test("não quebra em iniciais nem em números decimais", () => {
    assert.deepEqual(findSentenceStarts("J. K. Rowling wrote it."), [0]);
    assert.deepEqual(findSentenceStarts("The value is 3.5 percent."), [0]);
  });

  await t.test("aceita aspas e parênteses depois da pontuação", () => {
    const text = 'He said "go home." Then he left (quietly). Done.';
    const starts = findSentenceStarts(text);
    assert.equal(text.slice(starts[1]).startsWith("Then"), true);
    assert.equal(text.slice(starts[2]).startsWith("Done"), true);
  });

  await t.test("ponto seguido de minúscula continua a mesma frase", () => {
    assert.deepEqual(findSentenceStarts("It ended. and so on."), [0]);
  });

  await t.test("pontuação no fim do texto não cria frase vazia", () => {
    assert.deepEqual(findSentenceStarts("Only one sentence. "), [0]);
  });
});

test("extractSentence", async (t) => {
  await t.test("palavra no meio de uma frase", () => {
    assert.equal(
      sentenceOf(TEXT, "brown"),
      "The quick brown fox jumps over the lazy dog."
    );
  });

  await t.test("palavra em frase do meio", () => {
    assert.equal(sentenceOf(TEXT, "vocabulary"), "Reading helps vocabulary grow!");
  });

  await t.test("palavra na última frase", () => {
    assert.equal(sentenceOf(TEXT, "Yes"), "Yes, I do.");
  });

  await t.test("palavra com a pontuação final selecionada", () => {
    assert.equal(sentenceOf(TEXT, "dog."), "The quick brown fox jumps over the lazy dog.");
  });

  await t.test("primeira palavra do texto", () => {
    assert.equal(sentenceOf(TEXT, "The"), "The quick brown fox jumps over the lazy dog.");
  });

  await t.test("seleção que atravessa frases devolve todas elas", () => {
    assert.equal(
      sentenceOf(TEXT, "dog. Reading"),
      "The quick brown fox jumps over the lazy dog. Reading helps vocabulary grow!"
    );
  });

  await t.test("colapsa quebras de linha e espaços repetidos", () => {
    const text = "The fox\n  jumps   over\nthe dog. Next one.";
    assert.equal(sentenceOf(text, "jumps"), "The fox jumps over the dog.");
  });

  await t.test("abreviação dentro da frase não corta o contexto", () => {
    const text = "I met Dr. Jones yesterday. We talked.";
    assert.equal(sentenceOf(text, "Jones"), "I met Dr. Jones yesterday.");
  });

  await t.test("trecho longo sem pontuação é recortado ao redor da seleção", () => {
    const filler = "word ".repeat(200).trim();
    const text = `${filler} TARGET ${filler}`;
    const result = sentenceOf(text, "TARGET", { maxLength: 100 });

    assert.ok(result.includes("TARGET"));
    assert.ok(result.length <= 130, `ficou com ${result.length} caracteres`);
    assert.ok(result.startsWith("… "));
    assert.ok(result.endsWith(" …"));
  });

  await t.test("entradas inválidas devolvem texto vazio", () => {
    assert.equal(extractSentence("", 0, 1), "");
    assert.equal(extractSentence("abc", 2, 2), "");
    assert.equal(extractSentence("abc", -1, 2), "");
    assert.equal(extractSentence("abc", 0, 10), "");
  });
});

test("collapseWhitespace", () => {
  assert.equal(collapseWhitespace("  a \n\t b  "), "a b");
  assert.equal(collapseWhitespace(""), "");
});
