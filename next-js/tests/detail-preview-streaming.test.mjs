import { execFileSync } from "node:child_process";
import test from "node:test";

test("the interactive match HTML streams before optional insight summaries resolve", () => {
  const script = String.raw`
    import assert from 'node:assert/strict';
    import { readFileSync } from 'node:fs';
    import { registerHooks } from 'node:module';
    import { PassThrough } from 'node:stream';
    import { fileURLToPath } from 'node:url';
    import ts from 'typescript';

    const source = new URL('./src/', import.meta.url).href;
    const reactUrl = import.meta.resolve('react');
    const stub = code => ({ url: 'data:text/javascript,' + encodeURIComponent(code), shortCircuit: true });
    const modules = {
      'next/navigation': 'export const useRouter = () => ({ refresh() {} });',
      '@/components/match/details/match-details': 'import {createElement} from ' + JSON.stringify(reactUrl) + '; export const MatchDetails = ({data}) => createElement("main", null, data.fixture.fixtureId);',
      '@/state/detail-provider': 'export const DetailStateProvider = ({children}) => children;',
      '@/state/detail-hooks': 'export const useDetailDispatch = () => () => {};',
      '@/state/refresh-base': 'export const consumeRefresh = async () => null;',
      '@/state/detail-api': 'export const detailApi = {};',
      './use-live-refresh': 'export const useLiveRefresh = () => {};',
    };
    registerHooks({
      resolve(specifier, context, next) {
        if (modules[specifier]) return stub(modules[specifier]);
        const target = specifier.startsWith('@/') ? source + specifier.slice(2) : specifier;
        try { return next(target, context); } catch (error) {
          if (!target.startsWith('.') && !target.startsWith('file:')) throw error;
          for (const extension of ['.ts', '.tsx']) {
            try { return next(target + extension, context); } catch { /* Try the next extension. */ }
          }
          throw error;
        }
      },
      load(url, context, next) {
        if (!url.startsWith(source) || !url.endsWith('.tsx')) return next(url, context);
        const path = fileURLToPath(url);
        return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(path, 'utf8'), {
          fileName: path, compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText };
      },
    });
    const [{ createElement }, { renderToPipeableStream }, { LiveMatchDetail }, { liveDetail, today }] = await Promise.all([
      import('react'), import('react-dom/server'), import('./src/components/match/live-match-detail.tsx'),
      import('./tests/helpers/live-refresh-fixtures.mjs'),
    ]);
    let finishPreview, allReady = false;
    const previewPromise = new Promise(resolve => { finishPreview = resolve; });
    const detail = liveDetail(), errors = [], stream = new PassThrough();
    let html = '';
    stream.setEncoding('utf8').on('data', chunk => { html += chunk; });
    const firstChunk = new Promise(resolve => stream.once('data', resolve));
    const ended = new Promise((resolve, reject) => stream.once('end', resolve).once('error', reject));
    let shellReady;
    const shell = new Promise(resolve => { shellReady = resolve; });
    const rendered = renderToPipeableStream(createElement('html', null, createElement('body', null,
      createElement(LiveMatchDetail, { initial: detail, today, locale: 'en', previewPromise }))), {
      onShellReady() { rendered.pipe(stream); shellReady(); },
      onAllReady() { allReady = true; },
      onError(error) { errors.push(error); },
    });
    try {
      await shell;
      let timer;
      try { await Promise.race([firstChunk, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Primary content did not stream while insights were pending.')), 2000);
      })]); } finally { clearTimeout(timer); }
      assert.ok(html.includes('<main>' + detail.fixture.fixtureId + '</main>'), 'The match view must arrive while insights are pending.');
      assert.equal(allReady, false, 'Only optional summaries should remain suspended.');
      finishPreview(null);
      await ended;
      assert.equal(allReady, true);
      assert.deepEqual(errors, []);
      assert.equal((html.match(/<main>/g) ?? []).length, 1, 'Resolving summaries must not replace or duplicate the match view.');
    } finally { rendered.abort(); }
  `;
  execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
    cwd: new URL("../", import.meta.url), encoding: "utf8", timeout: 30_000,
  });
});
