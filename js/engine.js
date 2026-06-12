/* Game engine — MS-ruleset Chip's Challenge logic on a 32x32 grid.
   Tick-based: 1 tick = 100ms. Walking = 2 ticks/tile, sliding = 1 tick/tile,
   most monsters = 2 ticks/tile, teeth & blobs = 4 ticks/tile. */
'use strict';

const TICK_MS = 100;
const W = 32, H = 32;
const idx = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;

const MONSTER_TICKS = { teeth: 4, blob: 4 };
const monsterSpeed = kind => MONSTER_TICKS[kind] || 2;

let NEXT_ID = 1;

// Edges blocked by thin-wall-like terrain: [N, W, S, E]
// Ice corners are named by the open curve direction; the two OTHER edges are walls.
//   ICE_SE: open S,E -> walls N,W      ICE_SW: open S,W -> walls N,E
//   ICE_NW: open N,W -> walls S,E      ICE_NE: open N,E -> walls S,W
const EDGE_WALLS = {
  [T.PANEL_N]: [1, 0, 0, 0],
  [T.PANEL_W]: [0, 1, 0, 0],
  [T.PANEL_S]: [0, 0, 1, 0],
  [T.PANEL_E]: [0, 0, 0, 1],
  [T.PANEL_SE]: [0, 0, 1, 1],
  [T.ICE_SE]: [1, 1, 0, 0],
  [T.ICE_SW]: [1, 0, 0, 1],
  [T.ICE_NW]: [0, 0, 1, 1],
  [T.ICE_NE]: [0, 1, 1, 0],
};

// Ice corner redirects: terrain -> {incomingDir: outgoingDir}.
// An object slides in through one open side and leaves through the other.
const ICE_TURNS = {
  [T.ICE_SE]: { [DIR_N]: DIR_E, [DIR_W]: DIR_S },
  [T.ICE_SW]: { [DIR_N]: DIR_W, [DIR_E]: DIR_S },
  [T.ICE_NW]: { [DIR_S]: DIR_W, [DIR_E]: DIR_N },
  [T.ICE_NE]: { [DIR_S]: DIR_E, [DIR_W]: DIR_N },
};

const FORCE_DIRS = { [T.FORCE_N]: DIR_N, [T.FORCE_W]: DIR_W, [T.FORCE_S]: DIR_S, [T.FORCE_E]: DIR_E };

const isIce = t => t === T.ICE || (t >= T.ICE_SE && t <= T.ICE_NE);
const isForce = t => t === T.FORCE_N || t === T.FORCE_W || t === T.FORCE_S || t === T.FORCE_E || t === T.FORCE_RND;
const isDoor = t => t >= T.DOOR_B && t <= T.DOOR_Y;
const isKey = t => t >= T.KEY_B && t <= T.KEY_Y;
const isBoot = t => t >= T.FLIPPERS && t <= T.SUCTION;

const DOOR_KEY = { [T.DOOR_B]: 'B', [T.DOOR_R]: 'R', [T.DOOR_G]: 'G', [T.DOOR_Y]: 'Y' };
const KEY_NAME = { [T.KEY_B]: 'B', [T.KEY_R]: 'R', [T.KEY_G]: 'G', [T.KEY_Y]: 'Y' };
const BOOT_NAME = { [T.FLIPPERS]: 'flippers', [T.FIREBOOTS]: 'fireboots', [T.SKATES]: 'skates', [T.SUCTION]: 'suction' };

class Game {
  constructor(level) {
    this.level = level;
    this.reset();
  }

