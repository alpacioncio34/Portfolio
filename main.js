// Agent cursors that build the hero, then build the rest of the page as you scroll.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const layer = document.querySelector(".agents");
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const until = (fn) => new Promise((res) => { const chk = () => (fn() ? res() : requestAnimationFrame(chk)); chk(); });

// ---------- tuning ----------
const MOTION = {
  omega: 6,          // spring stiffness for agents (higher = snappier)
  agentMax: 1300,    // agent top speed, px/s
  sweepTime: 1.1,    // seconds an agent takes to "paint" one element
  scrollMax: 1000,   // top scroll speed for wheel/keys, px/s
  jumpMax: 2400,     // top scroll speed for nav links, px/s
  scrollAccel: 3200, // px/s², keeps scroll starts and stops soft
  autoSpeed: 120,    // auto-scroll speed, px/s
};

const ARROW = `<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="currentColor" stroke="#0a0405" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const mouse = { x: 0, y: 0, active: false };

class Agent {
  constructor(name, color, x, y) {
    this.color = color;
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.max = MOTION.agentMax;
    this.target = { x, y };
    this.busy = false;
    this.home = null;
    this.queue = Promise.resolve();
    this.phase = Math.random() * 6.28;
    this.el = document.createElement("div");
    this.el.className = "agent";
    this.el.style.setProperty("--c", color);
    this.el.style.color = color;
    this.el.innerHTML = `${ARROW}<span class="tag">${name}</span><span class="say"></span>`;
    this.svg = this.el.querySelector("svg");
    this.bubble = this.el.querySelector(".say");
    layer.append(this.el);
  }
  // Target is either a fixed point or an element + relative offset (tracks while scrolling).
  goTo(el, ox = 0.5, oy = 0.5, dx = 0, dy = 0) {
    this.settle(false);
    this.target = { el, ox, oy, dx, dy };
    return new Promise((resolve) => (this.arrive = resolve));
  }
  // Scene moves: remembered, but ignored while the agent is busy building.
  idleGo(...args) {
    this.home = args;
    if (!this.busy) this.goTo(...args);
  }
  settle(v) { if (this.arrive) { const a = this.arrive; this.arrive = null; a(v); } }
  resolveTarget() {
    const t = this.target;
    if (!t.el) return t;
    const r = t.el.getBoundingClientRect();
    return { x: r.left + r.width * t.ox + t.dx, y: r.top + r.height * t.oy + t.dy };
  }
  tick(dt, time) {
    const t = this.resolveTarget();
    let tx = Math.min(t.x, innerWidth - 90);
    let ty = clamp(t.y, -60, innerHeight + 60);
    // Idle agents lean a little toward your cursor.
    if (mouse.active && !this.busy && introDone) {
      tx += clamp((mouse.x - tx) * 0.06, -36, 36);
      ty += clamp((mouse.y - ty) * 0.06, -36, 36);
    }
    if (reduced) { this.x = tx; this.y = ty; }
    else {
      // Critically damped spring, integrated in small steps so it never overshoots or jitters.
      let left = dt / 1000;
      const w = MOTION.omega;
      while (left > 0) {
        const s = Math.min(left, 1 / 120); left -= s;
        this.vx += (w * w * (tx - this.x) - 2 * w * this.vx) * s;
        this.vy += (w * w * (ty - this.y) - 2 * w * this.vy) * s;
        const sp = Math.hypot(this.vx, this.vy);
        if (sp > this.max) { this.vx *= this.max / sp; this.vy *= this.max / sp; }
        this.x += this.vx * s; this.y += this.vy * s;
      }
    }
    if (this.arrive && Math.hypot(tx - this.x, ty - this.y) < 6 && Math.hypot(this.vx, this.vy) < 60) this.settle(true);
    const wob = reduced ? 0 : 3;
    const wx = Math.sin(time / 1400 + this.phase) * wob;
    const wy = Math.cos(time / 1700 + this.phase) * wob;
    this.el.style.transform = `translate3d(${this.x + wx}px, ${this.y + wy}px, 0)`;
    this.svg.style.transform = `rotate(${clamp(this.vx / 90, -10, 10)}deg)`;
  }
  click() {
    this.el.classList.remove("click"); void this.el.offsetWidth; this.el.classList.add("click");
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.cssText = `left:${this.x}px;top:${this.y}px;--c:${this.color}`;
    document.body.append(r);
    setTimeout(() => r.remove(), 900);
  }
  say(text, ms = 3200) {
    clearTimeout(this.sayTimer);
    if (this.said === text && this.bubble.classList.contains("on")) return;
    this.said = text;
    this.bubble.textContent = text;
    this.bubble.classList.add("on");
    if (ms) this.sayTimer = setTimeout(() => this.bubble.classList.remove("on"), ms);
  }
  hush() { this.bubble.classList.remove("on"); this.said = null; }
}

const css = getComputedStyle(document.documentElement);
const col = (v) => css.getPropertyValue(v).trim();
const W = innerWidth, H = innerHeight;
const agents = {
  scout: new Agent("Scout", col("--scout"), -60, H * 0.3),
  builder: new Agent("Builder", col("--builder"), W + 60, H * 0.2),
  critic: new Agent("Critic", col("--critic"), W * 0.8, H + 60),
  pilot: new Agent("Pilot", col("--pilot"), W * 0.2, H + 60),
};
const crew = Object.values(agents);

// Your own cursor joins the session.
let you = null;
if (finePointer) {
  you = new Agent("You", col("--paper"), -100, -100);
  you.el.classList.add("you");
  document.body.classList.add("custom-cursor");
  addEventListener("pointermove", (e) => { mouse.x = you.x = e.clientX; mouse.y = you.y = e.clientY; mouse.active = true; });
  document.addEventListener("pointerleave", () => { mouse.active = false; you.x = you.y = -100; });
  addEventListener("pointerdown", () => you.click());
}

// ---------- speed-limited scrolling ----------
// Wheel, keys and nav links all go through one eased scroller with a top speed,
// so the agents can always keep up. Touch and scrollbar drags stay native.
const root = document.documentElement;
const autoBtn = $(".auto");
const maxScroll = () => root.scrollHeight - innerHeight;
const scroller = { pos: scrollY, target: scrollY, v: 0, cap: MOTION.scrollMax, auto: false, lastSet: null };

function scrollByUser(d) {
  setAuto(false);
  scroller.cap = MOTION.scrollMax;
  // Don't let a burst of wheel input queue up more than ~1 screen ahead.
  const t = clamp(scroller.target + d, scroller.pos - innerHeight, scroller.pos + innerHeight);
  scroller.target = clamp(t, 0, maxScroll());
}
function scrollToY(y, cap = MOTION.jumpMax) {
  setAuto(false);
  scroller.cap = cap;
  scroller.target = clamp(y, 0, maxScroll());
}
function setAuto(on) {
  if (on && scroller.pos >= maxScroll() - 2) on = false;
  scroller.auto = on;
  autoBtn.setAttribute("aria-pressed", on);
  autoBtn.querySelector(".auto-label").textContent = on ? "Pause" : "Auto-scroll";
}
autoBtn.addEventListener("click", () => setAuto(!scroller.auto));

function stepScroll(dt) {
  const s = dt / 1000;
  // Something else moved the page (scrollbar, touch, find-in-page): follow it.
  if (scroller.lastSet !== null && Math.abs(scrollY - scroller.lastSet) > 2) {
    scroller.pos = scroller.target = scrollY; scroller.v = 0; scroller.lastSet = null;
    setAuto(false);
    return;
  }
  if (scroller.auto) {
    scroller.cap = MOTION.scrollMax;
    // Slow to a crawl while the crew is mid-build so you see every piece go in.
    const speed = MOTION.autoSpeed * (crewBuilding() ? 0.25 : 1);
    if (introDone) scroller.target = Math.min(scroller.target + speed * s, maxScroll());
    if (scroller.pos >= maxScroll() - 1) setAuto(false);
  }
  const diff = scroller.target - scroller.pos;
  if (!scroller.auto && Math.abs(diff) < 0.5 && Math.abs(scroller.v) < 4) {
    scroller.pos = scroller.target = scrollY; scroller.v = 0; scroller.lastSet = null;
    return;
  }
  const desired = clamp(diff * 5, -scroller.cap, scroller.cap);
  const acc = MOTION.scrollAccel * s;
  scroller.v += clamp(desired - scroller.v, -acc, acc);
  scroller.pos = clamp(scroller.pos + scroller.v * s, 0, maxScroll());
  scrollTo(0, scroller.pos);
  scroller.lastSet = scrollY;
}


if (!reduced) {
  root.classList.add("js-scroll");
  addEventListener("wheel", (e) => {
    if (e.ctrlKey) return; // pinch zoom
    e.preventDefault();
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1;
    scrollByUser(e.deltaY * unit);
  }, { passive: false });
}
addEventListener("touchstart", () => setAuto(false), { passive: true });
addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input, textarea, select, [contenteditable]")) return;
  const page = innerHeight * 0.85;
  const map = { ArrowDown: 80, ArrowUp: -80, PageDown: page, PageUp: -page, " ": e.shiftKey ? -page : page };
  if (e.key in map) { e.preventDefault(); scrollByUser(map[e.key]); }
  else if (e.key === "Home") { e.preventDefault(); scrollToY(0); }
  else if (e.key === "End") { e.preventDefault(); scrollToY(maxScroll()); }
});
document.addEventListener("click", (e) => {
  const a = e.target.closest('a[href^="#"]');
  if (!a) return;
  const id = a.getAttribute("href").slice(1);
  const el = id === "top" ? null : document.getElementById(id);
  if (id !== "top" && !el) return;
  e.preventDefault();
  scrollToY(el ? el.getBoundingClientRect().top + scrollY : 0);
});

// ---------- build-on-scroll ----------
// Every [data-build] element starts hidden. When it scrolls into view an agent
// flies to its left edge and paints it in, the reveal following the cursor.
const sweeps = new Set();
let buildGate = Promise.resolve();
let introReady;
const introPromise = new Promise((r) => (introReady = r));

function reveal(el) {
  el.classList.remove("unbuilt");
  el.style.clipPath = "";
}
const crewBuilding = () => crew.some((a) => a.busy);

async function buildEl(agent, el, started) {
  await introPromise;
  await until(() => el.getBoundingClientRect().top < innerHeight * 0.82);
  const r = el.getBoundingClientRect();
  if (reduced || r.bottom < 40) { reveal(el); started(); return; } // already scrolled past: no ceremony
  agent.busy = true;
  agent.hush();
  started();
  await Promise.race([agent.goTo(el, 0, 0.5, -10, 0), wait(1800)]);
  if (!el.classList.contains("unbuilt")) return finish(agent);
  agent.click();
  const sweep = { el, agent, edge: 0 };
  sweeps.add(sweep);
  agent.max = clamp(r.width / MOTION.sweepTime, 260, MOTION.agentMax);
  if (el.dataset.say) agent.say(el.dataset.say, 2600);
  await Promise.race([agent.goTo(el, 1, 0.5, 6, 0), wait(3500)]);
  sweeps.delete(sweep);
  reveal(el);
  finish(agent);
}
function finish(agent) {
  agent.max = MOTION.agentMax;
  agent.busy = false;
  if (agent.home) agent.goTo(...agent.home);
}
function updateSweeps() {
  sweeps.forEach((s) => {
    const r = s.el.getBoundingClientRect();
    s.edge = Math.max(s.edge, clamp((s.agent.x - r.left) / r.width, 0, 1));
    s.el.style.clipPath = `inset(-40px ${((1 - s.edge) * 100).toFixed(2)}% -40px -40px)`;
  });
}

const buildItems = $$("[data-build]");
let lane = 0;
buildItems.forEach((el) => {
  if (reduced) return;
  el.classList.add("unbuilt");
  const agent = agents[el.dataset.agent] || crew[lane++ % crew.length];
  // Elements start in page order, a beat apart; each agent works through its own queue.
  const gate = buildGate;
  let started;
  const startedP = new Promise((r) => (started = r));
  buildGate = startedP.then(() => wait(260));
  agent.queue = agent.queue.then(() => gate).then(() => buildEl(agent, el, started))
    .catch((e) => { console.error(e); reveal(el); started(); agent.busy = false; });
});

// ---------- animation loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 64); last = now;
  stepScroll(dt);
  crew.forEach((a) => a.tick(dt, now));
  updateSweeps();
  if (you) you.el.style.transform = `translate3d(${you.x}px, ${you.y}px, 0)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- scroll-driven gradient ----------
