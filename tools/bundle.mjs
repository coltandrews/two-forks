// Builds a single self-contained HTML file (no npm install needed): local
// modules are concatenated in dependency order, CSS is inlined, and three
// loads from the CDN through the page's import map.
//
//   node tools/bundle.mjs            -> dist-single/two-forks.html
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const out = path.join(root, 'dist-single');

const IMPORT_RE = /^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?\s*$/gm;
const order = [];
const seen = new Set();
const externals = new Set();
const modules = new Map();

// Named by path under src/, so data/alley.js and view/alley.js stay separate.
function modId(file) { return path.relative(src, file).replace(/\.js$/, '').replace(/\W/g, '_'); }

function load(file) {
  if (seen.has(file)) return;
  seen.add(file);
  let code = fs.readFileSync(file, 'utf8');
  const deps = [];
  code = code.replace(IMPORT_RE, (all, clause, spec) => {
    if (!spec.startsWith('.')) { externals.add(`import ${clause.trim()} from '${spec}';`); return ''; }
    const dep = path.resolve(path.dirname(file), spec);
    deps.push(dep);
    const names = clause.trim().replace(/^\{|\}$/g, '').split(',').map((s) => s.trim()).filter(Boolean)
      .map((s) => s.replace(/\s+as\s+/, ': '));
    return `const { ${names.join(', ')} } = __m.${modId(dep)};`;
  });
  for (const d of deps) load(d);
  const exported = [];
  code = code.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, (all, kind, name) => {
    exported.push(name);
    return `${kind} ${name}`;
  });
  code = code.replace(/^export\s*\{([^}]*)\};?\s*$/gm, (all, list) => {
    for (const n of list.split(',').map((s) => s.trim()).filter(Boolean)) exported.push(n);
    return '';
  });
  modules.set(file, { code, exported });
  order.push(file);
}

load(path.join(src, 'main.js'));

let bundle = [...externals].join('\n') + '\nconst __m = {};\n';
for (const file of order) {
  const { code, exported } = modules.get(file);
  bundle += `\n// ---- ${path.relative(root, file)} ----\n__m.${modId(file)} = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();\n`;
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
const safe = (s) => s.replace(/<\/script/g, '<\\/script');

fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'game.js'), bundle);
// Replacer functions, not strings: game code contains "$'" and "$&", which a
// replacement string would expand into copies of the page.
const page = html
  .replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>\n${css}\n</style>`)
  .replace('<script type="module" src="./src/main.js"></script>', () => `<script type="module">\n${safe(bundle)}\n</script>`);
fs.writeFileSync(path.join(out, 'two-forks.html'), page);

const kb = (s) => (Buffer.byteLength(s) / 1024).toFixed(1) + ' KB';
console.log(`modules: ${order.length}, bundle ${kb(bundle)}, page ${kb(page)}`);
