/* Canvas renderer: camera, terrain atlas, entities, particles. */
'use strict';

const VIEW_TILES = 9;

class Renderer {
  constructor(canvas, tileSize = 64) {
    this.cv = canvas;
    this.ts = tileSize;
    this.atlas = buildAtlas(tileSize);
    const px = VIEW_TILES * tileSize;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = px * dpr;
    canvas.height = px * dpr;
    canvas.style.aspectRatio = '1';
    this.g = canvas.getContext('2d');
    this.g.scale(dpr, dpr);
    this.dpr = dpr;
    this.px = px;
    this.camX = 0; this.camY = 0;
    this.camInit = false;
    this.particles = [];
    this.shake = 0;
    this.game = null;
    this.lastNow = 0;
  }

  attach(game) {
    this.game = game;
    this.camInit = false;
    this.particles = [];
    this.shake = 0;
  }

  /* ----------------------------------------------------------- particles */

  burst(tx, ty, { n = 14, colors = ['#ffd470'], speed = 90, life = .6, size = 3.4, grav = 60, glow = true, ring = false } = {}) {
    const ts = this.ts;
    const cx = (tx + .5) * ts, cy = (ty + .5) * ts;
    for (let i = 0; i < n; i++) {
      const a = ring ? (i / n) * Math.PI * 2 : Math.random() * Math.PI * 2;
      const sp = ring ? speed : speed * (.35 + Math.random() * .85);
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (ring ? 0 : 20),
        life: life * (.6 + Math.random() * .7), age: 0,
        size: size * (.6 + Math.random() * .8),
        color: colors[(Math.random() * colors.length) | 0],
        grav, glow,
      });
    }
  }

  handleEvent(ev) {
    const KEYC = { B: '#37b6ff', R: '#ff5562', G: '#52ff7d', Y: '#ffd23e' };
    switch (ev.type) {
      case 'chip': this.burst(ev.x, ev.y, { colors: ['#ffd470', '#ffb02e', '#fff3c8'], n: 16 }); break;
      case 'key': this.burst(ev.x, ev.y, { colors: [KEYC[ev.data.color], '#ffffff'], n: 12 }); break;
      case 'boot': this.burst(ev.x, ev.y, { colors: ['#9fd8ff', '#ffffff'], n: 12 }); break;
      case 'door': this.burst(ev.x, ev.y, { colors: [KEYC[ev.data.color]], n: 10, speed: 60 }); break;
      case 'socket': this.burst(ev.x, ev.y, { colors: ['#caa24a', '#ffe9a8'], n: 18, speed: 80 }); break;
      case 'splash': this.burst(ev.x, ev.y, { colors: ['#2ea8d8', '#9fe2ff', '#0d4d74'], n: 18, speed: 110, grav: 220, size: 3 }); break;
      case 'boom': this.burst(ev.x, ev.y, { colors: ['#ff9b2e', '#ff4757', '#ffe27a'], n: 26, speed: 150, grav: 30 }); this.shake = .5; break;
      case 'sizzle': this.burst(ev.x, ev.y, { colors: ['#ff9b2e', '#3a3a3a'], n: 12 }); break;
      case 'death': this.burst(ev.x, ev.y, { colors: ['#ff4757', '#ffffff', '#ffb02e'], n: 30, speed: 140 }); this.shake = .6; break;
      case 'monsterDie': this.burst(ev.x, ev.y, { colors: ['#9fe88a', '#3a5a3a', '#dfffd0'], n: 14 }); break;
      case 'teleflash': this.burst(ev.x, ev.y, { colors: ['#2ee6ff', '#ff3df0'], n: 16, ring: true, speed: 100, grav: 0, life: .4 }); break;
      case 'dirt': this.burst(ev.x, ev.y, { colors: ['#8a5a33', '#5e3c20'], n: 8, speed: 45, size: 2.6, glow: false }); break;
      case 'reveal': this.burst(ev.x, ev.y, { colors: ['#5aaaff'], n: 10, speed: 55 }); break;
      case 'appear': this.burst(ev.x, ev.y, { colors: ['#8a9ac0'], n: 10, speed: 55, glow: false }); break;
      case 'popup': this.burst(ev.x, ev.y, { colors: ['#96aad2'], n: 6, speed: 35, glow: false }); break;
      case 'thief': this.burst(ev.x, ev.y, { colors: ['#ff4757', '#2a2f45'], n: 12, speed: 60 }); break;
      case 'clone': this.burst(ev.x, ev.y, { colors: ['#8cc8ff', '#ffffff'], n: 10, speed: 60 }); break;
      case 'win': {
        this.winAt = { x: ev.x, y: ev.y, t: 0 };
        this.burst(ev.x, ev.y, { colors: ['#7dff62', '#2ee6ff', '#ff3df0', '#ffd23e'], n: 40, speed: 160, grav: 90, life: 1.1 });
        break;
      }
    }
  }

  /* --------------------------------------------------------------- frame */

  frame(now) {
    const dt = Math.min(.05, (now - this.lastNow) / 1000 || .016);
    this.lastNow = now;
    const g = this.g, ts = this.ts, game = this.game;
    if (!game) return;

    // entity visual positions
    for (const e of game.entities) {
      if (e.dead && e.kind !== 'chip') continue;
      if (e.animDur > 0) {
        const p = Math.min(1, (now - e.animStart) / e.animDur);
        e.fx = e.fromX + (e.x - e.fromX) * p;
        e.fy = e.fromY + (e.y - e.fromY) * p;
        if (p >= 1) { e.animDur = 0; e.fx = e.x; e.fy = e.y; }
      } else { e.fx = e.x; e.fy = e.y; }
    }

    // camera follows chip
    const c = game.chip;
    const half = VIEW_TILES / 2;
    let txc = Math.max(half, Math.min(W - half, c.fx + .5));
    let tyc = Math.max(half, Math.min(H - half, c.fy + .5));
    if (!this.camInit) { this.camX = txc; this.camY = tyc; this.camInit = true; }
    const k = Math.min(1, dt * 9);
    this.camX += (txc - this.camX) * k;
    this.camY += (tyc - this.camY) * k;

    let offX = (this.camX - half) * ts;
    let offY = (this.camY - half) * ts;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 1.6);
      const s = this.shake * this.shake * 14;
      offX += (Math.random() - .5) * s;
      offY += (Math.random() - .5) * s;
    }

    g.fillStyle = '#070b14';
    g.fillRect(0, 0, this.px, this.px);

    const frame = (now / 110) | 0;
    const x0 = Math.floor(offX / ts), y0 = Math.floor(offY / ts);

    g.save();
    g.translate(-offX, -offY);

    // terrain
    for (let y = y0; y <= y0 + VIEW_TILES; y++) {
      if (y < 0 || y >= H) continue;
      for (let x = x0; x <= x0 + VIEW_TILES; x++) {
        if (x < 0 || x >= W) continue;
        const t = game.terrain[y * W + x];
        this.atlas.draw(g, spriteForTile(t, x, y), frame, x * ts, y * ts);
      }
    }

    // entities, painter's order by y; chip drawn last
    const visible = [];
    for (const e of game.entities) {
      if (e.dead) continue;
      if (e.fx < x0 - 1 || e.fx > x0 + VIEW_TILES + 1 || e.fy < y0 - 1 || e.fy > y0 + VIEW_TILES + 1) continue;
      visible.push(e);
    }
    visible.sort((a, b) => (a.fy - b.fy) || (a.kind === 'chip' ? 1 : 0) - (b.kind === 'chip' ? 1 : 0));
    const tSec = now / 1000;
    for (const e of visible) {
      if (e === c) continue;
      drawEntity(g, e, e.fx * ts, e.fy * ts, ts, tSec);
    }
    if (!c.dead) drawEntity(g, c, c.fx * ts, c.fy * ts, ts, tSec);

    // particles
    const parts = this.particles;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age >= p.life) { parts.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      g.globalAlpha = a;
      if (p.glow) { g.shadowColor = p.color; g.shadowBlur = 8; }
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, 7);
      g.fill();
      g.shadowBlur = 0;
      g.globalAlpha = 1;
    }

    // continuous confetti while on the win screen
    if (game.state === 'won' && this.winAt && Math.random() < .3) {
      this.burst(this.winAt.x, this.winAt.y, {
        colors: ['#7dff62', '#2ee6ff', '#ff3df0', '#ffd23e'],
        n: 3, speed: 130, grav: 100, life: 1,
      });
    }

    g.restore();

    // soft vignette
    const vg = g.createRadialGradient(this.px / 2, this.px / 2, this.px * .42, this.px / 2, this.px / 2, this.px * .74);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,4,10,.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, this.px, this.px);
  }
}

