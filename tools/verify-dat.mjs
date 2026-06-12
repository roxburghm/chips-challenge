// Parses CHIPS.DAT (CC1 .DAT format) in Node and prints a validation summary.
// Usage: node tools/verify-dat.mjs [path-to-dat] [levelNumberToDump]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = process.argv[2] ?? fileURLToPath(new URL('../original/CHIPS.DAT', import.meta.url));
const dumpLevel = process.argv[3] ? parseInt(process.argv[3], 10) : 1;
const buf = readFileSync(path);

function parseDat(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let p = 0;
  const u8 = () => view.getUint8(p++);
  const u16 = () => { const v = view.getUint16(p, true); p += 2; return v; };

  const magic = view.getUint32(0, true); p = 4;
  if ((magic & 0xffff) !== 0xaaac) throw new Error('Bad magic: 0x' + magic.toString(16));
  const count = u16();
  const levels = [];

  for (let i = 0; i < count; i++) {
    const size = u16();
    const end = p + size;
    const lvl = {
      number: u16(), time: u16(), chips: u16(),
      title: '', password: '', hint: '',
      traps: [], clones: [], monsters: [],
      top: null, bottom: null,
    };
    const detail = u16(); // map detail, normally 1
    lvl.top = readLayer();
    lvl.bottom = readLayer();
    let optBytes = u16();
    const optEnd = p + optBytes;
    while (p < optEnd) {
      const field = u8(), len = u8();
      const fEnd = p + len;
      switch (field) {
        case 3: lvl.title = readStr(len); break;
        case 4: for (let n = 0; n < len / 10; n++) lvl.traps.push({ bx: u16(), by: u16(), tx: u16(), ty: u16(), open: u16() }); break;
        case 5: for (let n = 0; n < len / 8; n++) lvl.clones.push({ bx: u16(), by: u16(), mx: u16(), my: u16() }); break;
        case 6: { let s = ''; for (let n = 0; n < len; n++) { const c = u8(); if (c) s += String.fromCharCode(c ^ 0x99); } lvl.password = s; break; }
        case 7: lvl.hint = readStr(len); break;
        case 10: for (let n = 0; n < len / 2; n++) lvl.monsters.push({ x: u8(), y: u8() }); break;
        default: p = fEnd; // skip unknown fields
      }
      p = fEnd;
    }
    p = end;
    levels.push(lvl);
  }
  return levels;

  function readLayer() {
    const n = u16();
    const layerEnd = p + n;
    const out = new Uint8Array(1024);
    let o = 0;
    while (p < layerEnd && o < 1024) {
      const b = u8();
      if (b === 0xff) { const cnt = u8(), t = u8(); for (let k = 0; k < cnt && o < 1024; k++) out[o++] = t; }
      else out[o++] = b;
    }
    p = layerEnd;
    return out;
  }
  function readStr(len) {
    let s = '';
    for (let n = 0; n < len; n++) { const c = u8(); if (c) s += String.fromCharCode(c); }
    return s;
  }
}

const levels = parseDat(buf);
console.log(`Parsed ${levels.length} levels OK\n`);
console.log('First 5:');
for (const l of levels.slice(0, 5))
  console.log(`  #${l.number} "${l.title}" pass=${l.password} time=${l.time} chips=${l.chips} monsters=${l.monsters.length} traps=${l.traps.length} clones=${l.clones.length}`);
console.log('Last 3:');
for (const l of levels.slice(-3))
  console.log(`  #${l.number} "${l.title}" pass=${l.password} time=${l.time} chips=${l.chips}`);

// Sanity: every level has a non-empty title + 4-char password
const bad = levels.filter(l => !l.title || l.password.length !== 4);
console.log(`\nLevels missing title/password: ${bad.length}`);

// ASCII dump of one level's top layer
const GLYPH = {};
const G = (code, ch) => GLYPH[code] = ch;
G(0x00, '.'); G(0x01, '#'); G(0x02, 'c'); G(0x03, '~'); G(0x04, '^'); G(0x0a, 'O'); G(0x0b, ':');
G(0x0c, '_'); G(0x15, 'X'); G(0x16, 'B'); G(0x17, 'R'); G(0x18, 'G'); G(0x19, 'Y'); G(0x21, 't');
G(0x22, 'S'); G(0x2d, ','); G(0x2f, '?'); G(0x64, 'b'); G(0x65, 'r'); G(0x66, 'g'); G(0x67, 'y');
const lvl = levels[dumpLevel - 1];
console.log(`\nLevel ${lvl.number} "${lvl.title}" top layer:`);
for (let y = 0; y < 32; y++) {
  let row = '';
  for (let x = 0; x < 32; x++) {
    const t = lvl.top[y * 32 + x];
    row += GLYPH[t] ?? (t >= 0x40 && t <= 0x63 ? 'M' : t >= 0x6c ? '@' : t.toString(16)[0]);
  }
  console.log('  ' + row);
}
