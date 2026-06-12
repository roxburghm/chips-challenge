/* App shell: screens, HUD, input, persistence, game loop. */
'use strict';

(function () {
  const $ = sel => document.querySelector(sel);
  const SAVE_KEY = 'chips-challenge-progress-v1';

  let levels = [];
  let game = null;
  let renderer = null;
  let levelIndex = 0;     // 0-based
  let paused = false;
  let acc = 0, lastT = 0;
  const sfx = new Sfx();

  const progress = loadProgress();

  function loadProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(SAVE_KEY)) || {};
      return { maxOpen: p.maxOpen || 1, completed: p.completed || {}, last: p.last || 1, muted: !!p.muted };
    } catch { return { maxOpen: 1, completed: {}, last: 1, muted: false }; }
  }
  function saveProgress() {
    progress.muted = sfx.muted;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(progress)); } catch { }
  }

  /* ------------------------------------------------------------- input */

  const KEY_DIRS = {
    ArrowUp: DIR_N, ArrowDown: DIR_S, ArrowLeft: DIR_W, ArrowRight: DIR_E,
    KeyW: DIR_N, KeyS: DIR_S, KeyA: DIR_W, KeyD: DIR_E,
  };
  let keyStack = [];

  function pressDir(d) {
    keyStack = [d, ...keyStack.filter(k => k !== d)];
    if (!game) return;
    if (game.state === 'ready') {
      game.state = 'playing';
      hideOverlay();
      sfx.play('start');
    }
    game.input.pending = d;
    game.input.held = keyStack[0];
  }
  function releaseDir(d) {
    keyStack = keyStack.filter(k => k !== d);
    if (game) game.input.held = keyStack.length ? keyStack[0] : null;
  }

  document.addEventListener('keydown', e => {
    if ($('#titleScreen').classList.contains('open')) {
      if (e.code === 'Enter' && document.activeElement !== $('#passInput')) startLevel(progress.last - 1);
      return;
    }
    const d = KEY_DIRS[e.code];
    if (d !== undefined && !e.repeat) { e.preventDefault(); pressDir(d); return; }
    if (d !== undefined) { e.preventDefault(); return; }
    switch (e.code) {
      case 'KeyR': restart(); break;
      case 'KeyP': case 'Escape': togglePause(); break;
      case 'KeyM': toggleMute(); break;
      case 'BracketLeft': if (levelIndex > 0) startLevel(levelIndex - 1); break;
      case 'BracketRight': if (levelIndex + 2 <= progress.maxOpen && levelIndex + 1 < levels.length) startLevel(levelIndex + 1); break;
      case 'Enter': case 'Space':
        if (game && game.state === 'dead') restart();
        else if (game && game.state === 'won') nextLevel();
        else if (paused) togglePause();
        break;
      case 'KeyL': openTitle(); break;
    }
  });
  document.addEventListener('keyup', e => {
    const d = KEY_DIRS[e.code];
    if (d !== undefined) releaseDir(d);
  });

  // touch D-pad
  for (const btn of document.querySelectorAll('#dpad button')) {
    const d = { up: DIR_N, down: DIR_S, left: DIR_W, right: DIR_E }[btn.dataset.dir];
    btn.addEventListener('pointerdown', e => { e.preventDefault(); pressDir(d); });
    btn.addEventListener('pointerup', () => releaseDir(d));
    btn.addEventListener('pointercancel', () => releaseDir(d));
    btn.addEventListener('pointerleave', () => releaseDir(d));
  }

  /* ------------------------------------------------------------ levels */

  function startLevel(i) {
    levelIndex = Math.max(0, Math.min(levels.length - 1, i));
    game = new Game(levels[levelIndex]);
    renderer.attach(game);
    paused = false;
    acc = 0;
    keyStack = [];
    progress.last = levelIndex + 1;
    progress.maxOpen = Math.max(progress.maxOpen, levelIndex + 1);
    saveProgress();
    closeTitle();
    showOverlay('ready');
    updateHudStatic();
    window.__game = game;
  }

  function restart() { if (game) { startLevel(levelIndex); } }

  function nextLevel() {
    if (levelIndex + 1 < levels.length) startLevel(levelIndex + 1);
    else showOverlay('end');
  }

  function togglePause() {
    if (!game || game.state !== 'playing') return;
    paused = !paused;
    paused ? showOverlay('pause') : hideOverlay();
  }

  function toggleMute() {
    sfx.muted = !sfx.muted;
    $('#muteBtn').textContent = sfx.muted ? 'UNMUTE' : 'MUTE';
    saveProgress();
  }

  /* ----------------------------------------------------------- overlays */

  const DEATH_LINES = {
    monster: 'A creature got Chip. Study the patrol patterns!',
    crushed: 'Squashed by a runaway block.',
    drown: 'Blub blub… no flippers, no swimming.',
    burn: 'Toasted. Fire boots next time.',
    bomb: 'KABOOM. Mind where you step.',
    time: 'Out of time!',
  };

  function showOverlay(kind) {
    const ov = $('#overlay');
    ov.className = 'overlay ' + kind;
    const lvl = levels[levelIndex];
    let html = '';
    if (kind === 'ready') {
      html = `<div class="ov-kicker">LEVEL ${lvl.number}</div>
              <h2>${esc(lvl.title)}</h2>
              <p class="ov-sub">Press an arrow key to begin</p>`;
    } else if (kind === 'pause') {
      html = `<h2>PAUSED</h2><p class="ov-sub">P or ESC to resume</p>`;
    } else if (kind === 'dead') {
      html = `<div class="ov-kicker fail">CHIP DOWN</div>
              <h2>${DEATH_LINES[game.deathCause] || 'That went badly.'}</h2>
              <p class="ov-sub">ENTER to retry &nbsp;·&nbsp; L for level list</p>`;
    } else if (kind === 'won') {
      const used = Math.ceil(game.tickNo / 10);
      const bonus = game.level.time ? game.timeLeft : 0;
      html = `<div class="ov-kicker win">SECTOR CLEARED</div>
              <h2>Level ${lvl.number} complete!</h2>
              <p class="ov-stats">${game.level.time ? `Time used ${used}s · ${bonus}s to spare` : `Time used ${used}s`}</p>
              <p class="ov-sub">ENTER for the next level</p>`;
    } else if (kind === 'end') {
      html = `<div class="ov-kicker win">ALL 149 LEVELS</div>
              <h2>You beat the whole set. Legend.</h2>
              <p class="ov-sub">L opens the level list</p>`;
    }
    ov.innerHTML = html;
    ov.classList.remove('hidden');
  }
  function hideOverlay() { $('#overlay').classList.add('hidden'); }

  function esc(s) { return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  /* -------------------------------------------------------------- title */

  function openTitle() {
    buildLevelGrid();
    $('#titleScreen').classList.add('open');
  }
  function closeTitle() { $('#titleScreen').classList.remove('open'); }

  function buildLevelGrid() {
    const grid = $('#levelGrid');
    grid.innerHTML = '';
    levels.forEach((lvl, i) => {
      const b = document.createElement('button');
      const open = i + 1 <= progress.maxOpen;
      const done = progress.completed[lvl.number];
      b.className = 'lvl' + (open ? '' : ' locked') + (done ? ' done' : '');
      b.textContent = lvl.number;
      b.title = open ? `${lvl.number}. ${lvl.title}${done ? ` — best ${done.bonus}s spare` : ''}` : 'Locked — find the password';
      if (open) b.addEventListener('click', () => startLevel(i));
      grid.appendChild(b);
    });
  }

  $('#passForm').addEventListener('submit', e => {
    e.preventDefault();
    const v = $('#passInput').value.trim().toUpperCase();
    if (!v) return;
    const i = levels.findIndex(l => l.password === v);
    const msg = $('#passMsg');
    if (i >= 0) {
      progress.maxOpen = Math.max(progress.maxOpen, i + 1);
      saveProgress();
      msg.textContent = `ACCESS GRANTED → LEVEL ${i + 1}`;
      msg.className = 'pass-msg ok';
      setTimeout(() => startLevel(i), 450);
    } else {
      msg.textContent = 'ACCESS DENIED';
      msg.className = 'pass-msg bad';
    }
  });

  $('#playBtn').addEventListener('click', () => startLevel(progress.last - 1));
  $('#levelsBtn').addEventListener('click', openTitle);
  $('#muteBtn').addEventListener('click', toggleMute);
  $('#restartBtn').addEventListener('click', restart);

  /* ---------------------------------------------------------------- HUD */

  function updateHudStatic() {
    const lvl = levels[levelIndex];
    $('#hudLevelNo').textContent = lvl.number;
    $('#hudTitle').textContent = lvl.title;
    $('#hudPass').textContent = lvl.password;
  }

  let lastHud = '';
  function updateHud() {
    if (!game) return;
    const t = game.level.time ? String(game.timeLeft) : '———';
    const sig = `${game.chipsLeft}|${t}|${JSON.stringify(game.inv)}|${game.state}`;
    const timeEl = $('#hudTime');
    if (game.level.time && game.timeLeft <= 15 && game.state === 'playing') timeEl.classList.add('low');
    else timeEl.classList.remove('low');
    if (sig === lastHud) return;
    lastHud = sig;
    $('#hudChips').textContent = game.chipsLeft;
    timeEl.textContent = t;
    for (const k of ['B', 'R', 'G', 'Y']) {
      const slot = $('#key' + k);
      const n = game.inv.keys[k];
      slot.classList.toggle('have', n > 0);
      slot.querySelector('.count').textContent = n > 1 ? n : '';
    }
    for (const bt of ['flippers', 'fireboots', 'skates', 'suction']) {
      $('#boot-' + bt).classList.toggle('have', !!game.inv.boots[bt]);
    }
  }

  function buildInventoryIcons() {
    const items = [
      ['#keyB', 'keyB'], ['#keyR', 'keyR'], ['#keyG', 'keyG'], ['#keyY', 'keyY'],
      ['#boot-flippers', 'flippers'], ['#boot-fireboots', 'fireboots'],
      ['#boot-skates', 'skates'], ['#boot-suction', 'suction'],
    ];
    for (const [sel, sprite] of items) {
      const el = $(sel);
      const cv = document.createElement('canvas');
      cv.width = cv.height = renderer.ts;
      cv.style.width = cv.style.height = '100%';
      renderer.atlas.draw(cv.getContext('2d'), sprite, 0, 0, 0);
      el.prepend(cv);
    }
  }

  /* ---------------------------------------------------------- main loop */

  const SFX_FOR = {
    chip: 'chip', key: 'key', boot: 'boot', door: 'door', socket: 'socket',
    bump: 'bump', push: 'push', splash: 'splash', sizzle: 'sizzle', boom: 'boom',
    death: 'death', teleport: 'teleport', button: 'button', toggle: 'toggle',
    thief: 'thief', trap: 'trap', clone: 'clone', win: 'win', tictoc: 'tictoc',
    dirt: 'push', reveal: 'toggle', appear: 'bump', monsterDie: 'splash', popup: 'button',
  };

  function drainEvents() {
    if (!game) return;
    for (const ev of game.events) {
      const s = SFX_FOR[ev.type];
      if (s) sfx.play(s);
      if (ev.x >= 0) renderer.handleEvent(ev);
      if (ev.type === 'death') setTimeout(() => game.state === 'dead' && showOverlay('dead'), 650);
      if (ev.type === 'win') {
        const lvl = levels[levelIndex];
        const best = progress.completed[lvl.number];
        const bonus = game.level.time ? game.timeLeft : 0;
        if (!best || bonus > best.bonus) progress.completed[lvl.number] = { bonus };
        progress.maxOpen = Math.max(progress.maxOpen, Math.min(levels.length, levelIndex + 2));
        saveProgress();
        setTimeout(() => game.state === 'won' && showOverlay('won'), 750);
      }
    }
    game.events.length = 0;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(250, now - (lastT || now));
    lastT = now;
    if (game && game.state === 'playing' && !paused) {
      acc += dt;
      while (acc >= TICK_MS) {
        game.tick();
        acc -= TICK_MS;
        if (game.state !== 'playing') { acc = 0; break; }
      }
    } else acc = 0;
    drainEvents();
    if (game && !paused) renderer.frame(now);

    // hint bar
    const hb = $('#hintBar');
    if (game && game.terrain[game.chip.y * 32 + game.chip.x] === T.HINT && game.level.hint) {
      hb.textContent = game.level.hint;
      hb.classList.remove('hidden');
    } else hb.classList.add('hidden');

    updateHud();
  }

  /* ---------------------------------------------------------------- boot */

  async function boot() {
    let buf = null;
    if (typeof CHIPS_DAT_BASE64 !== 'undefined') {
      buf = base64ToArrayBuffer(CHIPS_DAT_BASE64);
    } else {
      const res = await fetch('original/CHIPS.DAT');
      buf = await res.arrayBuffer();
    }
    levels = parseDat(buf);
    renderer = new Renderer($('#board'), 64);
    buildInventoryIcons();
    if (sfx.muted = progress.muted) $('#muteBtn').textContent = 'UNMUTE';
    $('#lvlCount').textContent = levels.length;
    openTitle();
    window.__cc = { startLevel, get game() { return game; }, renderer, levels, progress };
    requestAnimationFrame(loop);
  }

  boot().catch(err => {
    document.body.innerHTML = `<pre style="color:#ff4757;padding:2rem">Failed to start: ${err.message}\n${err.stack}</pre>`;
  });
})();
