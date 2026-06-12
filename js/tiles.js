/* Tile constants + procedurally-drawn modern tileset ("neon circuit" aesthetic).
   All artwork is original, drawn with canvas primitives at load time. */
'use strict';

const T = {
  FLOOR: 0x00, WALL: 0x01, CHIP: 0x02, WATER: 0x03, FIRE: 0x04, HWALL: 0x05,
  PANEL_N: 0x06, PANEL_W: 0x07, PANEL_S: 0x08, PANEL_E: 0x09,
  BLOCK: 0x0A, DIRT: 0x0B, ICE: 0x0C, FORCE_S: 0x0D,
  CLONE_N: 0x0E, CLONE_W: 0x0F, CLONE_S: 0x10, CLONE_E: 0x11,
  FORCE_N: 0x12, FORCE_E: 0x13, FORCE_W: 0x14, EXIT: 0x15,
  DOOR_B: 0x16, DOOR_R: 0x17, DOOR_G: 0x18, DOOR_Y: 0x19,
  ICE_SE: 0x1A, ICE_SW: 0x1B, ICE_NW: 0x1C, ICE_NE: 0x1D,
  FAKEWALL: 0x1E, REALWALL: 0x1F,
  THIEF: 0x21, SOCKET: 0x22, BTN_GREEN: 0x23, BTN_RED: 0x24,
  TOGGLE_C: 0x25, TOGGLE_O: 0x26, BTN_BROWN: 0x27, BTN_BLUE: 0x28,
  TELEPORT: 0x29, BOMB: 0x2A, TRAP: 0x2B, HWALL_APPEAR: 0x2C,
  GRAVEL: 0x2D, POPUP: 0x2E, HINT: 0x2F, PANEL_SE: 0x30,
  CLONER: 0x31, FORCE_RND: 0x32,
  KEY_B: 0x64, KEY_R: 0x65, KEY_G: 0x66, KEY_Y: 0x67,
  FLIPPERS: 0x68, FIREBOOTS: 0x69, SKATES: 0x6A, SUCTION: 0x6B,
};

// Directions: 0=N 1=W 2=S 3=E  (matches .DAT encoding order)
const DIRS = [[0, -1], [-1, 0], [0, 1], [1, 0]];
const DIR_N = 0, DIR_W = 1, DIR_S = 2, DIR_E = 3;
const dirLeft = d => (d + 1) & 3;
const dirRight = d => (d + 3) & 3;
const dirBack = d => (d + 2) & 3;

const MONSTER_KINDS = ['bug', 'fireball', 'ball', 'tank', 'glider', 'teeth', 'walker', 'blob', 'paramecium'];

// Map a top-layer tile code to an entity descriptor, or null if it's terrain.
function entityForTile(code) {
  if (code >= 0x40 && code <= 0x63) {
    return { kind: MONSTER_KINDS[(code - 0x40) >> 2], dir: (code - 0x40) & 3 };
  }
  if (code === T.BLOCK) return { kind: 'block', dir: DIR_S };
  if (code >= T.CLONE_N && code <= T.CLONE_E) {
    return { kind: 'block', dir: [DIR_N, DIR_W, DIR_S, DIR_E][code - T.CLONE_N], cloneBlock: true };
  }
  if (code >= 0x6c && code <= 0x6f) return { kind: 'chip', dir: code - 0x6c };
  if (code >= 0x3c && code <= 0x3f) return { kind: 'chip', dir: code - 0x3c, swimming: true };
  return null;
}

/* ---------------------------------------------------------------- palette */
const PAL = {
  floor: '#10162a', floorEdge: '#0a0f1f', trace: '#1c2848', traceLit: '#27406e',
  wallHi: '#3b4a6e', wallLo: '#161e33', wallEdge: '#5b7099', wallGlow: 'rgba(110,150,220,.18)',
  cyan: '#2ee6ff', magenta: '#ff3df0', amber: '#ffb02e', lime: '#7dff62',
  red: '#ff4757', iceA: '#cfeffc', iceB: '#8fc7e8', water: '#0d4d74', waterHi: '#2ea8d8',
  dirt: '#8a5a33', dirtDark: '#5e3c20', steel: '#aab8d0',
  keyCol: { B: '#37b6ff', R: '#ff5562', G: '#52ff7d', Y: '#ffd23e' },
};

/* --------------------------------------------------------------- helpers */
function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function lgr(g, x0, y0, x1, y1, stops) {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function rgr(g, x, y, r0, r1, stops) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function glow(g, color, blur) { g.shadowColor = color; g.shadowBlur = blur; }
function noGlow(g) { g.shadowColor = 'transparent'; g.shadowBlur = 0; }

/* Deterministic per-tile hash for floor variation */
function tileHash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) >>> 0); }

/* ------------------------------------------------------- terrain painters
   Each painter draws a full tile into ctx at (0,0)..(s,s). f = frame 0..7. */

function paintFloorBase(g, s) {
  g.fillStyle = PAL.floor;
  g.fillRect(0, 0, s, s);
  g.strokeStyle = PAL.floorEdge;
  g.lineWidth = Math.max(1, s / 32);
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
}

function paintFloorVariant(g, s, v) {
  paintFloorBase(g, s);
  g.strokeStyle = PAL.trace;
  g.fillStyle = PAL.trace;
  g.lineWidth = Math.max(1, s / 42);
  const u = s / 16;
  if (v === 1) { // L-trace with via dots
    g.beginPath(); g.moveTo(3 * u, 13 * u); g.lineTo(3 * u, 8 * u); g.lineTo(9 * u, 8 * u); g.stroke();
    g.beginPath(); g.arc(9.6 * u, 8 * u, s / 36, 0, 7); g.fill();
    g.beginPath(); g.arc(3 * u, 13.6 * u, s / 36, 0, 7); g.fill();
  } else if (v === 2) { // parallel traces
    g.beginPath(); g.moveTo(10 * u, 2 * u); g.lineTo(10 * u, 7 * u); g.lineTo(14 * u, 7 * u); g.stroke();
    g.beginPath(); g.moveTo(12 * u, 2 * u); g.lineTo(12 * u, 5 * u); g.lineTo(14 * u, 5 * u); g.stroke();
  } else if (v === 3) { // lit diagonal trace
    g.strokeStyle = PAL.traceLit;
    g.beginPath(); g.moveTo(2 * u, 2 * u); g.lineTo(5 * u, 2 * u); g.lineTo(5 * u, 5 * u); g.stroke();
    g.beginPath(); g.arc(5 * u, 5.7 * u, s / 36, 0, 7); g.fillStyle = PAL.traceLit; g.fill();
  }
}

function paintWall(g, s) {
  g.fillStyle = PAL.floorEdge; g.fillRect(0, 0, s, s);
  const m = s / 16;
  rr(g, m * .8, m * .8, s - 1.6 * m, s - 1.6 * m, s / 9);
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, PAL.wallHi], [.5, '#26314e'], [1, PAL.wallLo]]);
  g.fill();
  rr(g, m * .8, m * .8, s - 1.6 * m, s - 1.6 * m, s / 9);
  g.strokeStyle = PAL.wallEdge; g.lineWidth = s / 40; g.stroke();
  // top sheen
  rr(g, m * 2, m * 1.6, s - 4 * m, s / 5, s / 14);
  g.fillStyle = 'rgba(160,190,240,.16)'; g.fill();
  // rivets
  g.fillStyle = 'rgba(140,170,220,.5)';
  for (const [rx, ry] of [[3, 3], [13, 3], [3, 13], [13, 13]]) {
    g.beginPath(); g.arc(rx * m, ry * m, s / 50, 0, 7); g.fill();
  }
}

function paintBlueWall(g, s) { // fake & real look identical (that's the point)
  paintFloorBase(g, s);
  const m = s / 16;
  rr(g, m, m, s - 2 * m, s - 2 * m, s / 9);
  g.fillStyle = 'rgba(40,110,255,.16)'; g.fill();
  g.strokeStyle = 'rgba(90,170,255,.85)'; g.lineWidth = s / 36;
  glow(g, 'rgba(90,170,255,.8)', s / 10); g.stroke(); noGlow(g);
  g.strokeStyle = 'rgba(90,170,255,.35)'; g.lineWidth = s / 60;
  for (let i = 1; i < 4; i++) {
    g.beginPath(); g.moveTo(m, m + i * (s - 2 * m) / 4); g.lineTo(s - m, m + i * (s - 2 * m) / 4); g.stroke();
    g.beginPath(); g.moveTo(m + i * (s - 2 * m) / 4, m); g.lineTo(m + i * (s - 2 * m) / 4, s - m); g.stroke();
  }
}

