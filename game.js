const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const ui = {
  p1Health: document.getElementById("p1-health"),
  p2Health: document.getElementById("p2-health"),
  p1Energy: document.getElementById("p1-energy"),
  p2Energy: document.getElementById("p2-energy"),
  p1HpText: document.getElementById("p1-hp-text"),
  p2HpText: document.getElementById("p2-hp-text"),
  timer: document.getElementById("timer"),
  state: document.getElementById("round-state"),
  banner: document.getElementById("banner"),
  start: document.getElementById("start-btn"),
  pause: document.getElementById("pause-btn"),
  reset: document.getElementById("reset-btn"),
};

const W = canvas.width;
const H = canvas.height;
const FLOOR = 424;
const GRAVITY = 1900;
const ROUND_TIME = 60;
const MAX_HP = 100;
const MAX_ENERGY = 100;
const SPECIAL_COST = 35;

const keys = new Set();
const pressed = new Set();

const controls = {
  p1: {
    left: "KeyA",
    right: "KeyD",
    jump: "KeyW",
    down: "KeyS",
    block: "KeyE",
    light: "KeyF",
    heavy: "KeyG",
    special: "KeyH",
  },
  p2: {
    left: "ArrowLeft",
    right: "ArrowRight",
    jump: "ArrowUp",
    down: "ArrowDown",
    block: "KeyI",
    light: "KeyJ",
    heavy: "KeyK",
    special: "KeyL",
  },
};

const attacks = {
  light: {
    duration: 0.24,
    activeStart: 0.07,
    activeEnd: 0.17,
    reach: 62,
    height: 42,
    yOffset: 66,
    damage: 7,
    push: 170,
    cooldown: 0.16,
    energyGain: 8,
  },
  heavy: {
    duration: 0.42,
    activeStart: 0.15,
    activeEnd: 0.29,
    reach: 84,
    height: 48,
    yOffset: 70,
    damage: 14,
    push: 250,
    cooldown: 0.25,
    energyGain: 13,
  },
};

let fighters;
let projectiles;
let sparks;
let game;
let lastTime = 0;

function makeFighter(id, x, palette, controlsMap) {
  return {
    id,
    x,
    y: FLOOR,
    vx: 0,
    vy: 0,
    width: 58,
    height: 120,
    crouchHeight: 78,
    facing: id === "p1" ? 1 : -1,
    hp: MAX_HP,
    energy: 45,
    controls: controlsMap,
    palette,
    onGround: true,
    crouching: false,
    blocking: false,
    attack: null,
    cooldown: 0,
    hitstun: 0,
    invuln: 0,
    flash: 0,
    wins: 0,
  };
}

function resetMatch() {
  fighters = [
    makeFighter("p1", 260, {
      suit: "#2cd7c9",
      suitDark: "#177d82",
      trim: "#fff2a6",
      skin: "#f0b37e",
      glove: "#ff5b68",
    }, controls.p1),
    makeFighter("p2", 700, {
      suit: "#d77cff",
      suitDark: "#773fa8",
      trim: "#9cf0ff",
      skin: "#f0a46f",
      glove: "#ffd166",
    }, controls.p2),
  ];
  projectiles = [];
  sparks = [];
  game = {
    running: false,
    paused: false,
    over: false,
    time: ROUND_TIME,
    message: "准备",
    banner: "点击开始对战",
    shake: 0,
  };
  updateHud();
  showBanner("霓虹擂台", "点击开始对战");
}

function startMatch() {
  resetMatch();
  game.running = true;
  game.message = "开战";
  hideBanner();
  lastTime = performance.now();
  updateHud();
}

function restartMatch() {
  startMatch();
}

function togglePause() {
  if (!game.running || game.over) return;
  game.paused = !game.paused;
  game.message = game.paused ? "暂停中" : "开战";
  if (game.paused) {
    showBanner("暂停中", "点击暂停继续对战");
  } else {
    hideBanner();
    lastTime = performance.now();
  }
  updateHud();
}

function showBanner(title, subtitle) {
  ui.banner.innerHTML = `<strong>${title}</strong><span>${subtitle}</span>`;
  ui.banner.classList.remove("is-hidden");
}