  reset() {
    const lvl = this.level;
    this.state = 'ready'; // ready -> playing -> dead | won
    this.deathCause = null;
    this.tickNo = 0;
    this.timeLeft = lvl.time || 0;
    this.chipsLeft = lvl.chips;
    this.inv = { keys: { B: 0, R: 0, G: 0, Y: 0 }, boots: {} };
    this.events = [];
    this.input = { held: null, pending: null };

    this.terrain = new Uint8Array(1024);
    this.entities = [];
    this.occ = new Array(1024).fill(null);
    this.cloneTemplates = new Map();
    this.chip = null;

    const moverSet = new Set(lvl.monsters.map(m => idx(m.x, m.y)));

    for (let i = 0; i < 1024; i++) {
      const top = lvl.top[i], bottom = lvl.bottom[i];
      const e = entityForTile(top);
      if (e) {
        this.terrain[i] = entityForTile(bottom) ? T.FLOOR : bottom; // entity-under-entity: treat ground as floor
        const ent = {
          id: NEXT_ID++, kind: e.kind, dir: e.dir,
          x: i % W, y: (i / W) | 0,
          fromX: i % W, fromY: (i / W) | 0,
          fx: i % W, fy: (i / W) | 0,
          animStart: 0, animDur: 0, cool: 0,
          sliding: null, slideDir: 0, dead: false, moving: false,
          swimming: !!e.swimming,
          // loose clone blocks (no machine underneath) act as walls in MS
          template: this.terrain[i] === T.CLONER || !!e.cloneBlock,
          active: e.kind !== 'block' && (moverSet.size === 0 || moverSet.has(i)),
        };
        if (ent.kind === 'chip') { ent.active = true; this.chip = ent; }
        this.entities.push(ent);
        this.occ[i] = ent;
        if (this.terrain[i] === T.CLONER) this.cloneTemplates.set(i, { kind: ent.kind, dir: ent.dir });
      } else {
        this.terrain[i] = top;
      }
    }
    // safety: levels always have a chip start; if not, park one off-screen-ish
    if (!this.chip) {
      this.chip = { id: NEXT_ID++, kind: 'chip', dir: DIR_S, x: 0, y: 0, fromX: 0, fromY: 0, fx: 0, fy: 0, animStart: 0, animDur: 0, cool: 0, sliding: null, slideDir: 0, dead: false, moving: false, swimming: false, template: false, active: true };
      this.entities.push(this.chip);
      this.occ[0] = this.chip;
    }

    // acting monsters, in DAT monster-list order
    this.actors = [];
    for (const m of lvl.monsters) {
      const e = this.occ[idx(m.x, m.y)];
      if (e && e.kind !== 'chip' && e.kind !== 'block' && !e.template) this.actors.push(e);
    }
    if (lvl.monsters.length === 0) {
      for (const e of this.entities) if (e.kind !== 'chip' && e.kind !== 'block' && !e.template) this.actors.push(e);
    }

    this.teleports = [];
    for (let i = 0; i < 1024; i++) if (this.terrain[i] === T.TELEPORT) this.teleports.push(i);

    // initial slide state for entities born on slippery ground
    for (const e of this.entities) {
      if (e.template) continue;
      const t = this.terrain[idx(e.x, e.y)];
      this.applySlideState(e, t, e.dir);
      if (e.kind === 'chip' && t === T.WATER) e.swimming = true;
    }
  }

  emit(type, x, y, data) { this.events.push({ type, x, y, data }); }

  /* ------------------------------------------------------------ queries */

  edgeBlocked(i, dir) {
    const e = EDGE_WALLS[this.terrain[i]];
    return e ? !!e[dir] : false;
  }

  isTrapped(ent) {
    const i = idx(ent.x, ent.y);
    return this.terrain[i] === T.TRAP && !this.trapOpen(i);
  }

  trapOpen(trapIdx) {
    for (const l of this.level.traps) {
      if (idx(l.tx, l.ty) === trapIdx && this.occ[idx(l.bx, l.by)]) return true;
    }
    return false;
  }

  hasBoot(name) { return !!this.inv.boots[name]; }

  // True if a fake blue wall lies one step in `dir` from the entity (revealable this move).
  fakeAhead(ent, dir) {
    const fi = idx(ent.x, ent.y);
    if (this.edgeBlocked(fi, dir)) return false;
    const [dx, dy] = DIRS[dir];
    const nx = ent.x + dx, ny = ent.y + dy;
    if (!inBounds(nx, ny)) return false;
    const ni = idx(nx, ny);
    if (this.edgeBlocked(ni, dirBack(dir))) return false;
    return this.terrain[ni] === T.FAKEWALL && !this.occ[ni];
  }