function paintChipItem(g, s, f) {
  paintFloorVariant(g, s, 0);
  const c = s / 2, pulse = .75 + .25 * Math.sin(f / 8 * Math.PI * 2);
  // aura
  g.fillStyle = rgr(g, c, c, 0, s * .48, [[0, `rgba(255,176,46,${.30 * pulse})`], [1, 'rgba(255,176,46,0)']]);
  g.fillRect(0, 0, s, s);
  const w = s * .46, x = c - w / 2, y = c - w / 2;
  // pins
  g.strokeStyle = '#caa24a'; g.lineWidth = s / 26; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const o = x + w * (.25 + i * .25);
    g.beginPath(); g.moveTo(o, y - s * .07); g.lineTo(o, y); g.stroke();
    g.beginPath(); g.moveTo(o, y + w); g.lineTo(o, y + w + s * .07); g.stroke();
    g.beginPath(); g.moveTo(x - s * .07, y + w * (.25 + i * .25)); g.lineTo(x, y + w * (.25 + i * .25)); g.stroke();
    g.beginPath(); g.moveTo(x + w, y + w * (.25 + i * .25)); g.lineTo(x + w + s * .07, y + w * (.25 + i * .25)); g.stroke();
  }
  // body
  rr(g, x, y, w, w, s / 16);
  g.fillStyle = lgr(g, x, y, x, y + w, [[0, '#ffd470'], [.5, '#f0a826'], [1, '#b87714']]);
  glow(g, `rgba(255,176,46,${.8 * pulse})`, s / 8); g.fill(); noGlow(g);
  // inner die
  rr(g, x + w * .22, y + w * .22, w * .56, w * .56, s / 30);
  g.fillStyle = '#3a2c10'; g.fill();
  g.fillStyle = `rgba(255,220,120,${.6 + .4 * pulse})`;
  const d = w * .56 / 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillRect(x + w * .22 + d * (i + .42) , y + w * .22 + d * (j + .42), d * .5, d * .5);
  }
}

function paintWater(g, s, f) {
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, '#0e5a86'], [1, PAL.water]]);
  g.fillRect(0, 0, s, s);
  const ph = f / 8 * Math.PI * 2;
  g.lineWidth = s / 30; g.lineCap = 'round';
  for (let band = 0; band < 3; band++) {
    g.strokeStyle = `rgba(70,190,235,${.30 - band * .07})`;
    g.beginPath();
    for (let x = 0; x <= s; x += 2) {
      const y = s * (.25 + band * .27) + Math.sin(ph + x / s * Math.PI * 2 + band * 1.9) * s * .045;
      x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  // sparkle
  const sx = (Math.sin(ph) * .5 + .5) * s * .6 + s * .2;
  g.fillStyle = 'rgba(200,240,255,.8)';
  g.beginPath(); g.arc(sx, s * .3, s / 40, 0, 7); g.fill();
  g.strokeStyle = 'rgba(10,40,70,.8)'; g.lineWidth = 1; g.strokeRect(.5, .5, s - 1, s - 1);
}

function paintFire(g, s, f) {
  paintFloorBase(g, s);
  g.fillStyle = '#1c0f08'; g.fillRect(s * .08, s * .08, s * .84, s * .84);
  const c = s / 2;
  g.fillStyle = rgr(g, c, c * 1.2, 0, s * .5, [[0, 'rgba(255,120,30,.5)'], [1, 'rgba(255,80,20,0)']]);
  g.fillRect(0, 0, s, s);
  // three flames with frame-varied heights
  const hs = [Math.sin(f * 1.3) * .5 + .5, Math.sin(f * 1.3 + 2.1) * .5 + .5, Math.sin(f * 1.3 + 4.2) * .5 + .5];
  const flames = [[c - s * .18, .55 + hs[0] * .2], [c, .72 + hs[1] * .25], [c + s * .18, .5 + hs[2] * .2]];
  for (const [fx, fh] of flames) {
    const base = s * .8, h = s * fh * .62;
    glow(g, 'rgba(255,140,40,.9)', s / 9);
    g.fillStyle = lgr(g, fx, base - h, fx, base, [[0, '#ffe27a'], [.45, '#ff9b2e'], [1, '#e2401f']]);
    g.beginPath();
    g.moveTo(fx, base - h);
    g.quadraticCurveTo(fx + s * .12, base - h * .45, fx + s * .085, base);
    g.lineTo(fx - s * .085, base);
    g.quadraticCurveTo(fx - s * .12, base - h * .45, fx, base - h);
    g.fill();
  }
  noGlow(g);
}

function paintIce(g, s) {
  g.fillStyle = lgr(g, 0, 0, s, s, [[0, PAL.iceA], [.55, '#a8d8f0'], [1, PAL.iceB]]);
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = s / 22; g.lineCap = 'round';
  g.beginPath(); g.moveTo(s * .12, s * .42); g.lineTo(s * .42, s * .12); g.stroke();
  g.beginPath(); g.moveTo(s * .3, s * .82); g.lineTo(s * .82, s * .3); g.stroke();
  g.lineWidth = s / 50; g.strokeStyle = 'rgba(255,255,255,.5)';
  g.beginPath(); g.moveTo(s * .55, s * .9); g.lineTo(s * .9, s * .55); g.stroke();
  g.strokeStyle = 'rgba(120,180,220,.9)'; g.lineWidth = s / 32;
  g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, s - g.lineWidth, s - g.lineWidth);
}

function paintIceCorner(g, s, corner) { // corner = open curve direction; walls drawn on the two closed edges
  paintIce(g, s);
  const m = s / 12;
  g.strokeStyle = '#e9f7ff'; g.lineWidth = s / 9; g.lineCap = 'round';
  glow(g, 'rgba(180,230,255,.9)', s / 10);
  g.beginPath();
  // open SE -> walls on N,W ; open NW -> walls on S,E ; open SW -> walls on N,E ; open NE -> walls on S,W
  if (corner === 'NW') { g.moveTo(0, s - m); g.lineTo(s - m * 2.2, s - m); g.quadraticCurveTo(s - m, s - m, s - m, s - m * 2.2); g.lineTo(s - m, 0); }
  if (corner === 'NE') { g.moveTo(s, s - m); g.lineTo(m * 2.2, s - m); g.quadraticCurveTo(m, s - m, m, s - m * 2.2); g.lineTo(m, 0); }
  if (corner === 'SE') { g.moveTo(s, m); g.lineTo(m * 2.2, m); g.quadraticCurveTo(m, m, m, m * 2.2); g.lineTo(m, s); }
  if (corner === 'SW') { g.moveTo(0, m); g.lineTo(s - m * 2.2, m); g.quadraticCurveTo(s - m, m, s - m, m * 2.2); g.lineTo(s - m, s); }
  g.stroke();
  noGlow(g);
}

function paintForce(g, s, f, dir) { // animated chevron conveyor
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, '#191228'], [1, '#100a1c']]);
  g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(20,12,36,.9)'; g.lineWidth = 1; g.strokeRect(.5, .5, s - 1, s - 1);
  g.save();
  g.translate(s / 2, s / 2);
  g.rotate([Math.PI, Math.PI / 2, 0, -Math.PI / 2][dir]); // chevrons point "down" = S by default
  const off = (f / 8) * (s / 2);
  g.lineWidth = s / 9; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let i = -2; i <= 2; i++) {
    const y = -s / 2 + ((i * s / 2 + off) % (s * 2.5) + s * 2.5) % (s * 2.5) - s * .75;
    const a = Math.max(0, 1 - Math.abs(y) / (s * .62));
    if (a <= 0) continue;
    g.strokeStyle = `rgba(255,61,240,${.55 * a})`;
    glow(g, `rgba(255,61,240,${.8 * a})`, s / 12);
    g.beginPath();
    g.moveTo(-s * .26, y - s * .13);
    g.lineTo(0, y + s * .13);
    g.lineTo(s * .26, y - s * .13);
    g.stroke();
  }
  g.restore();
  noGlow(g);
}

function paintForceRnd(g, s, f) {
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, '#191228'], [1, '#100a1c']]);
  g.fillRect(0, 0, s, s);
  const c = s / 2, rot = f / 8 * Math.PI * 2;
  g.save(); g.translate(c, c); g.rotate(rot);
  g.strokeStyle = 'rgba(255,61,240,.7)'; g.lineWidth = s / 11; g.lineCap = 'round';
  glow(g, 'rgba(255,61,240,.8)', s / 12);
  for (let q = 0; q < 4; q++) {
    g.rotate(Math.PI / 2);
    g.beginPath();
    g.moveTo(s * .12, -s * .3); g.lineTo(s * .3, -s * .12);
    g.moveTo(s * .3, -s * .3); g.lineTo(s * .3, -s * .12); g.lineTo(s * .12, -s * .12);
    g.beginPath(); g.moveTo(s * .08, -s * .26); g.lineTo(s * .26, -s * .08); g.stroke();
  }
  g.restore(); noGlow(g);
}

