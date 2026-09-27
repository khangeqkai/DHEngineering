import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, searchForWorkspaceRoot } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/src/shared/*.js ("shared rule files" — see CLAUDE.md "Shared rule files") hold
// a rule both the server and the client need to agree on (a calendar-day check, a
// rounding helper, the overtime schedule's grid math). They're plain CommonJS because
// the server runs them as-is under Electron 27 / Node 18, which can't require() an ES
// module — but Vite only understands ES modules for anything outside node_modules. This
// directory is the plugin's one target.
const sharedRulesDir = path.resolve(__dirname, '../server/src/shared');

// Rewrites the handful of statement forms the shared-rule-file convention allows
// (a plain `const name = require('P');` or `const { a, b } = require('P');`, and one
// final `module.exports = { a, b, c };`) into their ES-module equivalents. A `require`
// of a `.js` sibling with no extension gets one appended, so Vite's resolver — which,
// unlike Node's `require`, does not try bare specifiers with a `.js` suffix — can still
// find it. If anything is left over that still contains `require(`, `module.exports` or
// `exports.` afterwards, the convention was broken somewhere this rewrite doesn't
// reach, so this throws naming the file rather than silently shipping broken output.
// Exported (not just used inline) so a Node script can run it standalone and prove the
// rewritten ESM loads, without spinning up Vite — see the verification script noted in
// tasks/shared-rules-2026-09-27.md.
export function transformSharedRuleFile(code, filePath) {
  const withJsExt = (p) => (/\.[a-zA-Z0-9]+$/.test(p) ? p : `${p}.js`);
  let out = code;
  out = out.replace(
    /^const\s*\{\s*([^}]+?)\s*\}\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)\s*;?\s*$/gm,
    (_match, names, reqPath) => `import { ${names} } from '${withJsExt(reqPath)}';`
  );
  out = out.replace(
    /^const\s+(\w+)\s*=\s*require\(\s*['"](\.[^'"]+)['"]\s*\)\s*;?\s*$/gm,
    (_match, name, reqPath) => `import ${name} from '${withJsExt(reqPath)}';`
  );
  out = out.replace(
    /^module\.exports\s*=\s*\{\s*([^}]+?)\s*\}\s*;?\s*$/m,
    (_match, names) => `export { ${names} };`
  );
  if (/require\(|module\.exports|exports\./.test(out)) {
    throw new Error(
      `[shared-rule-files] ${filePath} breaks the shared-rule-file convention — it still ` +
      `contains require(/module.exports/exports. after rewriting. See CLAUDE.md "Shared rule files".`
    );
  }
  return out;
}

// Applies the rewrite above to every server/src/shared/*.js module id Vite loads, in
// both dev and build. Anything outside that directory (including the shared *.json
// files, which Vite already imports natively) is left untouched.
function sharedRuleFilesPlugin() {
  return {
    name: 'shared-rule-files',
    enforce: 'pre',
    transform(code, id) {
      const filePath = id.split('?')[0];
      if (!filePath.endsWith('.js')) return null;
      const resolved = path.resolve(filePath);
      if (resolved !== sharedRulesDir && !resolved.startsWith(sharedRulesDir + path.sep)) return null;
      return { code: transformSharedRuleFile(code, filePath), map: null };
    }
  };
}

export default defineConfig({
  plugins: [react(), sharedRuleFilesPlugin()],
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    // The project lives on the Windows drive (/mnt/c) but the dev server runs
    // under WSL, where file-change events don't reach the watcher — so edits
    // never hot-reload. Polling makes Vite notice saved changes.
    watch: {
      usePolling: true,
      interval: 150
    },
    fs: {
      // The shared JSON data files and shared rule files (see sharedRuleFilesPlugin
      // above) live outside the client project root, in ../server/src/shared — Vite's
      // dev server otherwise refuses to serve an import from outside its own root.
      allow: [searchForWorkspaceRoot(process.cwd()), '../server/src/shared']
    },
    proxy: {
      '/api': 'http://localhost:3000',
      '/health': 'http://localhost:3000'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