function hideBanner() {
  ui.banner.classList.add("is-hidden");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function bodyRect(f) {
  const height = f.crouching ? f.crouchHeight : f.height;
  return {
    x: f.x - f.width / 2,
    y: f.y - height,
    w: f.width,
    h: height,
  };
}

function isFacing(f, other) {
  return (other.x >= f.x && f.facing === 1) || (other.x < f.x && f.facing === -1);
}

function updateControls() {
  ui.start.textContent = game.over ? "再战一局" : game.running ? "重新开局" : "开始对战";
  ui.pause.textContent = game.paused ? "继续" : "暂停";
  ui.pause.disabled = !game.running || game.over;
  ui.reset.disabled = !game.running && !game.over;
}

function updateHud() {
  const p1 = fighters[0];
  const p2 = fighters[1];
  ui.p1Health.style.width = `${clamp(p1.hp, 0, MAX_HP)}%`;
  ui.p2Health.style.width = `${clamp(p2.hp, 0, MAX_HP)}%`;
  ui.p1Energy.style.width = `${clamp(p1.energy, 0, MAX_ENERGY)}%`;
  ui.p2Energy.style.width = `${clamp(p2.energy, 0, MAX_ENERGY)}%`;
  ui.p1HpText.textContent = Math.ceil(clamp(p1.hp, 0, MAX_HP));
  ui.p2HpText.textContent = Math.ceil(clamp(p2.hp, 0, MAX_HP));
  ui.timer.textContent = Math.ceil(game.time);
  ui.state.textContent = game.message;
  updateControls();
}

function down(code) {
  return keys.has(code);
}

function wasPressed(code) {
  return pressed.has(code);
}

function beginAttack(f, type) {
  const data = attacks[type];
  f.attack = {
    type,
    elapsed: 0,
    hitDone: false,
    ...data,
  };
  f.cooldown = data.duration + data.cooldown;
  f.blocking = false;
}

function launchSpecial(f) {
  f.energy -= SPECIAL_COST;
  f.attack = {
    type: "special",
    elapsed: 0,
    duration: 0.34,
    activeStart: 0.1,
    activeEnd: 0.18,
    hitDone: true,
  };
  f.cooldown = 0.55;
  projectiles.push({
    owner: f.id,
    x: f.x + f.facing * 48,
    y: f.y - 82,
    vx: f.facing * 420,
    r: 18,
    damage: 12,
    push: 260,
    life: 0.95,
    color: f.palette.trim,
  });
}

function updateFighter(f, other, dt) {
  f.facing = other.x >= f.x ? 1 : -1;
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.flash = Math.max(0, f.flash - dt);

  if (f.attack) {
    f.attack.elapsed += dt;
    if (f.attack.elapsed >= f.attack.duration) {
      f.attack = null;
    }
  }

  const input = f.controls;
  const locked = f.hitstun > 0 || Boolean(f.attack);
  f.crouching = f.onGround && down(input.down) && !locked;
  f.blocking = down(input.block) && !locked && isFacing(f, other);

  let move = 0;
  if (!locked && !f.blocking) {
    if (down(input.left)) move -= 1;
    if (down(input.right)) move += 1;
  }

  if (f.hitstun > 0) {
    f.vx *= Math.pow(0.08, dt);
  } else {
    const speed = f.crouching ? 110 : 260;
    f.vx = move * speed;
  }

  if (f.onGround && !locked && !f.blocking && wasPressed(input.jump)) {
    f.vy = -760;
    f.onGround = false;
    f.crouching = false;
  }

  if (!locked && f.cooldown <= 0) {
    if (wasPressed(input.light)) beginAttack(f, "light");
    if (wasPressed(input.heavy)) beginAttack(f, "heavy");
    if (wasPressed(input.special) && f.energy >= SPECIAL_COST) launchSpecial(f);
  }

  f.vy += GRAVITY * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;

  if (f.y >= FLOOR) {
    f.y = FLOOR;
    f.vy = 0;
    f.onGround = true;
  }

  f.x = clamp(f.x, 48, W - 48);
}

function meleeBox(f) {
  if (!f.attack || !attacks[f.attack.type]) return null;
  const a = f.attack;
  if (a.elapsed < a.activeStart || a.elapsed > a.activeEnd) return null;
  const x = f.facing === 1 ? f.x + 22 : f.x - 22 - a.reach;
  return {
    x,
    y: f.y - a.yOffset,
    w: a.reach,
    h: a.height,
  };
}

function applyHit(attacker, defender, damage, push, kind) {
  if (defender.invuln > 0 || game.over) return false;
  const blocked = defender.blocking && isFacing(defender, attacker);
  const finalDamage = blocked ? Math.ceil(damage * 0.25) : damage;
  defender.hp = clamp(defender.hp - finalDamage, 0, MAX_HP);
  defender.invuln = blocked ? 0.14 : 0.22;
  defender.hitstun = blocked ? 0.1 : 0.28;
  defender.flash = blocked ? 0.08 : 0.16;
  defender.vx = attacker.facing * (blocked ? push * 0.45 : push);
  attacker.energy = clamp(attacker.energy + (blocked ? 4 : 9), 0, MAX_ENERGY);
  game.shake = blocked ? Math.max(game.shake, 4) : Math.max(game.shake, kind === "special" ? 12 : 7);
  addSpark(defender.x - attacker.facing * 24, defender.y - 72, blocked ? "#9cf0ff" : "#ffd166", blocked ? "block" : "hit");
  return true;
}

function resolveMelee() {
  for (const attacker of fighters) {
    const defender = attacker === fighters[0] ? fighters[1] : fighters[0];
    if (!attacker.attack || attacker.attack.hitDone) continue;
    const box = meleeBox(attacker);
    if (!box) continue;
    if (rectsOverlap(box, bodyRect(defender))) {
      attacker.attack.hitDone = true;
      applyHit(attacker, defender, attacker.attack.damage, attacker.attack.push, attacker.attack.type);
    }
  }
}

function updateProjectiles(dt) {
  for (const p of projectiles) {
    p.x += p.vx * dt;
    p.life -= dt;
    const owner = fighters.find((f) => f.id === p.owner);
    const defender = fighters.find((f) => f.id !== p.owner);
    const box = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
    if (rectsOverlap(box, bodyRect(defender))) {
      applyHit(owner, defender, p.damage, p.push, "special");
      p.life = 0;
    }
  }
  projectiles = projectiles.filter((p) => p.life > 0 && p.x > -50 && p.x < W + 50);
}

function addSpark(x, y, color, type) {
  for (let i = 0; i < 10; i += 1) {
    sparks.push({
      x,
      y,
      vx: (Math.random() - 0.5) * (type === "block" ? 180 : 300),
      vy: (Math.random() - 0.65) * 260,
      life: 0.28 + Math.random() * 0.18,
      max: 0.45,
      color,
      size: 3 + Math.random() * 5,
    });
  }
}

function updateSparks(dt) {
  for (const s of sparks) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 620 * dt;
    s.life -= dt;
  }
  sparks = sparks.filter((s) => s.life > 0);
}