function paintExit(g, s, f) {
  paintFloorBase(g, s);
  const c = s / 2, rot = f / 8 * Math.PI * 2;
  g.fillStyle = rgr(g, c, c, 0, s * .5, [[0, 'rgba(40,255,170,.25)'], [1, 'rgba(40,255,170,0)']]);
  g.fillRect(0, 0, s, s);
  g.save(); g.translate(c, c); g.rotate(rot);
  for (let i = 0; i < 3; i++) {
    g.rotate(Math.PI * 2 / 3);
    g.strokeStyle = i % 2 ? PAL.lime : '#2effc8';
    g.lineWidth = s / 12; g.lineCap = 'round';
    glow(g, 'rgba(60,255,180,.9)', s / 8);
    g.beginPath(); g.arc(0, 0, s * .30, 0, Math.PI * .9); g.stroke();
    g.lineWidth = s / 20;
    g.beginPath(); g.arc(0, 0, s * .17, Math.PI * .4, Math.PI * 1.1); g.stroke();
  }
  g.restore(); noGlow(g);
  g.fillStyle = rgr(g, c, c, 0, s * .14, [[0, '#eafff4'], [1, 'rgba(80,255,190,0)']]);
  g.beginPath(); g.arc(c, c, s * .14, 0, 7); g.fill();
}

function paintDoor(g, s, col) {
  paintFloorBase(g, s);
  const k = PAL.keyCol[col], m = s / 14;
  // posts
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, '#46537a'], [1, '#222b45']]);
  rr(g, m * .6, m * .6, m * 1.8, s - 1.2 * m, s / 24); g.fill();
  rr(g, s - m * 2.4, m * .6, m * 1.8, s - 1.2 * m, s / 24); g.fill();
  // energy shield
  const x = m * 2.4, w = s - 4.8 * m;
  g.fillStyle = k + '2e';
  g.fillRect(x, m, w, s - 2 * m);
  g.strokeStyle = k; g.lineWidth = s / 30;
  glow(g, k, s / 9);
  g.strokeRect(x, m, w, s - 2 * m);
  for (let i = 1; i < 4; i++) {
    g.globalAlpha = .4;
    g.beginPath(); g.moveTo(x, m + i * (s - 2 * m) / 4); g.lineTo(x + w, m + i * (s - 2 * m) / 4); g.stroke();
    g.globalAlpha = 1;
  }
  noGlow(g);
  // keyhole glyph
  const c = s / 2;
  g.fillStyle = k;
  glow(g, k, s / 10);
  g.beginPath(); g.arc(c, c - s * .05, s * .07, 0, 7); g.fill();
  g.beginPath(); g.moveTo(c - s * .035, c); g.lineTo(c + s * .035, c); g.lineTo(c + s * .055, c + s * .14); g.lineTo(c - s * .055, c + s * .14); g.fill();
  noGlow(g);
}

function paintKey(g, s, col) {
  paintFloorVariant(g, s, 0);
  const k = PAL.keyCol[col], c = s / 2;
  g.fillStyle = rgr(g, c, c, 0, s * .45, [[0, k + '40'], [1, k + '00']]);
  g.fillRect(0, 0, s, s);
  g.save(); g.translate(c, c); g.rotate(-.35);
  glow(g, k, s / 9);
  // keycard body
  rr(g, -s * .21, -s * .14, s * .42, s * .28, s / 22);
  g.fillStyle = lgr(g, 0, -s * .14, 0, s * .14, [[0, '#f2f6ff'], [1, '#b9c4dd']]);
  g.fill();
  noGlow(g);
  // color stripe + chip contact
  g.fillStyle = k;
  rr(g, -s * .21, -s * .14, s * .12, s * .28, s / 22); g.fill();
  g.fillStyle = '#8a7430';
  rr(g, -s * .04, -s * .07, s * .1, s * .14, s / 40); g.fill();
  g.strokeStyle = k; g.lineWidth = s / 44;
  rr(g, -s * .21, -s * .14, s * .42, s * .28, s / 22); g.stroke();
  g.restore();
}

function paintBootBase(g, s) {
  paintFloorVariant(g, s, 0);
  const c = s / 2;
  g.fillStyle = rgr(g, c, c, 0, s * .44, [[0, 'rgba(140,200,255,.18)'], [1, 'rgba(140,200,255,0)']]);
  g.fillRect(0, 0, s, s);
}

function paintFlippers(g, s) {
  paintBootBase(g, s);
  const c = s / 2;
  g.save(); g.translate(c, c);
  // two overlapping swim fins: foot pocket at the heel, wide blade flaring out
  for (const side of [-1, 1]) {
    g.save();
    g.translate(side * s * .12, -s * .04);
    g.rotate(side * .32);
    glow(g, 'rgba(55,224,216,.7)', s / 12);
    // blade — teardrop flaring down and outward
    g.fillStyle = lgr(g, 0, -s * .2, 0, s * .3, [[0, '#4fefe4'], [.5, '#2bbcd0'], [1, '#0f7a9c']]);
    g.beginPath();
    g.moveTo(-s * .06, -s * .14);
    g.quadraticCurveTo(-s * .19, s * .12, -s * .12, s * .3);
    g.quadraticCurveTo(0, s * .37, s * .12, s * .3);
    g.quadraticCurveTo(s * .19, s * .12, s * .06, -s * .14);
    g.closePath();
    g.fill();
    noGlow(g);
    // blade ribs
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = s / 60;
    g.beginPath(); g.moveTo(0, -s * .1); g.lineTo(0, s * .28); g.stroke();
    g.beginPath(); g.moveTo(-s * .06, s * .02); g.lineTo(-s * .08, s * .24); g.stroke();
    g.beginPath(); g.moveTo(s * .06, s * .02); g.lineTo(s * .08, s * .24); g.stroke();
    // foot pocket (heel cup) at the top
    g.fillStyle = lgr(g, 0, -s * .24, 0, -s * .08, [[0, '#0c5f78'], [1, '#0a4a60']]);
    g.beginPath();
    g.ellipse(0, -s * .17, s * .085, s * .07, 0, 0, 7);
    g.fill();
    g.strokeStyle = 'rgba(180,250,255,.6)'; g.lineWidth = s / 56;
    g.beginPath(); g.ellipse(0, -s * .17, s * .085, s * .07, 0, 0, 7); g.stroke();
    g.restore();
  }
  g.restore();
}

function paintFireboots(g, s) {
  paintBootBase(g, s);
  const c = s / 2;
  g.save(); g.translate(c, c);
  g.fillStyle = lgr(g, 0, -s * .2, 0, s * .22, [[0, '#ff7a5a'], [1, '#a82318']]);
  glow(g, 'rgba(255,90,50,.8)', s / 11);
  rr(g, -s * .13, -s * .22, s * .2, s * .3, s / 20); g.fill();           // shaft
  rr(g, -s * .13, .02 * s, s * .33, s * .17, s / 18); g.fill();          // foot
  noGlow(g);
  g.fillStyle = '#ffd23e';
  g.beginPath();
  g.moveTo(-s * .08, s * .2); g.quadraticCurveTo(-s * .02, s * .08, s * .03, s * .2);
  g.quadraticCurveTo(s * .08, s * .1, s * .13, s * .2);
  g.fill();
  g.restore();
}

