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
const DASH_TAP_WINDOW = 0.22;
const FORWARD_DASH_TIME = 0.18;
const BACK_DASH_TIME = 0.2;
const LANDING_RECOVERY = 0.08;
const AIR_ATTACK_LANDING_RECOVERY = 0.12;

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
  airLight: {
    duration: 0.3,
    activeStart: 0.09,
    activeEnd: 0.2,
    reach: 58,
    height: 46,
    yOffset: 76,
    damage: 6,
    push: 150,
    cooldown: 0.16,
    energyGain: 7,
  },
};

let fighters;
let projectiles;
let sparks;
let impactRings;
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
    dash: null,
    dashCooldown: 0,
    tapWindow: { left: 0, right: 0 },
    landingRecovery: 0,
    airAttackUsed: false,
    cooldown: 0,
    hitstun: 0,
    invuln: 0,
    flash: 0,
    reaction: null,
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
  impactRings = [];
  game = {
    running: false,
    paused: false,
    over: false,
    time: ROUND_TIME,
    message: "准备",
    banner: "点击开始对战",
    shake: 0,
    hitStop: 0,
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

function attackPhase(attack) {
  if (!attack) return "idle";
  if (attack.elapsed < attack.activeStart) return "startup";
  if (attack.elapsed <= attack.activeEnd) return "active";
  return "recovery";
}

function attackPhaseLabel(attack) {
  const labels = {
    idle: "待机",
    startup: "起手",
    active: "生效",
    recovery: "收招",
  };
  return labels[attackPhase(attack)];
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
  if (type === "airLight") f.airAttackUsed = true;
}

function beginDash(f, dir) {
  const forward = dir === f.facing;
  f.dash = {
    type: forward ? "forward" : "back",
    dir,
    time: forward ? FORWARD_DASH_TIME : BACK_DASH_TIME,
    max: forward ? FORWARD_DASH_TIME : BACK_DASH_TIME,
  };
  f.dashCooldown = forward ? 0.25 : 0.3;
  f.blocking = false;
  f.crouching = false;
  if (!forward) f.invuln = Math.max(f.invuln, 0.08);
  addSpark(f.x - dir * 22, f.y - 12, forward ? f.palette.trim : "#9cf0ff", "dash");
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
    trail: [],
  });
}