  terrainPassable(ent, t, kind = ent.kind) {
    switch (t) {
      case T.WALL: case T.HWALL: case T.HWALL_APPEAR: case T.REALWALL:
      case T.FAKEWALL: case T.CLONER: case T.TOGGLE_C:
        return false;
    }
    if (kind === 'chip') {
      if (isDoor(t)) return this.inv.keys[DOOR_KEY[t]] > 0;
      if (t === T.SOCKET) return this.chipsLeft <= 0;
      return true;
    }
    if (kind === 'block') {
      switch (t) {
        // MS block-acting walls: thief, dirt, computer chip, locks, socket
        // (hints, boots and exits block blocks only in Lynx)
        case T.DIRT: case T.POPUP: case T.SOCKET: case T.THIEF: case T.CHIP:
          return false;
      }
      if (isDoor(t)) return false;
      return true;
    }
    // monsters
    switch (t) {
      case T.DIRT: case T.GRAVEL: case T.POPUP: case T.SOCKET: case T.THIEF:
      case T.EXIT: case T.CHIP: case T.HINT:
        return false;
      case T.FIRE:
        return ent.kind !== 'bug' && ent.kind !== 'walker';
    }
    if (isDoor(t)) return false;
    return true;
  }

  // Pure feasibility check; for chip pushing a block this recurses into the block.
  checkMove(ent, dir, fx = ent.x, fy = ent.y) {
    if (this.isTrapped(ent)) return false;
    const fi = idx(fx, fy);
    if (this.edgeBlocked(fi, dir)) return false;
    const [dx, dy] = DIRS[dir];
    const nx = fx + dx, ny = fy + dy;
    if (!inBounds(nx, ny)) return false;
    const ni = idx(nx, ny);
    if (this.edgeBlocked(ni, dirBack(dir))) return false;

    const occ = this.occ[ni];
    if (occ && occ !== ent) {
      if (ent.kind === 'chip' && occ.kind === 'block') {
        if (occ.template) return false;
        return this.checkMove(occ, dir) && this.terrainPassable(ent, this.terrain[ni]);
      }
      if (ent.kind === 'chip' && occ.kind !== 'block') return true;       // walk into monster: fatal but legal
      if (occ.kind === 'chip' && ent.kind !== 'chip') return true;        // monster/block onto chip
      return false; // monsters and blocks are block-acting walls in MS
    }
    return this.terrainPassable(ent, this.terrain[ni]);
  }

  /* ------------------------------------------------------------ actions */