function resolveBodyPush() {
  const a = bodyRect(fighters[0]);
  const b = bodyRect(fighters[1]);
  if (!rectsOverlap(a, b)) return;
  const overlap = a.x + a.w - b.x;
  fighters[0].x -= overlap / 2;
  fighters[1].x += overlap / 2;
  fighters[0].x = clamp(fighters[0].x, 48, W - 48);
  fighters[1].x = clamp(fighters[1].x, 48, W - 48);
}

function checkRoundEnd() {
  const [p1, p2] = fighters;
  if (game.over) return;
  if (p1.hp <= 0 || p2.hp <= 0) {
    finishRound(p1.hp === p2.hp ? "双 KO" : p1.hp > p2.hp ? "1P 获胜" : "2P 获胜");
    return;
  }
  if (game.time <= 0) {
    finishRound(p1.hp === p2.hp ? "平局" : p1.hp > p2.hp ? "1P 获胜" : "2P 获胜");
  }
}

function finishRound(message) {
  game.over = true;
  game.running = false;
  game.paused = false;
  game.message = message;
  showBanner(message, "点击重新开始再战一局");
}

function update(dt) {
  if (!game.running || game.paused || game.over) return;
  game.time = Math.max(0, game.time - dt);
  updateFighter(fighters[0], fighters[1], dt);
  updateFighter(fighters[1], fighters[0], dt);
  resolveBodyPush();
  resolveMelee();
  updateProjectiles(dt);
  updateSparks(dt);
  game.shake = Math.max(0, game.shake - 36 * dt);
  checkRoundEnd();
  updateHud();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#12182b");
  sky.addColorStop(0.55, "#20233a");
  sky.addColorStop(1, "#0b0d14");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "#27304c";
  for (let i = 0; i < 7; i += 1) {
    const x = i * 155 - 28;
    const h = 120 + (i % 3) * 34;
    ctx.fillRect(x, FLOOR - h - 34, 92, h);
    ctx.fillStyle = i % 2 ? "#ffd166" : "#31d6d2";
    for (let y = FLOOR - h - 14; y < FLOOR - 54; y += 24) {
      ctx.fillRect(x + 16, y, 10, 10);
      ctx.fillRect(x + 50, y, 10, 10);
    }
    ctx.fillStyle = "#27304c";
  }

  ctx.fillStyle = "#151925";
  ctx.fillRect(0, FLOOR, W, H - FLOOR);
  ctx.fillStyle = "#242b3e";
  ctx.fillRect(0, FLOOR, W, 18);

  for (let x = 0; x < W; x += 48) {
    ctx.fillStyle = x % 96 === 0 ? "#30394f" : "#202638";
    ctx.fillRect(x, FLOOR + 20, 42, 16);
    ctx.fillRect(x + 22, FLOOR + 52, 42, 16);
  }

  ctx.strokeStyle = "rgba(255, 209, 102, 0.32)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR + 4);
  ctx.lineTo(W, FLOOR + 4);
  ctx.stroke();
}

