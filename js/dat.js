/* CC1 .DAT level file parser (browser). Produces plain level objects. */
'use strict';

function parseDat(arrayBuffer) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  let p = 0;
  const u8 = () => bytes[p++];
  const u16 = () => { const v = view.getUint16(p, true); p += 2; return v; };

  const magic = view.getUint32(0, true);
  p = 4;
  if ((magic & 0xffff) !== 0xaaac) throw new Error('Not a Chip\'s Challenge .DAT file');
  const count = u16();
  const levels = [];

  for (let i = 0; i < count; i++) {
    const size = u16();
    const end = p + size;
    const lvl = {
      number: u16(),
      time: u16(),
      chips: u16(),
      title: '', password: '', hint: '',
      traps: [], clones: [], monsters: [],
      top: null, bottom: null,
    };
    u16(); // map detail (always 1)
    lvl.top = readLayer();
    lvl.bottom = readLayer();
    const optBytes = u16();
    const optEnd = Math.min(p + optBytes, end);
    while (p < optEnd) {
      const field = u8(), len = u8();
      const fEnd = p + len;
      switch (field) {
        case 3: lvl.title = readStr(len); break;
        case 4: for (let n = 0; n < (len / 10) | 0; n++) lvl.traps.push({ bx: u16(), by: u16(), tx: u16(), ty: u16(), open: u16() }); break;
        case 5: for (let n = 0; n < (len / 8) | 0; n++) lvl.clones.push({ bx: u16(), by: u16(), mx: u16(), my: u16() }); break;
        case 6: { let s = ''; for (let n = 0; n < len; n++) { const c = u8(); if (c) s += String.fromCharCode(c ^ 0x99); } lvl.password = s; break; }
        case 7: lvl.hint = readStr(len); break;
        case 10: for (let n = 0; n < (len / 2) | 0; n++) lvl.monsters.push({ x: u8(), y: u8() }); break;
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

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