  tryMove(ent, dir, speedTicks, depth = 0) {
    ent.dir = dir;
    const fi = idx(ent.x, ent.y);

    // chip bumping mystery walls reveals them
    if (ent.kind === 'chip' && !this.edgeBlocked(fi, dir)) {
      const [dx0, dy0] = DIRS[dir];
      const bx = ent.x + dx0, by = ent.y + dy0;
      if (inBounds(bx, by) && !this.edgeBlocked(idx(bx, by), dirBack(dir))) {
        const bt = this.terrain[idx(bx, by)];
        if (bt === T.FAKEWALL && !this.occ[idx(bx, by)]) {
          // a fake blue wall vanishes and Chip walks onto it in the same step (MS)
          this.terrain[idx(bx, by)] = T.FLOOR;
          this.emit('reveal', bx, by);
        } else if (bt === T.HWALL_APPEAR && !this.occ[idx(bx, by)]) {
          // a hidden wall turns solid when bumped and blocks the move
          this.terrain[idx(bx, by)] = T.WALL;
          this.emit('appear', bx, by);
          return false;
        }
      }
    }

    if (!this.checkMove(ent, dir)) {
      if (ent.kind === 'chip') {
        // the "ram": pushing a sliding block against a block-acting wall stops its slide
        const [bx, by] = DIRS[dir];
        const tx = ent.x + bx, ty = ent.y + by;
        if (inBounds(tx, ty)) {
          const occ2 = this.occ[idx(tx, ty)];
          if (occ2 && occ2.kind === 'block' && !occ2.template) occ2.sliding = null;
        }
        this.emit('bump', ent.x, ent.y);
      }
      return false;
    }

    const [dx, dy] = DIRS[dir];
    const nx = ent.x + dx, ny = ent.y + dy;
    const ni = idx(nx, ny);
    const occ = this.occ[ni];
    let chipWalksIntoMonster = false;

    if (occ && occ !== ent) {
      if (ent.kind === 'chip' && occ.kind === 'block') {
        this.emit('push', nx, ny);
        if (!this.tryMove(occ, dir, speedTicks, depth + 1)) return false;
      } else if (occ.kind === 'chip') {
        this.killChip(ent.kind === 'block' ? 'crushed' : 'monster');
      } else if (ent.kind === 'chip') {
        chipWalksIntoMonster = true;
      }
    }

    // commit: move the entity, animating from its current visual position
    if (this.occ[fi] === ent) this.occ[fi] = null;
    ent.fromX = ent.fx !== undefined ? ent.fx : ent.x;
    ent.fromY = ent.fy !== undefined ? ent.fy : ent.y;
    ent.x = nx; ent.y = ny;
    ent.animStart = performance.now();
    ent.animDur = speedTicks * TICK_MS;
    ent.moving = true;

    if (chipWalksIntoMonster) {
      // monster keeps the cell; chip dies on the same square
      this.killChip('monster');
      return true;
    }
    if (!ent.dead) this.occ[ni] = ent;

    this.leaveEffects(ent, fi);
    this.enterEffects(ent, ni, dir, depth);
    return true;
  }

  leaveEffects(ent, fi) {
    if (ent.kind === 'chip' && this.terrain[fi] === T.POPUP) {
      this.terrain[fi] = T.WALL;
      this.emit('popup', fi % W, (fi / W) | 0);
    }
  }

  applySlideState(ent, t, dir) {
    if (isIce(t) && !(ent.kind === 'chip' && this.hasBoot('skates'))) {
      const turn = ICE_TURNS[t];
      const nd = turn && turn[dir] !== undefined ? turn[dir] : dir;
      ent.sliding = 'ice'; ent.slideDir = nd; ent.dir = nd;
    } else if (isForce(t) && !(ent.kind === 'chip' && this.hasBoot('suction'))) {
      ent.sliding = 'force';
      ent.slideDir = t === T.FORCE_RND ? (Math.random() * 4) | 0 : FORCE_DIRS[t];
    } else {
      ent.sliding = null;
    }
  }

  enterEffects(ent, ni, dir, depth = 0) {
    const x = ni % W, y = (ni / W) | 0;
    let t = this.terrain[ni];

    // buttons fire for every entity
    if (t === T.BTN_GREEN) { this.toggleWalls(); this.emit('button', x, y); }
    else if (t === T.BTN_BLUE) { this.reverseTanks(); this.emit('button', x, y); }
    else if (t === T.BTN_RED) { this.cloneFrom(ni); this.emit('button', x, y); }
    else if (t === T.BTN_BROWN) { this.springTrap(ni); this.emit('button', x, y); }
    else if (t === T.TRAP && !this.trapOpen(ni)) this.emit('trap', x, y);

    if (t === T.TELEPORT && depth < 6) {
      this.emit('teleport', x, y);
      this.teleportEntity(ent, dir, ni, depth);
      return;
    }

    if (ent.kind === 'chip') {
      this.chipTerrainEffects(ent, ni, t, x, y);
    } else if (ent.kind === 'block') {
      if (t === T.WATER) {
        this.removeEntity(ent);
        this.terrain[ni] = T.DIRT;
        this.emit('splash', x, y);
        return;
      }
      if (t === T.BOMB) {
        this.removeEntity(ent);
        this.terrain[ni] = T.FLOOR;
        this.emit('boom', x, y);
        return;
      }
    } else { // monster
      if (t === T.WATER && ent.kind !== 'glider') { this.killMonster(ent); this.emit('splash', x, y); return; }
      if (t === T.FIRE && ent.kind !== 'fireball') { this.killMonster(ent); this.emit('sizzle', x, y); return; }
      if (t === T.BOMB) { this.killMonster(ent); this.terrain[ni] = T.FLOOR; this.emit('boom', x, y); return; }
    }

    this.applySlideState(ent, this.terrain[ni], dir);
    if (ent.kind === 'chip') ent.swimming = this.terrain[ni] === T.WATER && this.hasBoot('flippers');
  }