function drawFighter(f) {
  const rect = bodyRect(f);
  const p = f.palette;
  const attacking = f.attack && attacks[f.attack.type];
  const charge = f.attack && f.attack.type === "special";
  const bob = f.onGround ? Math.sin(performance.now() / 140 + f.x) * 2 : 0;
  const y = rect.y + bob;
  const lean = f.blocking ? -f.facing * 6 : attacking ? f.facing * 7 : 0;
  const flash = f.flash > 0 && Math.floor(performance.now() / 55) % 2 === 0;

  ctx.save();
  ctx.translate(f.x, y);
  ctx.scale(f.facing, 1);

  ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
  ctx.fillRect(-42, rect.h - 4 - bob, 84, 10);

  ctx.fillStyle = flash ? "#ffffff" : p.suitDark;
  ctx.fillRect(-20 + lean, 42, 40, rect.h - 46);
  ctx.fillStyle = flash ? "#ffffff" : p.suit;
  ctx.fillRect(-25 + lean, 36, 50, 50);
  ctx.fillStyle = flash ? "#ffffff" : p.trim;
  ctx.fillRect(-21 + lean, 42, 42, 8);
  ctx.fillRect(-8 + lean, 55, 16, 38);

  ctx.fillStyle = flash ? "#ffffff" : p.skin;
  ctx.fillRect(-16 + lean, 8, 32, 30);
  ctx.fillStyle = "#17141b";
  ctx.fillRect(-18 + lean, 4, 36, 13);
  ctx.fillStyle = p.trim;
  ctx.fillRect(4 + lean, 21, 5, 5);

  const armY = f.crouching ? 58 : 54;
  ctx.fillStyle = flash ? "#ffffff" : p.glove;
  if (f.blocking) {
    ctx.fillRect(8 + lean, armY - 18, 18, 42);
    ctx.fillRect(-26 + lean, armY - 10, 18, 38);
  } else if (attacking) {
    const reach = f.attack.type === "heavy" ? 64 : 46;
    ctx.fillRect(18 + lean, armY - 8, reach, 17);
    ctx.fillRect(reach + 14 + lean, armY - 12, 22, 25);
  } else if (charge) {
    ctx.fillRect(16 + lean, armY - 10, 38, 18);
    ctx.fillRect(48 + lean, armY - 16, 18, 30);
  } else {
    ctx.fillRect(18 + lean, armY - 4, 18, 34);
    ctx.fillRect(-36 + lean, armY - 2, 18, 32);
  }

  ctx.fillStyle = flash ? "#ffffff" : p.suitDark;
  const legHeight = f.crouching ? 28 : 54;
  ctx.fillRect(-22, rect.h - legHeight, 18, legHeight);
  ctx.fillRect(5, rect.h - legHeight, 18, legHeight);
  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(-28, rect.h - 8, 28, 8);
  ctx.fillRect(4, rect.h - 8, 30, 8);

  if (f.blocking) {
    ctx.strokeStyle = "rgba(156, 240, 255, 0.8)";
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, 18, 70);
  }

  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillRect(-18, -10, 36, 20);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(-9, -5, 18, 10);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.55)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-25, -15, 50, 30);
    ctx.restore();
  }
}

function drawSparks() {
  for (const s of sparks) {
    ctx.globalAlpha = clamp(s.life / s.max, 0, 1);
    ctx.fillStyle = s.color;
    ctx.fillRect(s.x, s.y, s.size, s.size);
    ctx.globalAlpha = 1;
  }
}

function drawAttackBoxesDebug() {
  if (!new URLSearchParams(location.search).has("debug")) return;
  ctx.save();
  ctx.strokeStyle = "#ff5b68";
  for (const f of fighters) {
    const box = meleeBox(f);
    if (box) ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.strokeStyle = "#6ee787";
  for (const f of fighters) {
    const r = bodyRect(f);
    ctx.strokeRect(r.x, r.y, r.w, r.h);
  }
  ctx.restore();
}

function render() {
  ctx.save();
  if (game.shake > 0) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground();
  drawProjectiles();
  drawFighter(fighters[0]);
  drawFighter(fighters[1]);
  drawSparks();
  drawAttackBoxesDebug();
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.033, (now - lastTime) / 1000 || 0);
  lastTime = now;
  update(dt);
  render();
  pressed.clear();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", (event) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "Enter", "Escape"].includes(event.code)) {
    event.preventDefault();
  }

  if (event.code === "Enter") {
    if (!game.running || game.over) {
      startMatch();
    }
    return;
  }

  if (event.code === "Escape") {
    togglePause();
    return;
  }

  if (!keys.has(event.code)) {
    pressed.add(event.code);
  }
  keys.add(event.code);
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

ui.start.addEventListener("click", startMatch);
ui.reset.addEventListener("click", restartMatch);
ui.pause.addEventListener("click", togglePause);

resetMatch();
requestAnimationFrame((now) => {
  lastTime = now;
  requestAnimationFrame(frame);
});