function paintSkates(g, s) {
  paintBootBase(g, s);
  const c = s / 2;
  g.save(); g.translate(c, c - s * .04);
  // boot: ankle shaft + foot
  g.fillStyle = lgr(g, 0, -s * .24, 0, s * .12, [[0, '#fbfdff'], [1, '#b7c3e0']]);
  rr(g, -s * .11, -s * .24, s * .19, s * .28, s / 20); g.fill();      // shaft
  rr(g, -s * .11, -s * .02, s * .3, s * .14, s / 20); g.fill();        // foot
  // laces
  g.strokeStyle = 'rgba(120,150,200,.7)'; g.lineWidth = s / 60;
  for (let i = 0; i < 3; i++) {
    const y = -s * .18 + i * s * .06;
    g.beginPath(); g.moveTo(-s * .08, y); g.lineTo(s * .04, y + s * .025); g.stroke();
  }
  // blade holder (two posts under the foot)
  g.fillStyle = '#7e8bad';
  rr(g, -s * .07, s * .11, s * .03, s * .06, s / 60); g.fill();
  rr(g, s * .12, s * .11, s * .03, s * .06, s / 60); g.fill();
  // the blade: a runner that sweeps up into a clear curled toe at the front
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.lineWidth = s * .055;
  glow(g, PAL.cyan, s / 8);
  g.strokeStyle = lgr(g, -s * .16, 0, s * .3, 0, [[0, '#9fc4dd'], [.6, '#eaf7ff'], [1, '#cfe6ff']]);
  g.beginPath();
  g.moveTo(-s * .17, s * .22);                       // back heel of the blade
  g.lineTo(s * .16, s * .22);                        // flat runner along the bottom
  g.quadraticCurveTo(s * .29, s * .22, s * .28, s * .08);  // front sweeps up into the toe
  g.stroke();
  // bright sharpened ice edge along the flat of the runner
  g.lineWidth = s / 44;
  g.strokeStyle = '#f2ffff';
  g.beginPath(); g.moveTo(-s * .16, s * .245); g.lineTo(s * .15, s * .245); g.stroke();
  noGlow(g);
  g.restore();
}

function paintSuction(g, s) {
  paintBootBase(g, s);
  const c = s / 2;
  g.save(); g.translate(c, c);
  g.fillStyle = lgr(g, 0, -s * .2, 0, s * .2, [[0, '#c9a0ff'], [1, '#6a3fb0']]);
  glow(g, 'rgba(170,110,255,.8)', s / 11);
  rr(g, -s * .12, -s * .22, s * .2, s * .3, s / 20); g.fill();
  rr(g, -s * .12, .02 * s, s * .32, s * .15, s / 18); g.fill();
  noGlow(g);
  g.strokeStyle = '#e8d6ff'; g.lineWidth = s / 40;
  for (let i = 0; i < 3; i++) {
    g.beginPath(); g.ellipse(s * .04, s * .21, s * (.05 + i * .045), s * .02 + i * s * .012, 0, 0, 7); g.stroke();
  }
  g.restore();
}

function paintDirt(g, s) {
  paintFloorBase(g, s);
  const c = s / 2;
  g.fillStyle = rgr(g, c, c, 0, s * .46, [[0, PAL.dirt], [.8, PAL.dirtDark], [1, 'rgba(94,60,32,0)']]);
  g.beginPath(); g.ellipse(c, c, s * .4, s * .36, 0, 0, 7); g.fill();
  g.fillStyle = 'rgba(50,30,14,.6)';
  const spots = [[.3, .35, .05], [.62, .3, .04], [.45, .55, .06], [.65, .6, .045], [.32, .64, .04]];
  for (const [px, py, pr] of spots) { g.beginPath(); g.arc(px * s, py * s, pr * s, 0, 7); g.fill(); }
  g.strokeStyle = 'rgba(160,110,60,.5)'; g.lineWidth = s / 40;
  g.beginPath(); g.ellipse(c, c, s * .4, s * .36, 0, 0, 7); g.stroke();
}

function paintGravel(g, s) {
  paintFloorBase(g, s);
  const stones = [[.25, .3, .09], [.5, .22, .07], [.72, .34, .08], [.3, .58, .08], [.55, .5, .1], [.76, .62, .07], [.42, .76, .08], [.66, .8, .06], [.18, .78, .055]];
  for (const [px, py, pr] of stones) {
    g.fillStyle = lgr(g, px * s, (py - pr) * s, px * s, (py + pr) * s, [[0, '#9aa6bd'], [1, '#525d75']]);
    g.beginPath(); g.ellipse(px * s, py * s, pr * s, pr * s * .8, (px + py) * 3, 0, 7); g.fill();
  }
}

function paintPopup(g, s) {
  paintFloorBase(g, s);
  const m = s / 8;
  g.strokeStyle = 'rgba(150,170,210,.8)'; g.lineWidth = s / 26;
  rr(g, m, m, s - 2 * m, s - 2 * m, s / 18); g.stroke();
  g.strokeStyle = 'rgba(150,170,210,.35)';
  rr(g, m * 1.7, m * 1.7, s - 3.4 * m, s - 3.4 * m, s / 22); g.stroke();
  g.fillStyle = 'rgba(150,170,210,.7)';
  const c = s / 2;
  g.beginPath(); g.moveTo(c, c - s * .1); g.lineTo(c + s * .08, c + s * .04); g.lineTo(c - s * .08, c + s * .04); g.fill();
  g.fillRect(c - s * .02, c + s * .04, s * .04, s * .07);
}

function paintHint(g, s, f) {
  paintFloorBase(g, s);
  const c = s / 2, pulse = .7 + .3 * Math.sin(f / 8 * Math.PI * 2);
  g.strokeStyle = `rgba(46,230,255,${.8 * pulse})`; g.lineWidth = s / 26;
  glow(g, PAL.cyan, s / 8 * pulse);
  g.beginPath(); g.arc(c, c, s * .3, 0, 7); g.stroke();
  g.fillStyle = `rgba(46,230,255,${pulse})`;
  g.font = `700 ${s * .38}px "IBM Plex Mono", monospace`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('?', c, c + s * .02);
  noGlow(g);
}

function paintSocket(g, s) {
  paintFloorBase(g, s);
  const m = s / 14;
  rr(g, m, m, s - 2 * m, s - 2 * m, s / 12);
  g.fillStyle = lgr(g, 0, m, 0, s - m, [[0, '#2c3554'], [1, '#161d33']]); g.fill();
  g.strokeStyle = '#caa24a'; g.lineWidth = s / 30;
  rr(g, m, m, s - 2 * m, s - 2 * m, s / 12); g.stroke();
  // pin grid
  g.fillStyle = '#caa24a';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    if ((i === 1 || i === 2) && (j === 1 || j === 2)) continue;
    g.beginPath(); g.arc(m * 2.4 + i * (s - 4.8 * m) / 3, m * 2.4 + j * (s - 4.8 * m) / 3, s / 38, 0, 7); g.fill();
  }
  // central slot
  g.fillStyle = '#0a0e1c';
  rr(g, s * .36, s * .36, s * .28, s * .28, s / 26); g.fill();
  g.strokeStyle = 'rgba(202,162,74,.6)'; g.lineWidth = s / 50;
  rr(g, s * .36, s * .36, s * .28, s * .28, s / 26); g.stroke();
}