  chipTerrainEffects(ent, ni, t, x, y) {
    switch (t) {
      case T.CHIP:
        this.chipsLeft = Math.max(0, this.chipsLeft - 1);
        this.terrain[ni] = T.FLOOR;
        this.emit('chip', x, y);
        break;
      case T.DIRT:
        this.terrain[ni] = T.FLOOR;
        this.emit('dirt', x, y);
        break;
      case T.SOCKET:
        this.terrain[ni] = T.FLOOR;
        this.emit('socket', x, y);
        break;
      case T.WATER:
        if (!this.hasBoot('flippers')) return this.killChip('drown');
        break;
      case T.FIRE:
        if (!this.hasBoot('fireboots')) return this.killChip('burn');
        break;
      case T.BOMB:
        this.terrain[ni] = T.FLOOR;
        return this.killChip('bomb');
      case T.THIEF: {
        const had = Object.keys(this.inv.boots).length;
        this.inv.boots = {};
        this.emit('thief', x, y, { had });
        break;
      }
      case T.EXIT:
        this.state = 'won';
        this.emit('win', x, y);
        return;
    }
    if (isDoor(t)) {
      const k = DOOR_KEY[t];
      if (k !== 'G') this.inv.keys[k]--;
      this.terrain[ni] = T.FLOOR;
      this.emit('door', x, y, { color: k });
    } else if (isKey(t)) {
      this.inv.keys[KEY_NAME[t]]++;
      this.terrain[ni] = T.FLOOR;
      this.emit('key', x, y, { color: KEY_NAME[t] });
    } else if (isBoot(t)) {
      this.inv.boots[BOOT_NAME[t]] = true;
      this.terrain[ni] = T.FLOOR;
      this.emit('boot', x, y, { boot: BOOT_NAME[t] });
    }
  }

  teleportEntity(ent, dir, ni, depth) {
    const list = this.teleports;
    const i = list.indexOf(ni);
    const len = list.length;
    for (let k = 1; k <= len; k++) {
      const cand = list[(i - k % len + len) % len];
      if (cand !== ni && this.occ[cand]) continue;
      const cx = cand % W, cy = (cand / W) | 0;
      if (this.checkMove(ent, dir, cx, cy)) {
        if (this.occ[ni] === ent) this.occ[ni] = null;
        ent.x = cx; ent.y = cy;
        ent.fromX = cx; ent.fromY = cy;
        ent.fx = cx; ent.fy = cy;
        this.occ[cand] = ent;
        this.emit('teleflash', cx, cy);
        this.tryMove(ent, dir, 1, depth + 1);
        return;
      }
    }
    // nowhere to go — sit on the teleport, retrying each tick
    ent.sliding = 'tele';
    ent.slideDir = dir;
  }

  toggleWalls() {
    for (let i = 0; i < 1024; i++) {
      if (this.terrain[i] === T.TOGGLE_C) this.terrain[i] = T.TOGGLE_O;
      else if (this.terrain[i] === T.TOGGLE_O) this.terrain[i] = T.TOGGLE_C;
    }
    this.emit('toggle', -1, -1);
  }

  reverseTanks() {
    for (const e of this.entities) {
      if (e.kind === 'tank' && !e.dead && !e.template) {
        e.dir = dirBack(e.dir);
        if (e.sliding === 'ice') e.slideDir = dirBack(e.slideDir);
      }
    }
  }