function setProgress() {
  const max = maxScroll();
  root.style.setProperty("--p", max > 0 ? (scrollY / max).toFixed(4) : 0);
}

// ---------- hero intro ----------
const title = $(".hero-title"), typed = title.querySelector(".typed"), caret = title.querySelector(".caret");
const sub = $(".hero-sub"), cta = $(".hero-cta"), hint = $(".hint");
let introDone = false;
const ABORT = Symbol();
const guard = async (p) => { await p; if (introDone) throw ABORT; };

async function typeInto(node, text, speed) {
  for (const ch of text) {
    if (introDone) throw ABORT;
    node.textContent += ch;
    await wait(speed + (ch === " " ? 60 : Math.random() * 40));
  }
}

async function intro() {
  const { scout, builder, critic, pilot } = agents;
  await wait(600);
  await guard(scout.goTo(title, 0, 0.2, 0, 0));
  scout.click();
  scout.say("Writing the headline", 0);
  // Scout rides along with the caret while typing.
  scout.goTo(caret, 1, 1, 4, 2);
  // Pilot starts on the subtitle partway through.
  const subLine = (async () => {
    await wait(1400);
    await guard(pilot.goTo(sub, 0, 0, -6, 6));
    pilot.click();
    const span = document.createElement("span");
    const end = document.createElement("span");
    sub.append(span, end);
    pilot.goTo(end, 1, 0.5, 6, 6);
    await typeInto(span, sub.dataset.text, 24);
  })();
  subLine.catch(() => {});
  await typeInto(typed, title.dataset.text, 62);
  scout.hush();
  scout.goTo(title, 0.15, 1, 0, 30);

  // Builder drags a selection over the headline and paints it.
  await guard(builder.goTo(title, 0, 0, -12, -12));
  builder.click();
  title.classList.add("selected");
  await guard(builder.goTo(title, 1, 1, 14, 10));
  builder.say("Filling with the scroll gradient", 2200);
  await guard(wait(700));
  title.classList.add("painted");
  title.classList.remove("selected");
  caret.classList.add("gone");

  await guard(critic.goTo(title, 0.85, 0.15, 0, 0));
  critic.say("Tracking looks right. Ship it.", 2600);
  await subLine;

  await guard(builder.goTo(cta, 0.1, 0.5));
  builder.click();
  cta.classList.add("placed");
  await guard(wait(700));
  finishIntro();
}

