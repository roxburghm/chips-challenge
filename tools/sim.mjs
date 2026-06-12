// Headless engine simulation tests. Runs the browser engine files in Node
// by concatenating them into one function scope (mirrors shared <script> scope).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = ['js/dat.js', 'js/tiles.js', 'js/engine.js']
  .map(f => readFileSync(root + f, 'utf8'))
  .join('\n');

const tests = `
const results = [];
function check(name, cond, extra='') {
  results.push({ name, pass: !!cond, extra: String(extra) });
}
const buf = BUF;
const levels = parseDat(buf);

/* ---- A: LESSON 1 basics ---- */
{
  const g = new Game(levels[0]);
  g.state = 'playing';
  const c = g.chip;
  const step = d => { g.input.pending = d; for (let i = 0; i < 4; i++) g.tick(); };
  check('A1 chip spawn', c && c.x === 15 && c.y === 14, \`at \${c.x},\${c.y}\`);
  // two tiles west of start is a computer chip
  step(DIR_W); step(DIR_W);
  check('A2 walk west + pickup', c.x === 13 && g.chipsLeft === 10, \`pos \${c.x},\${c.y} chips \${g.chipsLeft}\`);
  // back east, then north onto hint, then up to the socket row
  step(DIR_E); step(DIR_E); step(DIR_N);
  check('A3 on hint tile', c.x === 15 && c.y === 13 && g.terrain[13*32+15] === T.HINT, \`pos \${c.x},\${c.y}\`);
  step(DIR_N); step(DIR_N);
  check('A4 socket blocks', c.y === 12, \`pos \${c.x},\${c.y}\`);
  // with zero chips left the socket opens, then the exit above wins
  g.chipsLeft = 0;
  step(DIR_N);
  check('A5 socket opens at 0 chips', c.y === 11 && g.terrain[11*32+15] === T.FLOOR, \`pos \${c.x},\${c.y}\`);
  step(DIR_N);
  check('A6 exit wins', g.state === 'won', g.state);
}

/* ---- helpers for synthetic levels ---- */
function blank() {
  return { number: 99, time: 0, chips: 0, title: 'TEST', password: 'ZZZZ', hint: '',
           traps: [], clones: [], monsters: [], top: new Uint8Array(1024), bottom: new Uint8Array(1024) };
}
const at = (l, x, y, t) => l.top[y*32+x] = t;

/* ---- B: ice sliding ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e); // chip facing S
  for (let x = 6; x <= 9; x++) at(l, x, 5, T.ICE);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 12; i++) g.tick();
  check('B1 ice slide to far floor', g.chip.x === 10 && g.chip.y === 5, \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- B2: ice bounce off wall ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  for (let x = 6; x <= 8; x++) at(l, x, 5, T.ICE);
  at(l, 9, 5, T.WALL);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 20; i++) g.tick();
  check('B2 ice bounce returns', g.chip.x === 5, \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- B3: ice corners route a slide around a loop (LESSON 3 shape) ---- */
{
  // C-shaped ice loop: enter top going west, exit bottom going east.
  //   iSE  ICE  ICE  <- chip enters here heading west
  //   ICE
  //   ICE
  //   iNE  ICE  ICE  -> exits here heading east
  const l = blank();
  at(l, 8, 5, 0x6d);              // chip facing W
  at(l, 7, 5, T.ICE); at(l, 6, 5, T.ICE); at(l, 5, 5, T.ICE_SE);
  at(l, 5, 6, T.ICE); at(l, 5, 7, T.ICE); at(l, 5, 8, T.ICE_NE);
  at(l, 6, 8, T.ICE); at(l, 7, 8, T.ICE);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_W;
  for (let i = 0; i < 16; i++) g.tick();
  check('B3 ice corners route around the loop', g.chip.x === 8 && g.chip.y === 8,
        \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- B4: ICE_SE redirects a westward slide to south, not a bounce ---- */
{
  const l = blank();
  at(l, 8, 5, 0x6d);              // chip facing W
  at(l, 7, 5, T.ICE); at(l, 6, 5, T.ICE); at(l, 5, 5, T.ICE_SE);
  at(l, 5, 6, T.ICE); at(l, 5, 7, T.ICE);   // floor below, slide stops at (5,8)
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_W;
  for (let i = 0; i < 12; i++) g.tick();
  check('B4 ICE_SE turns west->south', g.chip.x === 5 && g.chip.y === 8,
        \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- C: force floor + override ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  for (let x = 6; x <= 9; x++) at(l, x, 5, T.FORCE_E);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 12; i++) g.tick();
  check('C1 force floor carries', g.chip.x === 10, \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- C2: fake blue wall reveals AND passes in one step ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6d);              // chip facing W (any)
  at(l, 6, 5, T.FAKEWALL);
  at(l, 7, 5, T.FLOOR);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 2; i++) g.tick();   // walking = 2 ticks/tile, so one move
  check('C2 fake wall passes in one move', g.chip.x === 6 && g.terrain[5*32+6] === T.FLOOR,
        \`pos \${g.chip.x} tile \${g.terrain[5*32+6]}\`);
}

/* ---- C3: real blue wall blocks ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6d);
  at(l, 6, 5, T.REALWALL);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 4; i++) g.tick();
  check('C3 real blue wall blocks', g.chip.x === 5, \`pos \${g.chip.x}\`);
}

/* ---- C4: boost off a force floor through a fake wall (Nuts and Bolts case) ---- */
{
  const l = blank();
  // a south force-floor column with a fake wall to its right, walls elsewhere
  at(l, 5, 4, 0x6e);                       // chip facing S at top
  for (let y = 5; y <= 9; y++) { at(l, 5, y, T.FORCE_S); at(l, 4, y, T.WALL); at(l, 6, y, T.WALL); }
  at(l, 6, 7, T.FAKEWALL);                 // the lone fake wall in the right side
  at(l, 7, 7, T.FLOOR);
  at(l, 8, 7, T.WALL);                     // stop Chip just past the fake wall
  const g = new Game(l); g.state = 'playing';
  g.input.held = DIR_S;                    // enter the force floor
  g.tick();
  g.input.held = DIR_E;                    // then hold right to boost through the fake wall
  for (let i = 0; i < 16; i++) g.tick();
  check('C4 boost through fake wall off force floor', g.chip.x === 7 && g.chip.y === 7,
        \`pos \${g.chip.x},\${g.chip.y} fake=\${g.terrain[7*32+6]}\`);
}

/* ---- D: block push into water -> dirt ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BLOCK);
  at(l, 7, 5, T.WATER);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 4; i++) g.tick();
  const blockAlive = g.entities.some(e => e.kind === 'block' && !e.dead);
  check('D1 block splashes to dirt', !blockAlive && g.terrain[5*32+7] === T.DIRT && g.chip.x === 6,
        \`terrain \${g.terrain[5*32+7]} chip \${g.chip.x}\`);
  g.input.pending = DIR_E; for (let i = 0; i < 4; i++) g.tick();
  check('D2 chip clears dirt', g.chip.x === 7 && g.terrain[5*32+7] === T.FLOOR, \`pos \${g.chip.x}\`);
}

/* ---- E: monster kills chip ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 9, 5, 0x49); // pink ball facing W
  l.monsters.push({ x: 9, y: 5 });
  const g = new Game(l); g.state = 'playing';
  for (let i = 0; i < 20; i++) g.tick();
  check('E1 ball reaches and kills chip', g.state === 'dead', \`state \${g.state}\`);
}

/* ---- F: key + door ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.KEY_R);
  at(l, 7, 5, T.DOOR_R);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E; for (let i = 0; i < 4; i++) g.tick();
  check('F1 key picked up', g.inv.keys.R === 1, JSON.stringify(g.inv.keys));
  g.input.pending = DIR_E; for (let i = 0; i < 4; i++) g.tick();
  check('F2 door opens, key spent', g.chip.x === 7 && g.inv.keys.R === 0 && g.terrain[5*32+7] === T.FLOOR,
        \`pos \${g.chip.x} keys \${g.inv.keys.R}\`);
}

/* ---- G: LESSON 2 monsters patrol ---- */
{
  const g = new Game(levels[1]);
  g.state = 'playing';
  const before = g.actors.map(m => m.x + ',' + m.y).join(' ');
  for (let i = 0; i < 30; i++) g.tick();
  const after = g.actors.map(m => m.x + ',' + m.y).join(' ');
  check('G1 monsters move', before !== after && g.state === 'playing', \`\${before} -> \${after} state=\${g.state}\`);
}

/* ---- H: toggle walls + green button ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BTN_GREEN);
  at(l, 7, 5, T.TOGGLE_C);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E; for (let i = 0; i < 4; i++) g.tick();
  check('H1 green button toggles', g.terrain[5*32+7] === T.TOGGLE_O, g.terrain[5*32+7]);
  g.input.pending = DIR_E; for (let i = 0; i < 4; i++) g.tick();
  check('H2 walk through open toggle', g.chip.x === 7, \`pos \${g.chip.x}\`);
}

/* ---- I: teleport ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.TELEPORT);
  at(l, 20, 20, T.TELEPORT);
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 6; i++) g.tick();
  check('I1 teleport relocates + exits east', g.chip.x === 21 && g.chip.y === 20, \`pos \${g.chip.x},\${g.chip.y}\`);
}

/* ---- J: block-vs-block pushes ---- */
{
  const l = blank();
  at(l, 5, 5, 0x6e);         // chip
  at(l, 6, 5, T.BLOCK);
  at(l, 7, 5, T.BLOCK);      // two blocks in a row
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 4; i++) g.tick();
  const blocks = g.entities.filter(e => e.kind === 'block' && !e.dead);
  check('J1 double-block push is blocked', g.chip.x === 5 && blocks.length === 2,
        \`chip \${g.chip.x} blocks alive \${blocks.length}\`);
}
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BLOCK);
  at(l, 7, 5, 0x4a);         // pink ball facing S (so it stays put)
  l.monsters.push({ x: 7, y: 5 });
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 2; i++) g.tick();
  const monsterAlive = g.actors.some(m => !m.dead);
  const block = g.entities.find(e => e.kind === 'block');
  check('J2 monsters are block-acting walls', monsterAlive && block.x === 6 && g.chip.x === 5,
        \`monsterAlive \${monsterAlive} block \${block.x},\${block.y} chip \${g.chip.x}\`);
}
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BLOCK);
  at(l, 7, 5, T.CHIP);       // computer chip tile
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 4; i++) g.tick();
  check('J3 computer chips are block-acting walls', g.chip.x === 5 && g.terrain[5*32+7] === T.CHIP,
        \`chip \${g.chip.x} tile \${g.terrain[5*32+7]}\`);
}
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BLOCK);
  at(l, 7, 5, T.KEY_R);      // keys do NOT block blocks in MS
  const g = new Game(l); g.state = 'playing';
  g.input.pending = DIR_E;
  for (let i = 0; i < 4; i++) g.tick();
  const block = g.entities.find(e => e.kind === 'block');
  check('J4 blocks may sit on keys (MS)', g.chip.x === 6 && block.x === 7 && g.terrain[5*32+7] === T.KEY_R,
        \`chip \${g.chip.x} block \${block.x} tile \${g.terrain[5*32+7]}\`);
}
{
  const l = blank();
  at(l, 5, 5, 0x6e);
  at(l, 6, 5, T.BLOCK);      // block on a force floor (bottom layer)...
  l.bottom[5*32+6] = T.FORCE_E;
  at(l, 7, 5, T.WALL);       // ...pinned against a wall
  const g = new Game(l); g.state = 'playing';
  const block = g.entities.find(e => e.kind === 'block');
  check('J5a pinned block keeps sliding state', block.sliding === 'force', String(block.sliding));
  g.input.pending = DIR_E;   // chip rams the pinned block
  for (let i = 0; i < 2; i++) g.tick();
  check('J5b ram cancels the slide', block.sliding === null && block.x === 6,
        \`sliding \${block.sliding} block \${block.x}\`);
}

/* ---- report ---- */
let fails = 0;
for (const r of results) {
  if (!r.pass) fails++;
  console.log((r.pass ? 'PASS' : 'FAIL') + '  ' + r.name + (r.extra ? '   [' + r.extra + ']' : ''));
}
console.log(fails === 0 ? '\\nALL ' + results.length + ' TESTS PASSED' : '\\n' + fails + ' FAILURES');
if (fails) globalThis.process.exitCode = 1;
`;

const datBytes = readFileSync(root + 'original/CHIPS.DAT');
const ab = datBytes.buffer.slice(datBytes.byteOffset, datBytes.byteOffset + datBytes.byteLength);

const fn = new Function('BUF', 'globalThis', src + tests);
fn(ab, globalThis);
