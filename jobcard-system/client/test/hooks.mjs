import { existsSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const clientSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src');
const EXTENSIONS = ['.js', '.mjs', '.jsx', '.json'];

// Vite finds `./formatters` by trying extensions; Node does not.
export async function resolve(specifier, context, nextResolve) {
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
    const base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    if (!existsSync(base) || statSync(base).isDirectory()) {
      for (const ext of EXTENSIONS) {
        if (existsSync(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

// The client has no "type": "module", so its .js files would load as CommonJS.
export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && url.endsWith('.js')) {
    const file = fileURLToPath(url);
    if (file.startsWith(clientSrc)) {
      return { format: 'module', source: readFileSync(file, 'utf8'), shortCircuit: true };
    }
  }
  // Vite reads `import x from './x.json'` with no attribute; Node insists on one.
  if (url.startsWith('file:') && url.endsWith('.json')) {
    return nextLoad(url, { ...context, importAttributes: { type: 'json' } });
  }
  return nextLoad(url, context);
}