function updateFighter(f, other, dt) {
  const wasOnGround = f.onGround;
  f.facing = other.x >= f.x ? 1 : -1;
  f.cooldown = Math.max(0, f.cooldown - dt);
  f.dashCooldown = Math.max(0, f.dashCooldown - dt);
  f.landingRecovery = Math.max(0, f.landingRecovery - dt);
  f.tapWindow.left = Math.max(0, f.tapWindow.left - dt);
  f.tapWindow.right = Math.max(0, f.tapWindow.right - dt);
  f.hitstun = Math.max(0, f.hitstun - dt);
  f.invuln = Math.max(0, f.invuln - dt);
  f.flash = Math.max(0, f.flash - dt);
  if (f.reaction) {
    f.reaction.time -= dt;
    if (f.reaction.time <= 0) f.reaction = null;
  }

  if (f.attack) {
    f.attack.elapsed += dt;
    if (f.attack.elapsed >= f.attack.duration) {
      f.attack = null;
    }
  }
  if (f.dash) {
    f.dash.time -= dt;
    if (f.dash.time <= 0 || f.hitstun > 0) f.dash = null;
  }

  const input = f.controls;
  const locked = f.hitstun > 0 || Boolean(f.attack) || f.landingRecovery > 0 || Boolean(f.dash);
  f.crouching = f.onGround && down(input.down) && !locked;
  f.blocking = down(input.block) && !locked && isFacing(f, other);

  if (f.onGround && !locked && !f.blocking && f.dashCooldown <= 0) {
    if (wasPressed(input.left)) {
      if (f.tapWindow.left > 0) beginDash(f, -1);
      f.tapWindow.left = DASH_TAP_WINDOW;
    }
    if (wasPressed(input.right)) {
      if (f.tapWindow.right > 0) beginDash(f, 1);
      f.tapWindow.right = DASH_TAP_WINDOW;
    }
  }

  let move = 0;
  if (!locked && !f.blocking) {
    if (down(input.left)) move -= 1;
    if (down(input.right)) move += 1;
  }

  if (f.hitstun > 0) {
    f.dash = null;
    f.vx *= Math.pow(0.08, dt);
  } else if (f.dash) {
    const progress = f.dash.time / f.dash.max;
    const speed = f.dash.type === "forward" ? 620 : 470;
    f.vx = f.dash.dir * speed * (0.55 + progress * 0.45);
  } else {
    const speed = f.crouching ? 110 : 260;
    f.vx = f.onGround ? move * speed : move * 175;
  }

  if (f.onGround && !locked && !f.dash && !f.blocking && wasPressed(input.jump)) {
    f.vy = -760;
    f.onGround = false;
    f.crouching = false;
  }

  if (!locked && !f.dash && f.cooldown <= 0) {
    if (wasPressed(input.light)) {
      if (f.onGround || !f.airAttackUsed) beginAttack(f, f.onGround ? "light" : "airLight");
    }
    if (f.onGround && wasPressed(input.heavy)) beginAttack(f, "heavy");
    if (f.onGround && wasPressed(input.special) && f.energy >= SPECIAL_COST) launchSpecial(f);
  }

  f.vy += GRAVITY * dt;
  f.x += f.vx * dt;
  f.y += f.vy * dt;

  if (f.y >= FLOOR) {
    f.y = FLOOR;
    f.vy = 0;
    f.onGround = true;
    if (!wasOnGround) {
      f.landingRecovery = f.airAttackUsed ? AIR_ATTACK_LANDING_RECOVERY : LANDING_RECOVERY;
      f.airAttackUsed = false;
      f.dash = null;
    }
  } else {
    f.onGround = false;
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
  const impactX = defender.x - attacker.facing * 24;
  const impactY = defender.y - 72;
  defender.hp = clamp(defender.hp - finalDamage, 0, MAX_HP);
  defender.invuln = blocked ? 0.14 : 0.22;
  defender.hitstun = blocked ? 0.1 : 0.28;
  defender.flash = blocked ? 0.08 : 0.16;
  defender.reaction = {
    type: blocked ? "block" : "hit",
    dir: attacker.facing,
    time: blocked ? 0.14 : 0.2,
    max: blocked ? 0.14 : 0.2,
  };
  defender.vx = attacker.facing * (blocked ? push * 0.45 : push);
  attacker.energy = clamp(attacker.energy + (blocked ? 4 : 9), 0, MAX_ENERGY);
  if (blocked) defender.energy = clamp(defender.energy + 6, 0, MAX_ENERGY);
  game.shake = blocked ? Math.max(game.shake, 4) : Math.max(game.shake, kind === "special" ? 12 : 7);
  game.hitStop = Math.max(game.hitStop, blocked ? 0.045 : kind === "special" ? 0.095 : kind === "heavy" ? 0.075 : 0.055);
  addSpark(impactX, impactY, blocked ? "#9cf0ff" : "#ffd166", blocked ? "block" : kind);
  addImpactRing(impactX, impactY, blocked ? "#9cf0ff" : kind === "special" ? attacker.palette.trim : "#ffd166", blocked ? "block" : kind);
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
    p.trail.push({
      x: p.x,
      y: p.y,
      life: 0.18,
      max: 0.18,
      r: p.r,
    });
    if (p.trail.length > 9) p.trail.shift();
    p.x += p.vx * dt;
    p.life -= dt;
    for (const t of p.trail) t.life -= dt;
    p.trail = p.trail.filter((t) => t.life > 0);
    const owner = fighters.find((f) => f.id === p.owner);
    const defender = fighters.find((f) => f.id !== p.owner);
    const box = { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
    if (rectsOverlap(box, bodyRect(defender))) {
      applyHit(owner, defender, p.damage, p.push, "special");
      addImpactRing(p.x, p.y, p.color, "special");
      p.life = 0;
    }
  }
  projectiles = projectiles.filter((p) => p.life > 0 && p.x > -50 && p.x < W + 50);
}

function addSpark(x, y, color, type) {
  const count = type === "special" ? 22 : type === "heavy" ? 16 : type === "block" ? 12 : type === "dash" ? 8 : 10;
  const speed = type === "block" ? 180 : type === "special" ? 380 : type === "dash" ? 220 : 300;
  for (let i = 0; i < count; i += 1) {
    sparks.push({
      x,
      y,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - (type === "dash" ? 0.25 : 0.65)) * (type === "special" ? 340 : 260),
      life: 0.28 + Math.random() * (type === "special" ? 0.28 : 0.18),
      max: type === "special" ? 0.56 : 0.45,
      color,
      size: 3 + Math.random() * (type === "special" ? 8 : 5),
    });
  }
}