/* ------------------------------------------------------------- minimap */

const MINI_COLORS = (() => {
  const m = {};
  const set = (codes, hex) => { for (const c of codes) m[c] = hex; };
  set([T.FLOOR, T.HWALL, T.HWALL_APPEAR, T.TOGGLE_O, T.POPUP, T.TRAP], '#161e33');
  set([T.WALL, T.FAKEWALL, T.REALWALL, T.PANEL_N, T.PANEL_W, T.PANEL_S, T.PANEL_E, T.PANEL_SE], '#46577f');
  set([T.WATER], '#1779ad');
  set([T.FIRE], '#ff6b35');
  set([T.ICE, T.ICE_SE, T.ICE_SW, T.ICE_NW, T.ICE_NE], '#a8d8f0');
  set([T.FORCE_N, T.FORCE_W, T.FORCE_S, T.FORCE_E, T.FORCE_RND], '#8a2f96');
  set([T.EXIT], '#58ff8f');
  set([T.CHIP], '#ffb02e');
  set([T.DIRT], '#8a5a33');
  set([T.GRAVEL], '#6c7890');
  set([T.SOCKET], '#caa24a');
  set([T.TELEPORT], '#2ee6ff');
  set([T.BOMB], '#d83448');
  set([T.THIEF], '#2a2f45');
  set([T.HINT], '#1f7d96');
  set([T.TOGGLE_C], '#3f7d3f');
  set([T.BTN_GREEN], '#3ddc66');
  set([T.BTN_RED], '#ff4757');
  set([T.BTN_BROWN], '#b07840');
  set([T.BTN_BLUE], '#37b6ff');
  set([T.CLONER], '#6b5a20');
  set([T.DOOR_B], '#37b6ff'); set([T.KEY_B], '#37b6ff');
  set([T.DOOR_R], '#ff5562'); set([T.KEY_R], '#ff5562');
  set([T.DOOR_G], '#52ff7d'); set([T.KEY_G], '#52ff7d');
  set([T.DOOR_Y], '#ffd23e'); set([T.KEY_Y], '#ffd23e');
  set([T.FLIPPERS, T.FIREBOOTS, T.SKATES, T.SUCTION], '#9fd8ff');
  return m;
})();