  springTrap(buttonIdx) {
    for (const l of this.level.traps) {
      if (idx(l.bx, l.by) !== buttonIdx) continue;
      const ti = idx(l.tx, l.ty);
      const ent = this.occ[ti];
      if (ent && this.terrain[ti] === T.TRAP) {
        const speed = ent.sliding ? 1 : (ent.kind === 'chip' ? 2 : monsterSpeed(ent.kind));
        this.tryMove(ent, ent.dir, speed);
      }
    }
  }

  cloneFrom(buttonIdx) {
    for (const l of this.level.clones) {
      if (idx(l.bx, l.by) !== buttonIdx) continue;
      const mi = idx(l.mx, l.my);
      const tmpl = this.cloneTemplates.get(mi);
      if (!tmpl) continue;
      if (this.entities.filter(e => !e.dead).length > 380) continue;
      const probe = {
        id: 0, kind: tmpl.kind, dir: tmpl.dir, x: l.mx, y: l.my,
        sliding: null, slideDir: 0, dead: false, template: false, swimming: false,
      };
      if (!this.checkMove(probe, tmpl.dir)) continue;
      const ent = {
        id: NEXT_ID++, kind: tmpl.kind, dir: tmpl.dir,
        x: l.mx, y: l.my, fromX: l.mx, fromY: l.my,
        fx: l.mx, fy: l.my,
        animStart: 0, animDur: 0, cool: 0,
        sliding: null, slideDir: 0, dead: false, moving: true,
        swimming: false, template: false, active: true,
      };
      this.entities.push(ent);
      if (ent.kind !== 'block') this.actors.push(ent);
      this.tryMove(ent, tmpl.dir, ent.kind === 'block' ? 2 : monsterSpeed(ent.kind));
      this.emit('clone', l.mx, l.my);
    }
  }

  killChip(cause) {
    if (this.state !== 'playing' && this.state !== 'ready') return;
    this.state = 'dead';
    this.deathCause = cause;
    this.chip.dead = true;
    this.emit('death', this.chip.x, this.chip.y, { cause });
  }

  killMonster(m) {
    m.dead = true;
    const i = idx(m.x, m.y);
    if (this.occ[i] === m) this.occ[i] = null;
    this.emit('monsterDie', m.x, m.y, { kind: m.kind });
  }

  removeEntity(e) {
    e.dead = true;
    const i = idx(e.x, e.y);
    if (this.occ[i] === e) this.occ[i] = null;
  }

  /* --------------------------------------------------------------- tick */

  rest(ent, speedTicks) { ent.cool = Math.max(0, speedTicks - 1); }

  tick() {
    if (this.state !== 'playing') return;
    this.tickNo++;

    this.actChip();
    if (this.state !== 'playing') return;

    for (const m of this.actors) {
      if (m.dead || m.template || !m.active) continue;
      if (m.cool > 0) { m.cool--; continue; }
      m.moving = false;
      if (this.isTrapped(m)) { this.rest(m, 1); continue; }
      if (m.sliding) { this.slideStep(m); continue; }
      this.monsterAct(m);
      if (this.state !== 'playing') return;
    }

    for (const e of this.entities) {
      if (e.kind !== 'block' || e.dead || e.template || !e.sliding) continue;
      if (e.cool > 0) { e.cool--; continue; }
      if (this.isTrapped(e)) { this.rest(e, 1); continue; }
      this.slideStep(e);
      if (this.state !== 'playing') return;
    }

    if (this.level.time > 0 && this.tickNo % 10 === 0) {
      this.timeLeft--;
      if (this.timeLeft <= 5 && this.timeLeft > 0) this.emit('tictoc', -1, -1);
      if (this.timeLeft <= 0) this.killChip('time');
    }
  }

  actChip() {
    const c = this.chip;
    if (c.cool > 0) { c.cool--; return; }
    c.moving = false;
    if (this.isTrapped(c)) return;
    if (c.sliding) { this.chipSlideStep(); return; }

    const d = this.input.pending !== null ? this.input.pending : this.input.held;
    this.input.pending = null;
    if (d === null || d === undefined) return;
    if (this.tryMove(c, d, 2)) {
      this.rest(c, c.sliding ? 1 : 2);
    }
  }

