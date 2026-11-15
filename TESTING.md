# Testes

## Instalação (uma vez)

```bash
npm install express pdfjs-dist
npm install -D @playwright/test
npx playwright install chromium
```

Adicione ao `package.json`:

```json
"scripts": {
  "start": "node server/server.js",
  "test": "npm run test:unit && npm run test:e2e",
  "test:unit": "node --test \"tests/unit/*.test.mjs\"",
  "test:e2e": "playwright test"
}
```

## O que existe

- `tests/unit/` — lógica pura (`reader-math.mjs`), com `node:test`, sem dependências.
- `tests/e2e/` — Chromium real + servidor real (Playwright):
  - `storage.spec.js`: IndexedDB (`saveBook`, `getBook`, `getAllBooks`, `updateCurrentPage`)
  - `library.spec.js`: importar, listar, abrir, voltar, erros
  - `reader.spec.js`: navegação, bordas, progresso, ajuste à tela, sem rolagem, resize, alta densidade
  - `rapid-navigation.spec.js`: trocas de página simultâneas (renderização duplicada)
  - `server.spec.js`: arquivos servidos e MIME de JavaScript
  - `tablet.spec.js`: emulação de Galaxy Tab (toque, rotação). Não substitui teste no aparelho real.

Regra: toda mudança nova vem com teste; rode `npm test` antes de seguir para a próxima etapa.
