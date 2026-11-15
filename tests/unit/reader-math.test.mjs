import { test } from "node:test";
import assert from "node:assert/strict";

import {
  clampPage,
  computeFitScale,
  resolveEdgeAction,
} from "../../src/reader/reader-math.mjs";

test("clampPage", async (t) => {
  await t.test("mantém páginas dentro do intervalo", () => {
    assert.equal(clampPage(1, 10), 1);
    assert.equal(clampPage(5, 10), 5);
    assert.equal(clampPage(10, 10), 10);
  });

  await t.test("limita abaixo de 1 e acima do total", () => {
    assert.equal(clampPage(0, 10), 1);
    assert.equal(clampPage(-3, 10), 1);
    assert.equal(clampPage(11, 10), 10);
    assert.equal(clampPage(999, 10), 10);
  });

  await t.test("aceita texto numérico e arredonda para baixo", () => {
    assert.equal(clampPage("4", 10), 4);
    assert.equal(clampPage(3.9, 10), 3);
  });

  await t.test("entradas inválidas viram a página 1", () => {
    assert.equal(clampPage("abc", 10), 1);
    assert.equal(clampPage(undefined, 10), 1);
    assert.equal(clampPage(null, 10), 1);
    assert.equal(clampPage(NaN, 10), 1);
  });

  await t.test("total ausente ou inválido nunca devolve menos que 1", () => {
    assert.equal(clampPage(5, 0), 1);
    assert.equal(clampPage(5, undefined), 1);
  });
});

test("computeFitScale", async (t) => {
  await t.test("página retrato em área paisagem: limitada pela altura", () => {
    const scale = computeFitScale({
      availableWidth: 1200,
      availableHeight: 800,
      pageWidth: 600,
      pageHeight: 800,
    });
    assert.equal(scale, 1);
  });

  await t.test("página retrato em área estreita: limitada pela largura", () => {
    const scale = computeFitScale({
      availableWidth: 300,
      availableHeight: 2000,
      pageWidth: 600,
      pageHeight: 800,
    });
    assert.equal(scale, 0.5);
  });

  await t.test("a página escalada nunca ultrapassa a área disponível", () => {
    const cases = [
      [1280, 800, 612, 792],
      [800, 1280, 612, 792],
      [500, 500, 842, 595],
      [3000, 100, 612, 792],
    ];

    for (const [aw, ah, pw, ph] of cases) {
      const s = computeFitScale({
        availableWidth: aw,
        availableHeight: ah,
        pageWidth: pw,
        pageHeight: ph,
      });
      assert.ok(pw * s <= aw + 1e-9, `largura excedida em ${aw}x${ah}`);
      assert.ok(ph * s <= ah + 1e-9, `altura excedida em ${aw}x${ah}`);
    }
  });

  await t.test("pelo menos uma dimensão preenche a área (aproveita a tela)", () => {
    const aw = 1280;
    const ah = 800;
    const pw = 612;
    const ph = 792;
    const s = computeFitScale({
      availableWidth: aw,
      availableHeight: ah,
      pageWidth: pw,
      pageHeight: ph,
    });
    const fillsWidth = Math.abs(pw * s - aw) < 1e-9;
    const fillsHeight = Math.abs(ph * s - ah) < 1e-9;
    assert.ok(fillsWidth || fillsHeight);
  });

  await t.test("dimensões zeradas devolvem 0 em vez de NaN/Infinity", () => {
    assert.equal(
      computeFitScale({
        availableWidth: 0,
        availableHeight: 800,
        pageWidth: 600,
        pageHeight: 800,
      }),
      0
    );
    assert.equal(
      computeFitScale({
        availableWidth: 800,
        availableHeight: 800,
        pageWidth: 0,
        pageHeight: 0,
      }),
      0
    );
  });
});

test("resolveEdgeAction", async (t) => {
  const area = { left: 100, width: 1000 }; // ocupa x de 100 a 1100

  await t.test("extremidade esquerda volta", () => {
    assert.equal(resolveEdgeAction({ ...area, clientX: 150 }), "prev");
  });

  await t.test("extremidade direita avança", () => {
    assert.equal(resolveEdgeAction({ ...area, clientX: 1050 }), "next");
  });

  await t.test("centro não navega", () => {
    assert.equal(resolveEdgeAction({ ...area, clientX: 600 }), null);
  });

  await t.test("limites exatos das zonas (25%) pertencem à extremidade", () => {
    assert.equal(resolveEdgeAction({ ...area, clientX: 350 }), "prev");
    assert.equal(resolveEdgeAction({ ...area, clientX: 850 }), "next");
    assert.equal(resolveEdgeAction({ ...area, clientX: 351 }), null);
    assert.equal(resolveEdgeAction({ ...area, clientX: 849 }), null);
  });

  await t.test("considera o deslocamento (left) da área", () => {
    // x=150 está a 5% da área que começa em 100 → esquerda.
    // O mesmo x numa área que começa em 0 está a 15% → também esquerda,
    // mas numa área que começa em -500 (rolada) está a 65% → centro.
    assert.equal(
      resolveEdgeAction({ clientX: 150, left: -500, width: 1000 }),
      null
    );
  });

  await t.test("zona configurável", () => {
    assert.equal(
      resolveEdgeAction({ ...area, clientX: 300, zone: 0.1 }),
      null
    );
    assert.equal(
      resolveEdgeAction({ ...area, clientX: 300, zone: 0.25 }),
      "prev"
    );
  });

  await t.test("largura zero não navega", () => {
    assert.equal(
      resolveEdgeAction({ clientX: 10, left: 0, width: 0 }),
      null
    );
  });
});
