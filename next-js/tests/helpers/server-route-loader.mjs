import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const stubRouteComponents = names => names.map(name => `export function ${name}() { return null; }`).join('\n');

/** Load real server-route orchestration under native Node; tests explicitly isolate renderer dependencies. */
export function registerServerRouteTestLoader({ source, modules }) {
  return registerHooks({
    resolve(specifier, context, next) {
      if (Object.hasOwn(modules, specifier)) return { url: `data:text/javascript,${encodeURIComponent(modules[specifier])}`, shortCircuit: true };
      // Next's bundler chooses the server navigation implementation; native Node needs the same mapping.
      if (specifier === 'next/navigation') return next('next/dist/client/components/navigation.react-server.js', context);
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
}