function addImpactRing(x, y, color, type) {
  const special = type === "special";
  const heavy = type === "heavy";
  impactRings.push({
    x,
    y,
    color,
    life: special ? 0.34 : 0.22,
    max: special ? 0.34 : 0.22,
    start: type === "block" ? 10 : 6,
    end: special ? 68 : heavy ? 48 : 34,
    width: special ? 6 : heavy ? 5 : 4,
  });
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

function updateImpactRings(dt) {
  for (const r of impactRings) r.life -= dt;
  impactRings = impactRings.filter((r) => r.life > 0);
}

function resolveBodyPush() {
  const a = bodyRect(fighters[0]);
  const b = bodyRect(fighters[1]);
  if (!rectsOverlap(a, b)) return;
  const overlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const dir = fighters[0].x <= fighters[1].x ? -1 : 1;
  fighters[0].x += dir * overlap / 2;
  fighters[1].x -= dir * overlap / 2;
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
  if (game.hitStop > 0) {
    game.hitStop = Math.max(0, game.hitStop - dt);
    updateSparks(dt * 0.35);
    updateImpactRings(dt * 0.35);
    game.shake = Math.max(0, game.shake - 18 * dt);
    updateHud();
    return;
  }
  game.time = Math.max(0, game.time - dt);
  updateFighter(fighters[0], fighters[1], dt);
  updateFighter(fighters[1], fighters[0], dt);
  resolveBodyPush();
  resolveMelee();
  updateProjectiles(dt);
  updateSparks(dt);
  updateImpactRings(dt);
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
  const phase = attackPhase(f.attack);
  const bob = f.onGround ? Math.sin(performance.now() / 140 + f.x) * 2 : 0;
  const y = rect.y + bob;
  const reactionPower = f.reaction ? f.reaction.time / f.reaction.max : 0;
  const reactionLean = f.reaction
    ? (f.reaction.type === "block" ? -f.facing * 10 : -f.reaction.dir * 14) * reactionPower
    : 0;
  const phaseLean = phase === "startup" ? -f.facing * 5 : phase === "active" ? f.facing * 8 : phase === "recovery" ? f.facing * 3 : 0;
  const dashLean = f.dash ? f.facing * (f.dash.type === "forward" ? 12 : -9) : 0;
  const lean = reactionLean || (f.blocking ? -f.facing * 6 : f.dash ? dashLean : phaseLean);
  const flash = f.flash > 0 && Math.floor(performance.now() / 55) % 2 === 0;
  const guarding = f.blocking || (f.reaction && f.reaction.type === "block");
  const hitReacting = f.reaction && f.reaction.type === "hit";

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
  if (guarding) {
    ctx.fillRect(8 + lean, armY - 18, 18, 42);
    ctx.fillRect(-26 + lean, armY - 10, 18, 38);
  } else if (hitReacting) {
    ctx.fillRect(-42 + lean, armY - 20, 18, 34);
    ctx.fillRect(18 + lean, armY + 2, 18, 30);
  } else if (attacking) {
    const baseReach = f.attack.type === "heavy" ? 64 : f.attack.type === "airLight" ? 56 : 46;
    const reach = phase === "startup" ? 24 : phase === "active" ? baseReach : 32;
    const fistSize = f.attack.type === "heavy" ? 26 : 22;
    ctx.fillRect(18 + lean, armY - 8, reach, 17);
    ctx.fillRect(reach + 14 + lean, armY - 12, fistSize, 25);
  } else if (charge) {
    const pulse = Math.sin(performance.now() / 38) * 3;
    ctx.fillRect(16 + lean, armY - 10, 38, 18);
    ctx.fillRect(48 + lean, armY - 16, 18, 30);
    ctx.strokeStyle = p.trim;
    ctx.lineWidth = 3;
    ctx.strokeRect(44 + lean - pulse, armY - 20 - pulse, 28 + pulse * 2, 38 + pulse * 2);
  } else {
    ctx.fillRect(18 + lean, armY - 4, 18, 34);
    ctx.fillRect(-36 + lean, armY - 2, 18, 32);
  }

  ctx.fillStyle = flash ? "#ffffff" : p.suitDark;
  const legHeight = f.crouching ? 28 : 54;
  const legSpread = f.dash ? 8 : 0;
  ctx.fillRect(-22 - legSpread, rect.h - legHeight, 18, legHeight);
  ctx.fillRect(5 + legSpread, rect.h - legHeight, 18, legHeight);
  ctx.fillStyle = "#0b0d14";
  ctx.fillRect(-28 - legSpread, rect.h - 8, 28, 8);
  ctx.fillRect(4 + legSpread, rect.h - 8, 30, 8);

  if (guarding) {
    ctx.strokeStyle = "rgba(156, 240, 255, 0.8)";
    ctx.lineWidth = 4;
    ctx.strokeRect(30 + lean, 30, 18, 70);
  }

  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    for (const t of p.trail) {
      ctx.save();
      ctx.globalAlpha = clamp(t.life / t.max, 0, 0.7);
      ctx.translate(t.x, t.y);
      ctx.fillStyle = p.color;
      ctx.fillRect(-t.r * 0.9, -8, t.r * 1.8, 16);
      ctx.restore();
    }
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

function drawImpactRings() {
  for (const r of impactRings) {
    const progress = 1 - r.life / r.max;
    const radius = r.start + (r.end - r.start) * progress;
    ctx.save();
    ctx.globalAlpha = clamp(r.life / r.max, 0, 1);
    ctx.strokeStyle = r.color;
    ctx.lineWidth = r.width;
    ctx.beginPath();
    ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
    ctx.stroke();
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
  ctx.fillStyle = "#ffffff";
  ctx.font = "12px monospace";
  for (const f of fighters) {
    const r = bodyRect(f);
    const state = f.attack
      ? `${f.attack.type}:${attackPhaseLabel(f.attack)}`
      : f.dash
        ? `${f.dash.type} dash`
        : f.landingRecovery > 0
          ? "landing"
          : f.reaction ? f.reaction.type : f.blocking ? "block" : "idle";
    ctx.fillText(`${f.id} ${state}`, r.x, r.y - 8);
  }
  if (game.hitStop > 0) {
    ctx.fillText(`hitStop ${game.hitStop.toFixed(2)}`, 16, 24);
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
  drawImpactRings();
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

