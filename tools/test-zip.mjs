// Tests the in-browser zip extractor (js/zip.js) against a real archive.
// Usage: node tools/test-zip.mjs <path-to-zip>
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const zipPath = process.argv[2];
if (!zipPath) {
  console.log('Usage: node tools/test-zip.mjs <path-to-zip-containing-a-DAT>');
  process.exit(0);
}

const root = fileURLToPath(new URL('..', import.meta.url));
const src = ['js/zip.js', 'js/dat.js'].map(f => readFileSync(root + f, 'utf8')).join('\n');

const bytes = readFileSync(zipPath);
const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

const run = new Function('zipBuf', `${src}
return (async () => {
  const { name, buf } = await extractDatFromZip(zipBuf);
  const levels = parseDat(buf);
  return { name, bytes: buf.byteLength, levels: levels.length, first: levels[0].title, pass: levels[0].password };
})();`);

const r = await run(ab);
console.log(`Extracted ${r.name} (${r.bytes} bytes) -> ${r.levels} levels, first: "${r.first}" pass=${r.pass}`);
if (r.levels < 1) process.exit(1);
console.log('ZIP EXTRACTION OK');