class Minimap {
  constructor(canvas) {
    this.cv = canvas;
    this.scale = 8;
    canvas.width = canvas.height = 32 * this.scale;
    this.g = canvas.getContext('2d');
    this.tiny = document.createElement('canvas');
    this.tiny.width = this.tiny.height = 32;
    this.tg = this.tiny.getContext('2d');
    this.img = this.tg.createImageData(32, 32);
    this.rgb = {};
    for (const hex of new Set(Object.values(MINI_COLORS))) {
      const n = parseInt(hex.slice(1), 16);
      this.rgb[hex] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
  }

  frame(game, camX, camY, viewTiles, now) {
    // terrain at 1px/tile, scaled up with hard pixels
    const data = this.img.data;
    for (let i = 0; i < 1024; i++) {
      const hex = MINI_COLORS[game.terrain[i]] || '#161e33';
      const [r, gg, b] = this.rgb[hex] || [22, 30, 51];
      const o = i * 4;
      data[o] = r; data[o + 1] = gg; data[o + 2] = b; data[o + 3] = 255;
    }
    this.tg.putImageData(this.img, 0, 0);

    const g = this.g, s = this.scale, px = 32 * s;
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, px, px);
    g.drawImage(this.tiny, 0, 0, px, px);

    // entities as dots
    for (const e of game.entities) {
      if (e.dead || e === game.chip) continue;
      g.fillStyle = e.kind === 'block' ? '#97a6c4' : '#ff5562';
      g.fillRect(e.fx * s + 1.5, e.fy * s + 1.5, s - 3, s - 3);
    }
    // chip: bright pulsing dot
    const c = game.chip;
    const pulse = .65 + .35 * Math.sin(now / 250);
    g.fillStyle = '#ffffff';
    g.shadowColor = '#2ee6ff';
    g.shadowBlur = 6 * pulse;
    g.fillRect(c.fx * s + .5, c.fy * s + .5, s - 1, s - 1);
    g.shadowBlur = 0;

    // current camera viewport
    g.strokeStyle = 'rgba(46,230,255,.85)';
    g.lineWidth = 1.5;
    g.strokeRect((camX - viewTiles / 2) * s, (camY - viewTiles / 2) * s, viewTiles * s, viewTiles * s);
  }
}