function finishIntro() {
  if (introDone) return;
  introDone = true;
  typed.textContent = title.dataset.text;
  if (sub.textContent !== sub.dataset.text) sub.textContent = sub.dataset.text;
  title.classList.remove("selected");
  title.classList.add("painted");
  caret.classList.add("gone");
  cta.classList.add("placed");
  hint.classList.add("show");
  scene = null;
  updateScene();
  introReady();
}

// ---------- scenes: idle agents follow what's on screen ----------
const stepLines = {
  scout: "Reading the brief twice before touching code.",
  builder: "Slice 3 of 7 is running in the browser.",
  critic: "Cut the parallax. It wasn't earning its place.",
  pilot: "Deployed. Handover notes are in the README.",
};
const steps = $$(".steps li");
const projects = $$(".project");
let scene = null, activeStep = -1, hovered = null;

function currentSection() {
  const mid = innerHeight / 2;
  return $$("main > section").find((s) => {
    const r = s.getBoundingClientRect();
    return r.top <= mid && r.bottom >= mid;
  }) || $(".contact");
}

function updateScene() {
  if (!introDone) return;
  const sec = currentSection();
  const name = sec.className.split(" ")[0];

  if (name === "process") {
    const r = sec.getBoundingClientRect();
    const prog = clamp(-r.top / (r.height - innerHeight), 0, 0.999);
    const i = innerWidth > 820 ? Math.floor(prog * steps.length) : nearestIndex(steps);
    if (scene === "process" && i === activeStep) return;
    scene = "process"; activeStep = i;
    steps.forEach((li, j) => {
      li.classList.toggle("active", j === i);
      const a = agents[li.dataset.agent];
      if (j === i) {
        a.idleGo(li, 0.62, 0.2);
        if (!a.busy) { a.click(); a.say(stepLines[li.dataset.agent], 3600); }
      } else { a.idleGo(li, 0.96, 0.5); if (!a.busy) a.hush(); }
    });
    return;
  }
  if (scene === name) return;
  scene = name;
  steps.forEach((li) => li.classList.remove("active"));
  activeStep = -1;
  crew.forEach((a) => !a.busy && a.hush());
  const { scout, builder, critic, pilot } = agents;

  if (name === "hero") {
    scout.idleGo(title, 1, 0.55, 30, 0);
    builder.idleGo(cta, 1, 0.5, 30, 0);
    critic.idleGo(title, 0.85, 0.15);
    pilot.idleGo(sub, 0.9, 1, 0, 10);
  } else if (name === "work") {
    if (hovered) return gatherOn(hovered);
    const narrow = innerWidth <= 820;
    crew.forEach((a, i) => projects[i] && a.idleGo(projects[i], narrow ? 0.8 : [0.26, 0.31, 0.24, 0.29][i], narrow ? 0.12 : 0.3));
  } else if (name === "stack") {
    const list = $(".stack-list");
    scout.idleGo(list, 0.1, 0.1); builder.idleGo(list, 0.55, 0.3);
    critic.idleGo(list, 0.3, 0.9); pilot.idleGo(list, 0.85, 0.7);
    if (!critic.busy) critic.say("Good list. Short, too.", 2800);
  } else if (name === "contact") {
    const link = $(".contact-link");
    scout.idleGo(link, 0.05, 1, 0, 14); builder.idleGo(link, 0.4, 0, 0, -30);
    critic.idleGo(link, 0.75, 1, 0, 18); pilot.idleGo(link, 1, 0.4, 10, 0);
    if (!pilot.busy) pilot.say("We're ready when you are.", 0);
  }
}

