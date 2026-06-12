/* Minimal in-browser .zip reader — just enough to pull a .DAT out of an archive.
   Supports stored (0) and deflate (8) entries; deflate uses the native
   DecompressionStream, so no library is needed. */
'use strict';

async function extractDatFromZip(zipBuf) {
  const u8 = new Uint8Array(zipBuf);
  const dv = new DataView(zipBuf);

  // find End Of Central Directory record (scan backwards, max comment 64K)
  let eocd = -1;
  const stop = Math.max(0, u8.length - 65557);
  for (let i = u8.length - 22; i >= stop; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a zip file');

  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const usize = dv.getUint32(off + 24, true);
    const nameLen = dv.getUint16(off + 28, true);
    const extraLen = dv.getUint16(off + 30, true);
    const cmtLen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nameLen));
    if (!name.endsWith('/')) entries.push({ name, method, csize, usize, lho });
    off += 46 + nameLen + extraLen + cmtLen;
  }
  if (!entries.length) throw new Error('Zip is empty');

  // prefer .dat/.ccl entries; otherwise take the largest file and hope
  const dats = entries.filter(e => /\.(dat|ccl)$/i.test(e.name));
  const pick = (dats.length ? dats : entries).sort((a, b) => b.usize - a.usize)[0];

  // local file header gives the true data offset
  const lh = pick.lho;
  if (dv.getUint32(lh, true) !== 0x04034b50) throw new Error('Corrupt zip entry');
  const lnameLen = dv.getUint16(lh + 26, true);
  const lextraLen = dv.getUint16(lh + 28, true);
  const dataStart = lh + 30 + lnameLen + lextraLen;
  const comp = u8.subarray(dataStart, dataStart + pick.csize);

  let out;
  if (pick.method === 0) {
    out = comp.slice();
  } else if (pick.method === 8) {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This browser cannot unzip — extract the .DAT and load it directly');
    }
    const stream = new Blob([comp]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  } else {
    throw new Error('Unsupported zip compression (method ' + pick.method + ')');
  }
  return { name: pick.name.split('/').pop(), buf: out.buffer };
}
