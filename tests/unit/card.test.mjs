import { test } from "node:test";
import assert from "node:assert/strict";

import {
  cleanFront,
  buildBack,
  buildCard,
  buildSharePayload,
  buildImportFile,
  buildFileName,
} from "../../src/anki/card.mjs";

test("cleanFront", async (t) => {
  await t.test("remove pontuação e espaços nas pontas", () => {
    assert.equal(cleanFront("  brown,  "), "brown");
    assert.equal(cleanFront('"hello!"'), "hello");
    assert.equal(cleanFront("(maybe)."), "maybe");
  });

  await t.test("preserva apóstrofo e hífen no meio", () => {
    assert.equal(cleanFront("don't"), "don't");
    assert.equal(cleanFront("well-known,"), "well-known");
  });

  await t.test("colapsa quebras de linha de seleções de várias linhas", () => {
    assert.equal(cleanFront("look\n  forward to"), "look forward to");
  });

  await t.test("seleção só de pontuação é mantida", () => {
    assert.equal(cleanFront("..."), "...");
  });

  await t.test("entradas vazias ou ausentes viram texto vazio", () => {
    assert.equal(cleanFront(""), "");
    assert.equal(cleanFront(undefined), "");
    assert.equal(cleanFront(null), "");
  });
});

test("buildBack", async (t) => {
  const context = "The quick brown fox jumps.";

  await t.test("verso digitado + frase, separados por linha em branco", () => {
    assert.equal(
      buildBack({ back: "marrom", context }),
      "marrom\n\nThe quick brown fox jumps."
    );
  });

  await t.test("sem verso digitado, usa só a frase", () => {
    assert.equal(buildBack({ back: "   ", context }), context);
  });

  await t.test("frase desligada: só o que foi digitado", () => {
    assert.equal(buildBack({ back: "marrom", context, includeContext: false }), "marrom");
  });

  await t.test("nada digitado e frase desligada: verso vazio", () => {
    assert.equal(buildBack({ back: "", context, includeContext: false }), "");
  });

  await t.test("preserva quebras de linha do verso digitado", () => {
    assert.equal(
      buildBack({ back: "linha 1\nlinha 2", context: "", includeContext: true }),
      "linha 1\nlinha 2"
    );
  });
});

test("buildCard e buildSharePayload", async (t) => {
  await t.test("frente limpa e verso montado", () => {
    const card = buildCard({
      selected: " brown, ",
      context: "The brown fox.",
      back: "marrom",
    });
    assert.deepEqual(card, { front: "brown", back: "marrom\n\nThe brown fox." });
  });

  await t.test("title vira a frente e text o verso", () => {
    assert.deepEqual(buildSharePayload({ front: "brown", back: "marrom" }), {
      title: "brown",
      text: "marrom",
    });
  });

  await t.test("verso vazio não envia o campo text", () => {
    assert.deepEqual(buildSharePayload({ front: "brown", back: "" }), { title: "brown" });
  });
});

test("buildImportFile", async (t) => {
  await t.test("cabeçalho com diretivas e uma linha por nota", () => {
    const file = buildImportFile({ front: "brown", back: "marrom" });
    assert.equal(file, "#separator:tab\n#html:false\nbrown\tmarrom\n");
  });

  await t.test("campos com quebra de linha vão entre aspas", () => {
    const file = buildImportFile({ front: "brown", back: "marrom\n\nThe fox." });
    assert.equal(file, '#separator:tab\n#html:false\nbrown\t"marrom\n\nThe fox."\n');
  });

  await t.test("aspas dentro do campo são duplicadas", () => {
    const file = buildImportFile({ front: 'say "hi"', back: "oi" });
    assert.ok(file.includes('"say ""hi"""\toi'));
  });

  await t.test("tab dentro do campo não quebra as colunas", () => {
    const file = buildImportFile({ front: "a\tb", back: "c" });
    assert.ok(file.includes('"a\tb"\tc'));
  });

  await t.test("verso vazio mantém as duas colunas", () => {
    const file = buildImportFile({ front: "brown", back: "" });
    assert.ok(file.endsWith("brown\t\n"));
  });
});

test("buildFileName", async (t) => {
  await t.test("usa a frente em minúsculas e sem acentos", () => {
    assert.equal(buildFileName("Olá Mundo"), "anki-ola-mundo.txt");
  });

  await t.test("troca símbolos por hífen e limita o tamanho", () => {
    assert.equal(buildFileName("look forward to!"), "anki-look-forward-to.txt");
    assert.ok(buildFileName("x".repeat(200)).length <= "anki-.txt".length + 40);
  });

  await t.test("frente vazia ou só símbolos usa um nome padrão", () => {
    assert.equal(buildFileName(""), "anki-cartao.txt");
    assert.equal(buildFileName("???"), "anki-cartao.txt");
  });
});