function nearestIndex(els) {
  const mid = innerHeight / 2;
  let best = 0, bestD = Infinity;
  els.forEach((el, i) => {
    const r = el.getBoundingClientRect();
    const d = Math.abs(r.top + r.height / 2 - mid);
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function gatherOn(p) {
  const spots = [[0.02, 0.1], [0.5, 0.02], [0.98, 0.25], [0.6, 0.98]];
  crew.forEach((a, i) => a.idleGo(p, ...spots[i]));
  if (!agents.critic.busy) agents.critic.say(p.dataset.note, 0);
}

projects.forEach((p) => {
  const enter = () => { hovered = p; if (introDone) gatherOn(p); };
  const leave = () => { hovered = null; agents.critic.hush(); scene = null; updateScene(); };
  p.addEventListener("pointerenter", enter);
  p.addEventListener("pointerleave", leave);
  p.addEventListener("focus", enter);
  p.addEventListener("blur", leave);
  p.addEventListener("pointermove", (e) => {
    const r = p.getBoundingClientRect();
    p.style.setProperty("--mx", `${e.clientX - r.left}px`);
    p.style.setProperty("--my", `${e.clientY - r.top}px`);
  });
});

let ticking = false;
function onScroll() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    ticking = false;
    setProgress();
    if (!introDone && scrollY > innerHeight * 0.4) finishIntro();
    updateScene();
  });
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", () => { scene = null; onScroll(); });

setProgress();
if (reduced) finishIntro();
else intro().catch((e) => { if (e !== ABORT) { console.error(e); finishIntro(); } });