  chipSlideStep() {
    const c = this.chip;
    const d = c.slideDir;
    // force floors allow perpendicular override — including bumping a fake wall,
    // which checkMove treats as solid, so probe for one explicitly.
    if (c.sliding === 'force') {
      const want = this.input.pending !== null ? this.input.pending : this.input.held;
      if (want !== null && want !== undefined && want !== dirBack(d) && want !== d) {
        if (this.checkMove(c, want) || this.fakeAhead(c, want)) {
          this.input.pending = null;
          this.tryMove(c, want, 2);
          this.rest(c, c.sliding ? 1 : 2);
          return;
        }
      }
    }
    if (c.sliding === 'tele') {
      const want = this.input.held !== null ? this.input.held : d;
      c.slideDir = want;
      const ti = idx(c.x, c.y);
      c.sliding = null;
      this.teleportEntity(c, want, ti, 0);
      this.rest(c, 1);
      return;
    }
    if (this.tryMove(c, d, 1)) {
      this.rest(c, 1);
      return;
    }
    if (c.sliding === 'ice') {
      const nd = dirBack(d);
      c.slideDir = nd; c.dir = nd;
      const t = this.terrain[idx(c.x, c.y)];
      const turn = ICE_TURNS[t];
      if (turn) { // bounce inside a corner re-applies the curve
        const td = turn[nd];
        if (td !== undefined) { c.slideDir = td; c.dir = td; }
      }
      this.tryMove(c, c.slideDir, 1);
    }
    this.rest(c, 1);
  }

  slideStep(ent) {
    const d = ent.slideDir;
    if (ent.sliding === 'tele') {
      const ti = idx(ent.x, ent.y);
      ent.sliding = null;
      this.teleportEntity(ent, d, ti, 0);
      this.rest(ent, 1);
      return;
    }
    if (this.tryMove(ent, d, 1)) {
      this.rest(ent, ent.sliding ? 1 : (ent.kind === 'block' ? 1 : monsterSpeed(ent.kind)));
      return;
    }
    if (ent.sliding === 'ice') {
      const nd = dirBack(d);
      ent.slideDir = nd; ent.dir = nd;
      const turn = ICE_TURNS[this.terrain[idx(ent.x, ent.y)]];
      if (turn && turn[nd] !== undefined) { ent.slideDir = turn[nd]; ent.dir = turn[nd]; }
      this.tryMove(ent, ent.slideDir, 1);
    }
    this.rest(ent, 1);
  }

  monsterAct(m) {
    const dirs = this.monsterDirs(m);
    for (const d of dirs) {
      if (d === null || d === undefined) continue;
      if (this.checkMove(m, d)) {
        this.tryMove(m, d, monsterSpeed(m.kind));
        this.rest(m, m.sliding ? 1 : monsterSpeed(m.kind));
        return;
      }
    }
    if (dirs.length) m.dir = dirs[0];
    this.rest(m, monsterSpeed(m.kind));
  }

  monsterDirs(m) {
    const F = m.dir, L = dirLeft(m.dir), R = dirRight(m.dir), B = dirBack(m.dir);
    switch (m.kind) {
      case 'bug': return [L, F, R, B];
      case 'paramecium': return [R, F, L, B];
      case 'fireball': return [F, R, L, B];
      case 'glider': return [F, L, R, B];
      case 'ball': return [F, B];
      case 'tank': return [F];
      case 'walker': {
        if (this.checkMove(m, F)) return [F];
        return [[L, R, B][(Math.random() * 3) | 0]];
      }
      case 'blob': return [(Math.random() * 4) | 0];
      case 'teeth': {
        const dx = this.chip.x - m.x, dy = this.chip.y - m.y;
        const hor = dx > 0 ? DIR_E : dx < 0 ? DIR_W : null;
        const ver = dy > 0 ? DIR_S : dy < 0 ? DIR_N : null;
        const order = Math.abs(dx) > Math.abs(dy) ? [hor, ver] : [ver, hor];
        return order.filter(d => d !== null);
      }
    }
    return [F];
  }
}