function paintThief(g, s) {
  paintFloorBase(g, s);
  const c = s / 2;
  // hooded shadow figure
  g.fillStyle = lgr(g, 0, s * .2, 0, s * .9, [[0, '#2a2f45'], [1, '#0c0f1c']]);
  g.beginPath();
  g.moveTo(c - s * .22, s * .82);
  g.quadraticCurveTo(c - s * .26, s * .3, c, s * .16);
  g.quadraticCurveTo(c + s * .26, s * .3, c + s * .22, s * .82);
  g.closePath(); g.fill();
  g.fillStyle = '#05070d';
  g.beginPath(); g.ellipse(c, s * .36, s * .13, s * .11, 0, 0, 7); g.fill();
  glow(g, PAL.red, s / 12);
  g.fillStyle = PAL.red;
  g.beginPath(); g.ellipse(c - s * .05, s * .36, s * .025, s * .015, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(c + s * .05, s * .36, s * .025, s * .015, 0, 0, 7); g.fill();
  noGlow(g);
  g.strokeStyle = 'rgba(120,140,190,.4)'; g.lineWidth = s / 40;
  g.beginPath(); g.moveTo(c - s * .14, s * .6); g.quadraticCurveTo(c, s * .54, c + s * .14, s * .6); g.stroke();
}

function paintButton(g, s, color) {
  paintFloorBase(g, s);
  const c = s / 2;
  g.fillStyle = lgr(g, 0, c - s * .2, 0, c + s * .2, [[0, '#39435f'], [1, '#1a2138']]);
  g.beginPath(); g.arc(c, c, s * .26, 0, 7); g.fill();
  g.strokeStyle = '#506080'; g.lineWidth = s / 40;
  g.beginPath(); g.arc(c, c, s * .26, 0, 7); g.stroke();
  const cols = { green: '#3ddc66', red: '#ff4757', brown: '#b07840', blue: '#37b6ff' };
  const k = cols[color];
  g.fillStyle = lgr(g, 0, c - s * .16, 0, c + s * .16, [[0, k], [1, shade(k, -.45)]]);
  glow(g, k, s / 11);
  g.beginPath(); g.arc(c, c, s * .16, 0, 7); g.fill();
  noGlow(g);
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.ellipse(c - s * .05, c - s * .06, s * .05, s * .03, -.6, 0, 7); g.fill();
}

function shade(hex, amt) { // amt -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255;
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return `rgb(${f(r)},${f(gg)},${f(b)})`;
}

function paintToggle(g, s, open) {
  paintFloorBase(g, s);
  const m = s / 10;
  // posts
  g.fillStyle = '#3c4a6e';
  for (const [px, py] of [[m * .6, m * .6], [s - m * 1.6, m * .6], [m * .6, s - m * 1.6], [s - m * 1.6, s - m * 1.6]]) {
    rr(g, px, py, m, m, s / 40); g.fill();
  }
  if (open) {
    g.setLineDash([s / 16, s / 12]);
    g.strokeStyle = 'rgba(125,255,98,.30)'; g.lineWidth = s / 44;
    rr(g, m * 1.1, m * 1.1, s - 2.2 * m, s - 2.2 * m, s / 26); g.stroke();
    g.setLineDash([]);
  } else {
    g.fillStyle = 'rgba(125,255,98,.13)';
    rr(g, m, m, s - 2 * m, s - 2 * m, s / 22); g.fill();
    g.strokeStyle = PAL.lime; g.lineWidth = s / 30;
    glow(g, 'rgba(125,255,98,.9)', s / 10);
    rr(g, m, m, s - 2 * m, s - 2 * m, s / 22); g.stroke();
    noGlow(g);
    g.strokeStyle = 'rgba(125,255,98,.4)'; g.lineWidth = s / 50;
    for (let i = -3; i < 7; i++) {
      g.beginPath(); g.moveTo(m + i * s / 6, s - m); g.lineTo(m + (i + 2) * s / 6, m); g.stroke();
    }
  }
}

function paintTeleport(g, s, f) {
  paintFloorBase(g, s);
  const c = s / 2, rot = f / 8 * Math.PI * 2;
  g.fillStyle = rgr(g, c, c, 0, s * .48, [[0, 'rgba(46,230,255,.2)'], [1, 'rgba(46,230,255,0)']]);
  g.fillRect(0, 0, s, s);
  g.save(); g.translate(c, c); g.rotate(rot);
  for (let arm = 0; arm < 2; arm++) {
    g.rotate(Math.PI);
    g.strokeStyle = arm ? PAL.cyan : PAL.magenta;
    g.lineWidth = s / 13; g.lineCap = 'round';
    glow(g, arm ? PAL.cyan : PAL.magenta, s / 9);
    g.beginPath();
    for (let a = 0; a < Math.PI * 1.15; a += .12) {
      const r = s * .06 + a / (Math.PI * 1.15) * s * .3;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.stroke();
  }
  g.restore(); noGlow(g);
}

function paintBomb(g, s, f) {
  paintFloorBase(g, s);
  const c = s / 2, blink = f % 8 < 4;
  g.fillStyle = rgr(g, c - s * .08, c - s * .06, s * .02, s * .26, [[0, '#3d4459'], [1, '#0c0e18']]);
  g.beginPath(); g.arc(c, c + s * .04, s * .24, 0, 7); g.fill();
  g.strokeStyle = '#454f6b'; g.lineWidth = s / 44;
  g.beginPath(); g.arc(c, c + s * .04, s * .24, 0, 7); g.stroke();
  // cap + fuse
  g.fillStyle = '#39415c';
  rr(g, c - s * .06, c - s * .26, s * .12, s * .08, s / 40); g.fill();
  g.strokeStyle = '#8a6a3a'; g.lineWidth = s / 36; g.lineCap = 'round';
  g.beginPath(); g.moveTo(c, c - s * .26); g.quadraticCurveTo(c + s * .1, c - s * .36, c + s * .16, c - s * .3); g.stroke();
  if (blink) {
    glow(g, PAL.red, s / 9);
    g.fillStyle = PAL.red;
    g.beginPath(); g.arc(c, c + s * .04, s * .05, 0, 7); g.fill();
    noGlow(g);
  } else {
    g.fillStyle = '#5c1620';
    g.beginPath(); g.arc(c, c + s * .04, s * .05, 0, 7); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.25)';
  g.beginPath(); g.ellipse(c - s * .09, c - s * .05, s * .06, s * .04, -.7, 0, 7); g.fill();
}

function paintTrap(g, s) {
  paintFloorBase(g, s);
  const c = s / 2;
  g.fillStyle = '#0a0d18';
  g.beginPath(); g.arc(c, c, s * .3, 0, 7); g.fill();
  g.strokeStyle = '#39415c'; g.lineWidth = s / 30;
  g.beginPath(); g.arc(c, c, s * .3, 0, 7); g.stroke();
  // claws
  g.fillStyle = lgr(g, 0, 0, s, s, [[0, '#b8c4dd'], [1, '#5a6580']]);
  for (let q = 0; q < 4; q++) {
    g.save(); g.translate(c, c); g.rotate(q * Math.PI / 2 + Math.PI / 4);
    g.beginPath();
    g.moveTo(-s * .07, -s * .34);
    g.lineTo(s * .07, -s * .34);
    g.lineTo(0, -s * .1);
    g.closePath(); g.fill();
    g.restore();
  }
  g.fillStyle = 'rgba(255,71,87,.6)';
  g.beginPath(); g.arc(c, c, s * .05, 0, 7); g.fill();
}

function paintCloner(g, s) {
  g.fillStyle = lgr(g, 0, 0, 0, s, [[0, '#262e4a'], [1, '#141a30']]);
  g.fillRect(0, 0, s, s);
  const m = s / 16;
  // hazard corners
  g.fillStyle = '#e8b62e';
  for (const [px, py, a] of [[0, 0, 0], [s, 0, Math.PI / 2], [s, s, Math.PI], [0, s, -Math.PI / 2]]) {
    g.save(); g.translate(px, py); g.rotate(a);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(m * 4, 0); g.lineTo(0, m * 4); g.fill();
    g.fillStyle = '#11141f';
    g.beginPath(); g.moveTo(m * 1.2, 0); g.lineTo(m * 2.4, 0); g.lineTo(0, m * 2.4); g.lineTo(0, m * 1.2); g.fill();
    g.fillStyle = '#e8b62e';
    g.restore();
  }
  rr(g, m * 3.4, m * 3.4, s - 6.8 * m, s - 6.8 * m, s / 16);
  g.fillStyle = '#0d1122'; g.fill();
  g.strokeStyle = '#4a5878'; g.lineWidth = s / 36;
  rr(g, m * 3.4, m * 3.4, s - 6.8 * m, s - 6.8 * m, s / 16); g.stroke();
  // replication glyph: two overlapping squares
  g.strokeStyle = 'rgba(140,200,255,.8)'; g.lineWidth = s / 38;
  rr(g, s * .36, s * .36, s * .17, s * .17, s / 50); g.stroke();
  g.strokeStyle = 'rgba(140,200,255,.45)';
  rr(g, s * .46, s * .46, s * .17, s * .17, s / 50); g.stroke();
}

function paintPanel(g, s, sides) { // sides: array of 'N','W','S','E'
  paintFloorVariant(g, s, 0);
  const th = s / 9;
  for (const side of sides) {
    g.save();
    g.translate(s / 2, s / 2);
    g.rotate({ N: 0, E: Math.PI / 2, S: Math.PI, W: -Math.PI / 2 }[side]);
    const y = -s / 2 + th * .7;
    g.strokeStyle = '#cdd9f2'; g.lineWidth = th * .62; g.lineCap = 'round';
    glow(g, 'rgba(150,200,255,.9)', s / 12);
    g.beginPath(); g.moveTo(-s / 2 + th * .8, y); g.lineTo(s / 2 - th * .8, y); g.stroke();
    noGlow(g);
    g.strokeStyle = 'rgba(70,90,130,.9)'; g.lineWidth = th * .2;
    g.beginPath(); g.moveTo(-s / 2 + th * .8, y + th * .34); g.lineTo(s / 2 - th * .8, y + th * .34); g.stroke();
    g.restore();
  }
}

/* ------------------------------------------------------------ atlas build */

const ATLAS_DEFS = []; // {name, frames, paint(g,s,f)}
function def(name, frames, paint) { ATLAS_DEFS.push({ name, frames, paint }); }

def('floor0', 1, (g, s) => paintFloorVariant(g, s, 0));
def('floor1', 1, (g, s) => paintFloorVariant(g, s, 1));
def('floor2', 1, (g, s) => paintFloorVariant(g, s, 2));
def('floor3', 1, (g, s) => paintFloorVariant(g, s, 3));
def('wall', 1, paintWall);
def('bluewall', 1, paintBlueWall);
def('chipItem', 8, paintChipItem);
def('water', 8, paintWater);
def('fire', 8, paintFire);
def('ice', 1, paintIce);
def('iceSE', 1, (g, s) => paintIceCorner(g, s, 'SE'));
def('iceSW', 1, (g, s) => paintIceCorner(g, s, 'SW'));
def('iceNW', 1, (g, s) => paintIceCorner(g, s, 'NW'));
def('iceNE', 1, (g, s) => paintIceCorner(g, s, 'NE'));
def('forceN', 8, (g, s, f) => paintForce(g, s, f, DIR_N));
def('forceW', 8, (g, s, f) => paintForce(g, s, f, DIR_W));
def('forceS', 8, (g, s, f) => paintForce(g, s, f, DIR_S));
def('forceE', 8, (g, s, f) => paintForce(g, s, f, DIR_E));
def('forceRnd', 8, paintForceRnd);
def('exit', 8, paintExit);
def('doorB', 1, (g, s) => paintDoor(g, s, 'B'));
def('doorR', 1, (g, s) => paintDoor(g, s, 'R'));
def('doorG', 1, (g, s) => paintDoor(g, s, 'G'));
def('doorY', 1, (g, s) => paintDoor(g, s, 'Y'));
def('keyB', 1, (g, s) => paintKey(g, s, 'B'));
def('keyR', 1, (g, s) => paintKey(g, s, 'R'));
def('keyG', 1, (g, s) => paintKey(g, s, 'G'));
def('keyY', 1, (g, s) => paintKey(g, s, 'Y'));
def('flippers', 1, paintFlippers);
def('fireboots', 1, paintFireboots);
def('skates', 1, paintSkates);
def('suction', 1, paintSuction);
def('dirt', 1, paintDirt);
def('gravel', 1, paintGravel);
def('popup', 1, paintPopup);
def('hint', 8, paintHint);
def('socket', 1, paintSocket);
def('thief', 1, paintThief);
def('btnGreen', 1, (g, s) => paintButton(g, s, 'green'));
def('btnRed', 1, (g, s) => paintButton(g, s, 'red'));
def('btnBrown', 1, (g, s) => paintButton(g, s, 'brown'));
def('btnBlue', 1, (g, s) => paintButton(g, s, 'blue'));
def('toggleC', 1, (g, s) => paintToggle(g, s, false));
def('toggleO', 1, (g, s) => paintToggle(g, s, true));
def('teleport', 8, paintTeleport);
def('bomb', 8, paintBomb);
def('trap', 1, paintTrap);
def('cloner', 1, paintCloner);
def('panelN', 1, (g, s) => paintPanel(g, s, ['N']));
def('panelW', 1, (g, s) => paintPanel(g, s, ['W']));
def('panelS', 1, (g, s) => paintPanel(g, s, ['S']));
def('panelE', 1, (g, s) => paintPanel(g, s, ['E']));
def('panelSE', 1, (g, s) => paintPanel(g, s, ['S', 'E']));

function buildAtlas(tileSize) {
  const cells = [];
  for (const d of ATLAS_DEFS) for (let f = 0; f < d.frames; f++) cells.push({ def: d, f });
  const cols = 12, rows = Math.ceil(cells.length / cols);
  const cv = document.createElement('canvas');
  cv.width = cols * tileSize; cv.height = rows * tileSize;
  const g = cv.getContext('2d');
  const index = {};
  cells.forEach((cell, i) => {
    const cx = (i % cols) * tileSize, cy = ((i / cols) | 0) * tileSize;
    g.save();
    g.translate(cx, cy);
    g.beginPath(); g.rect(0, 0, tileSize, tileSize); g.clip();
    cell.def.paint(g, tileSize, cell.f);
    g.restore();
    (index[cell.def.name] ??= { frames: [], n: cell.def.frames }).frames.push([cx, cy]);
  });
  return {
    canvas: cv, size: tileSize,
    draw(ctx, name, frame, dx, dy) {
      const e = index[name];
      if (!e) return;
      const [sx, sy] = e.frames[frame % e.n];
      ctx.drawImage(cv, sx, sy, tileSize, tileSize, dx, dy, tileSize, tileSize);
    },
  };
}

/* Map terrain code -> atlas sprite name (frame chosen by renderer clock) */
function spriteForTile(code, x, y) {
  switch (code) {
    case T.FLOOR: {
      const h = tileHash(x, y) % 10;
      return h < 6 ? 'floor0' : 'floor' + (1 + h % 3);
    }
    case T.WALL: case T.HWALL: case T.HWALL_APPEAR: return code === T.WALL ? 'wall' : 'floor0';
    case T.CHIP: return 'chipItem';
    case T.WATER: return 'water';
    case T.FIRE: return 'fire';
    case T.ICE: return 'ice';
    case T.ICE_SE: return 'iceSE';
    case T.ICE_SW: return 'iceSW';
    case T.ICE_NW: return 'iceNW';
    case T.ICE_NE: return 'iceNE';
    case T.FORCE_N: return 'forceN';
    case T.FORCE_W: return 'forceW';
    case T.FORCE_S: return 'forceS';
    case T.FORCE_E: return 'forceE';
    case T.FORCE_RND: return 'forceRnd';
    case T.EXIT: return 'exit';
    case T.DOOR_B: return 'doorB';
    case T.DOOR_R: return 'doorR';
    case T.DOOR_G: return 'doorG';
    case T.DOOR_Y: return 'doorY';
    case T.KEY_B: return 'keyB';
    case T.KEY_R: return 'keyR';
    case T.KEY_G: return 'keyG';
    case T.KEY_Y: return 'keyY';
    case T.FLIPPERS: return 'flippers';
    case T.FIREBOOTS: return 'fireboots';
    case T.SKATES: return 'skates';
    case T.SUCTION: return 'suction';
    case T.DIRT: return 'dirt';
    case T.GRAVEL: return 'gravel';
    case T.POPUP: return 'popup';
    case T.HINT: return 'hint';
    case T.SOCKET: return 'socket';
    case T.THIEF: return 'thief';
    case T.BTN_GREEN: return 'btnGreen';
    case T.BTN_RED: return 'btnRed';
    case T.BTN_BROWN: return 'btnBrown';
    case T.BTN_BLUE: return 'btnBlue';
    case T.TOGGLE_C: return 'toggleC';
    case T.TOGGLE_O: return 'toggleO';
    case T.TELEPORT: return 'teleport';
    case T.BOMB: return 'bomb';
    case T.TRAP: return 'trap';
    case T.CLONER: return 'cloner';
    case T.FAKEWALL: case T.REALWALL: return 'bluewall';
    case T.PANEL_N: return 'panelN';
    case T.PANEL_W: return 'panelW';
    case T.PANEL_S: return 'panelS';
    case T.PANEL_E: return 'panelE';
    case T.PANEL_SE: return 'panelSE';
    default: return 'floor0';
  }
}

/* ------------------------------------------------------- entity painters
   Drawn live each frame, centered in a tile of size s.
   t = seconds clock, dir = facing, ent = entity (for phase offsets). */

function entShadow(g, s, w = .58) {
  g.fillStyle = 'rgba(0,0,0,.38)';
  g.beginPath(); g.ellipse(s / 2, s * .8, s * w / 2, s * .1, 0, 0, 7); g.fill();
}

const ENTITY_PAINTERS = {
  chip(g, s, t, dir, ent) {
    const bob = ent.moving ? Math.sin(t * 18) * s * .02 : Math.sin(t * 3 + 1) * s * .012;
    entShadow(g, s, .5);
    g.save(); g.translate(0, bob);
    const c = s / 2;
    // body
    g.fillStyle = lgr(g, 0, s * .42, 0, s * .8, [[0, '#3a76c8'], [1, '#1c3e74']]);
    rr(g, c - s * .15, s * .44, s * .3, s * .3, s / 9); g.fill();
    // backpack (visible from N/E/W)
    if (dir !== DIR_S) {
      g.fillStyle = '#22518f';
      const off = dir === DIR_N ? 0 : dir === DIR_W ? s * .1 : -s * .1;
      rr(g, c - s * .11 + off, s * .47, s * .22, s * .2, s / 12); g.fill();
    }
    // boots
    g.fillStyle = '#16263f';
    rr(g, c - s * .15, s * .7, s * .13, s * .08, s / 24); g.fill();
    rr(g, c + s * .02, s * .7, s * .13, s * .08, s / 24); g.fill();
    // helmet
    g.fillStyle = lgr(g, 0, s * .12, 0, s * .5, [[0, '#f4f8ff'], [1, '#b9c6e2']]);
    glow(g, 'rgba(160,200,255,.45)', s / 16);
    g.beginPath(); g.arc(c, s * .32, s * .19, 0, 7); g.fill();
    noGlow(g);
    // visor by direction
    if (dir === DIR_S || ent.swimming) {
      g.fillStyle = lgr(g, 0, s * .24, 0, s * .4, [[0, '#54f3ff'], [1, '#0f7fa8']]);
      rr(g, c - s * .13, s * .24, s * .26, s * .14, s / 12); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.ellipse(c - s * .06, s * .29, s * .025, s * .035, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(c + s * .06, s * .29, s * .025, s * .035, 0, 0, 7); g.fill();
    } else if (dir === DIR_E || dir === DIR_W) {
      const sgn = dir === DIR_E ? 1 : -1;
      g.fillStyle = lgr(g, 0, s * .24, 0, s * .4, [[0, '#54f3ff'], [1, '#0f7fa8']]);
      rr(g, c + (sgn > 0 ? -s * .02 : -s * .16), s * .25, s * .18, s * .12, s / 14); g.fill();
      g.fillStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.ellipse(c + sgn * s * .08, s * .3, s * .022, s * .03, 0, 0, 7); g.fill();
    }
    // antenna
    g.strokeStyle = '#9fb3d8'; g.lineWidth = s / 40; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c + s * .1, s * .16); g.lineTo(c + s * .15, s * .07); g.stroke();
    g.fillStyle = PAL.amber; glow(g, PAL.amber, s / 14);
    g.beginPath(); g.arc(c + s * .155, s * .062, s * .028, 0, 7); g.fill();
    noGlow(g);
    g.restore();
  },

  block(g, s) {
    const m = s * .1;
    g.fillStyle = 'rgba(0,0,0,.4)';
    rr(g, m + s * .03, m + s * .06, s - 2 * m, s - 2 * m, s / 11); g.fill();
    rr(g, m, m * .8, s - 2 * m, s - 2 * m, s / 11);
    g.fillStyle = lgr(g, 0, m, 0, s - m, [[0, '#8e9cb8'], [.5, '#5f6d8c'], [1, '#3a455f']]);
    g.fill();
    rr(g, m, m * .8, s - 2 * m, s - 2 * m, s / 11);
    g.strokeStyle = '#a9b8d6'; g.lineWidth = s / 36; g.stroke();
    rr(g, m * 1.9, m * 1.7, s - 3.8 * m, s - 3.8 * m, s / 16);
    g.strokeStyle = 'rgba(30,38,58,.8)'; g.lineWidth = s / 30; g.stroke();
    g.fillStyle = 'rgba(30,38,58,.8)';
    for (const [rx, ry] of [[.22, .2], [.78, .2], [.22, .78], [.78, .78]]) {
      g.beginPath(); g.arc(rx * s, ry * s * .96 + m * .2, s / 36, 0, 7); g.fill();
    }
    g.strokeStyle = 'rgba(170,190,225,.5)'; g.lineWidth = s / 24; g.lineCap = 'round';
    g.beginPath(); g.moveTo(s * .36, s * .49); g.lineTo(s * .64, s * .49); g.stroke();
  },

  bug(g, s, t, dir) {
    entShadow(g, s, .44);
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    const scut = Math.sin(t * 22) * s * .03;
    g.strokeStyle = '#7a2a18'; g.lineWidth = s / 22; g.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
      const sway = (i % 2 ? scut : -scut);
      g.beginPath(); g.moveTo(-s * .12, i * s * .12); g.lineTo(-s * .26 - Math.abs(i) * s * .01, i * s * .12 + sway); g.stroke();
      g.beginPath(); g.moveTo(s * .12, i * s * .12); g.lineTo(s * .26 + Math.abs(i) * s * .01, i * s * .12 - sway); g.stroke();
    }
    g.fillStyle = rgr(g, -s * .04, -s * .08, s * .02, s * .3, [[0, '#ff7a4d'], [.6, '#e2492a'], [1, '#8e2412']]);
    g.beginPath(); g.ellipse(0, s * .02, s * .17, s * .21, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(90,20,8,.7)'; g.lineWidth = s / 44;
    g.beginPath(); g.moveTo(0, -s * .16); g.lineTo(0, s * .2); g.stroke();
    // head toward facing (up in local space)
    g.fillStyle = '#43150a';
    g.beginPath(); g.arc(0, -s * .2, s * .085, 0, 7); g.fill();
    g.strokeStyle = '#43150a'; g.lineWidth = s / 40;
    g.beginPath(); g.moveTo(-s * .04, -s * .25); g.lineTo(-s * .09, -s * .33); g.stroke();
    g.beginPath(); g.moveTo(s * .04, -s * .25); g.lineTo(s * .09, -s * .33); g.stroke();
    g.fillStyle = '#ffd9a8';
    g.beginPath(); g.arc(-s * .035, -s * .2, s * .02, 0, 7); g.fill();
    g.beginPath(); g.arc(s * .035, -s * .2, s * .02, 0, 7); g.fill();
    g.restore();
  },

  fireball(g, s, t, dir) {
    const c = s / 2, flick = 1 + Math.sin(t * 26) * .08;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    // tail (opposite of travel = local +y)
    g.fillStyle = 'rgba(255,140,40,.4)';
    glow(g, 'rgba(255,120,30,.9)', s / 7);
    g.beginPath();
    g.moveTo(-s * .14, s * .05);
    g.quadraticCurveTo(0, s * .46 * flick, s * .14, s * .05);
    g.closePath(); g.fill();
    g.fillStyle = rgr(g, 0, -s * .04, s * .02, s * .2 * flick, [[0, '#fff3c8'], [.4, '#ffc23e'], [1, '#f25c1e']]);
    g.beginPath(); g.arc(0, 0, s * .19 * flick, 0, 7); g.fill();
    noGlow(g);
    g.restore();
  },

  ball(g, s, t) {
    entShadow(g, s, .4);
    const c = s / 2, ph = (Math.sin(t * 14) + 1) / 2, sq = 1 - ph * .12;
    g.save(); g.translate(c, c + (1 - sq) * s * .18); g.scale(1 / Math.sqrt(sq), sq);
    g.fillStyle = rgr(g, -s * .05, -s * .07, s * .02, s * .24, [[0, '#ffd9f6'], [.5, '#ff5ee0'], [1, '#a31d85']]);
    glow(g, 'rgba(255,94,224,.8)', s / 9);
    g.beginPath(); g.arc(0, 0, s * .2, 0, 7); g.fill();
    noGlow(g);
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.beginPath(); g.ellipse(-s * .07, -s * .08, s * .05, s * .03, -.6, 0, 7); g.fill();
    g.restore();
  },

  tank(g, s, t, dir, ent) {
    entShadow(g, s, .56);
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    // dark contrast halo so the tank separates from blue floors/water
    g.fillStyle = 'rgba(4,8,16,.55)';
    rr(g, -s * .28, -s * .3, s * .56, s * .6, s / 9); g.fill();
    // treads
    g.fillStyle = '#11161f';
    rr(g, -s * .25, -s * .27, s * .13, s * .54, s / 18); g.fill();
    rr(g, s * .12, -s * .27, s * .13, s * .54, s / 18); g.fill();
    g.strokeStyle = '#5a6684'; g.lineWidth = s / 44;
    const roll = (ent.moving ? t * 5 : 0) % 1;
    for (let i = 0; i < 5; i++) {
      const y = -s * .27 + ((i / 5 + roll) % 1) * s * .54;
      g.beginPath(); g.moveTo(-s * .25, y); g.lineTo(-s * .12, y); g.stroke();
      g.beginPath(); g.moveTo(s * .12, y); g.lineTo(s * .25, y); g.stroke();
    }
    // hull — warm steel so it reads against blue, with a bright rim outline
    rr(g, -s * .15, -s * .2, s * .3, s * .4, s / 14);
    g.fillStyle = lgr(g, -s * .15, -s * .2, s * .15, s * .2, [[0, '#9fb0c8'], [.45, '#67768f'], [1, '#3a4456']]);
    g.fill();
    rr(g, -s * .15, -s * .2, s * .3, s * .4, s / 14);
    g.strokeStyle = '#dfe9ff'; g.lineWidth = s / 34; g.stroke();
    // top sheen
    rr(g, -s * .1, -s * .16, s * .2, s * .1, s / 26);
    g.fillStyle = 'rgba(240,247,255,.28)'; g.fill();
    // turret
    g.fillStyle = '#2a3242';
    g.beginPath(); g.arc(0, s * .02, s * .115, 0, 7); g.fill();
    g.strokeStyle = '#c6d4ee'; g.lineWidth = s / 38;
    g.beginPath(); g.arc(0, s * .02, s * .115, 0, 7); g.stroke();
    // barrel (faces travel = local -y) with a warm muzzle so direction pops
    g.fillStyle = '#b9c6dd';
    rr(g, -s * .028, -s * .36, s * .056, s * .38, s / 40); g.fill();
    g.strokeStyle = 'rgba(20,28,42,.6)'; g.lineWidth = s / 70;
    rr(g, -s * .028, -s * .36, s * .056, s * .38, s / 40); g.stroke();
    g.fillStyle = PAL.amber;
    glow(g, PAL.amber, s / 14);
    g.beginPath(); g.arc(0, -s * .35, s * .035, 0, 7); g.fill();
    noGlow(g);
    g.fillStyle = '#0b1018';
    g.beginPath(); g.arc(0, s * .02, s * .045, 0, 7); g.fill();
    g.restore();
  },

  glider(g, s, t, dir) {
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    const hover = Math.sin(t * 9) * s * .015;
    g.translate(0, hover);
    glow(g, 'rgba(46,230,255,.9)', s / 8);
    g.fillStyle = lgr(g, 0, -s * .3, 0, s * .26, [[0, '#bdf6ff'], [.5, '#2ee6ff'], [1, '#0e7e9e']]);
    g.beginPath();
    g.moveTo(0, -s * .3);
    g.lineTo(s * .26, s * .22);
    g.lineTo(0, s * .1);
    g.lineTo(-s * .26, s * .22);
    g.closePath(); g.fill();
    noGlow(g);
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = s / 50;
    g.beginPath(); g.moveTo(0, -s * .3); g.lineTo(0, s * .1); g.stroke();
    g.fillStyle = '#063a4a';
    g.beginPath(); g.arc(0, -s * .06, s * .045, 0, 7); g.fill();
    g.restore();
  },

  teeth(g, s, t, dir, ent) {
    entShadow(g, s, .5);
    const c = s / 2, chomp = ent.moving ? (Math.sin(t * 16) + 1) / 2 : .15;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    // body
    g.fillStyle = rgr(g, -s * .04, 0, s * .04, s * .3, [[0, '#b66ef0'], [.6, '#8a36cc'], [1, '#551a88']]);
    g.beginPath(); g.arc(0, s * .02, s * .23, 0, 7); g.fill();
    // mouth toward facing (local -y): two jaws
    const open = s * (.04 + chomp * .09);
    g.fillStyle = '#2c0a48';
    g.beginPath(); g.ellipse(0, -s * .12, s * .15, open * 1.1, 0, 0, 7); g.fill();
    g.fillStyle = '#ffffff';
    for (const sgn of [-1, 1]) { // jaws of zigzag teeth
      g.save(); g.translate(0, -s * .12 + sgn * open * .55);
      g.beginPath();
      const n = 4, w = s * .26;
      g.moveTo(-w / 2, 0);
      for (let i = 0; i < n; i++) {
        g.lineTo(-w / 2 + w * (i + .5) / n, sgn * -s * .055);
        g.lineTo(-w / 2 + w * (i + 1) / n, 0);
      }
      g.lineTo(w / 2, sgn * s * .02); g.lineTo(-w / 2, sgn * s * .02);
      g.closePath(); g.fill();
      g.restore();
    }
    // eyes
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(-s * .09, s * .1, s * .05, 0, 7); g.fill();
    g.beginPath(); g.arc(s * .09, s * .1, s * .05, 0, 7); g.fill();
    g.fillStyle = '#27063f';
    g.beginPath(); g.arc(-s * .09, s * .085, s * .025, 0, 7); g.fill();
    g.beginPath(); g.arc(s * .09, s * .085, s * .025, 0, 7); g.fill();
    g.restore();
  },

  walker(g, s, t, dir, ent) {
    entShadow(g, s, .4);
    const c = s / 2, step = ent.moving ? Math.sin(t * 16) : 0;
    g.save(); g.translate(c, c);
    const lean = [0, -.12, 0, .12][dir];
    g.rotate(lean);
    // legs
    g.strokeStyle = '#5d5648'; g.lineWidth = s / 14; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-s * .07, s * .14); g.lineTo(-s * .09 + step * s * .05, s * .32); g.stroke();
    g.beginPath(); g.moveTo(s * .07, s * .14); g.lineTo(s * .09 - step * s * .05, s * .32); g.stroke();
    // capsule body
    g.fillStyle = lgr(g, -s * .14, 0, s * .14, 0, [[0, '#efe6d2'], [.5, '#cdbfa4'], [1, '#9a8a6c']]);
    rr(g, -s * .14, -s * .3, s * .28, s * .48, s * .14); g.fill();
    g.fillStyle = '#7a6c52';
    rr(g, -s * .14, -s * .06, s * .28, s * .07, s * .03); g.fill();
    // eye
    g.fillStyle = '#2b2417';
    g.beginPath(); g.arc(0, -s * .16, s * .055, 0, 7); g.fill();
    g.fillStyle = '#ffe9b0';
    g.beginPath(); g.arc(s * .015, -s * .175, s * .02, 0, 7); g.fill();
    g.restore();
  },

  blob(g, s, t, dir, ent) {
    const c = s / 2;
    g.save(); g.translate(c, c + s * .06);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.beginPath(); g.ellipse(0, s * .22, s * .26, s * .07, 0, 0, 7); g.fill();
    const ph = t * 4 + (ent.id || 0);
    g.fillStyle = rgr(g, 0, -s * .04, s * .03, s * .3, [[0, 'rgba(190,255,150,.95)'], [.6, 'rgba(110,220,80,.88)'], [1, 'rgba(45,130,40,.85)']]);
    glow(g, 'rgba(120,255,90,.5)', s / 12);
    g.beginPath();
    for (let a = 0; a <= Math.PI * 2 + .01; a += .25) {
      const r = s * .22 + Math.sin(a * 3 + ph) * s * .03 + Math.sin(a * 5 - ph * 1.3) * s * .015;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * .88;
      a === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
    }
    g.closePath(); g.fill();
    noGlow(g);
    // nucleus
    g.fillStyle = 'rgba(30,90,25,.8)';
    g.beginPath(); g.arc(Math.sin(ph) * s * .03, Math.cos(ph * .7) * s * .02, s * .07, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.5)';
    g.beginPath(); g.ellipse(-s * .08, -s * .1, s * .05, s * .03, -.5, 0, 7); g.fill();
    g.restore();
  },

  paramecium(g, s, t, dir) {
    entShadow(g, s, .5);
    const c = s / 2;
    g.save(); g.translate(c, c); g.rotate([0, -Math.PI / 2, Math.PI, Math.PI / 2][dir]);
    const wig = Math.sin(t * 12) * .08;
    g.rotate(wig);
    // cilia
    g.strokeStyle = 'rgba(255,170,200,.75)'; g.lineWidth = s / 46; g.lineCap = 'round';
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2, fl = Math.sin(t * 20 + i) * s * .015;
      const x = Math.cos(a) * s * .13, y = Math.sin(a) * s * .25;
      const nx = Math.cos(a) * (s * .19 + fl), ny = Math.sin(a) * (s * .31 + fl);
      g.beginPath(); g.moveTo(x, y); g.lineTo(nx, ny); g.stroke();
    }
    g.fillStyle = lgr(g, -s * .12, 0, s * .12, 0, [[0, '#ffd2e4'], [.5, '#f490ba'], [1, '#b04878']]);
    g.beginPath(); g.ellipse(0, 0, s * .13, s * .26, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(150,50,95,.6)'; g.lineWidth = s / 50;
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.ellipse(0, i * s * .1, s * .09 - Math.abs(i) * s * .02, s * .045, 0, 0, 7); g.stroke();
    }
    g.fillStyle = '#7c2450';
    g.beginPath(); g.arc(0, -s * .16, s * .035, 0, 7); g.fill();
    g.restore();
  },
};

function drawEntity(ctx, ent, px, py, s, t) {
  const painter = ENTITY_PAINTERS[ent.kind];
  if (!painter) return;
  ctx.save();
  ctx.translate(px, py);
  painter(ctx, s, t, ent.dir, ent);
  ctx.restore();
}
