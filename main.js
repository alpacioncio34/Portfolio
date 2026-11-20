// Agent cursors that build the hero, then follow you through the page.
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const finePointer = matchMedia("(pointer: fine)").matches;
const layer = document.querySelector(".agents");
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const wait = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

const ARROW = `<svg viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" fill="currentColor" stroke="#120e26" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

class Agent {
  constructor(name, color, x, y) {
    this.color = color;
    this.x = x; this.y = y;
    this.target = { x, y };
    this.phase = Math.random() * 6.28;
    this.el = document.createElement("div");
    this.el.className = "agent";
    this.el.style.setProperty("--c", color);
    this.el.style.color = color;
    this.el.innerHTML = `${ARROW}<span class="tag">${name}</span><span class="say"></span>`;
    this.bubble = this.el.querySelector(".say");
    layer.append(this.el);
  }
  // Target is either a fixed point or an element + relative offset (tracks while scrolling).
  goTo(el, ox = 0.5, oy = 0.5, dx = 0, dy = 0) {
    this.target = { el, ox, oy, dx, dy };
    return new Promise((resolve) => (this.arrive = resolve));
  }
  goPoint(x, y) {
    this.target = { x, y };
    return new Promise((resolve) => (this.arrive = resolve));
  }
  resolveTarget() {
    const t = this.target;
    if (!t.el) return t;
    const r = t.el.getBoundingClientRect();
    return { x: r.left + r.width * t.ox + t.dx, y: r.top + r.height * t.oy + t.dy };
  }
  tick(dt, time) {
    const t = this.resolveTarget();
    const tx = Math.min(t.x, innerWidth - 90);
    const k = reduced ? 1 : 1 - Math.pow(0.88, dt / 16);
    this.x += (tx - this.x) * k;
    this.y += (t.y - this.y) * k;
    if (this.arrive && Math.hypot(tx - this.x, t.y - this.y) < 3) { this.arrive(); this.arrive = null; }
    const wob = reduced ? 0 : 5;
    const wx = Math.sin(time / 900 + this.phase) * wob;
    const wy = Math.cos(time / 1100 + this.phase) * wob;
    this.el.style.transform = `translate(${this.x + wx}px, ${this.y + wy}px)`;
  }
  click() {
    this.el.classList.remove("click"); void this.el.offsetWidth; this.el.classList.add("click");
    const r = document.createElement("span");
    r.className = "ripple";
    r.style.cssText = `left:${this.x}px;top:${this.y}px;--c:${this.color}`;
    document.body.append(r);
    setTimeout(() => r.remove(), 500);
  }
  say(text, ms = 2600) {
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
  you = new Agent("You", "#f3eeff", -100, -100);
  you.el.classList.add("you");
  document.body.classList.add("custom-cursor");
  addEventListener("pointermove", (e) => { you.target = { x: e.clientX, y: e.clientY }; you.x = e.clientX; you.y = e.clientY; });
  document.addEventListener("pointerleave", () => (you.target = { x: -100, y: -100 }));
  addEventListener("pointerdown", () => you.click());
  $("#session-count").textContent = "4 agents";
}

// ---------- animation loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(now - last, 64); last = now;
  crew.forEach((a) => a.tick(dt, now));
  if (you) you.el.style.transform = `translate(${you.x}px, ${you.y}px)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- scroll-driven gradient ----------
function setProgress() {
  const max = document.documentElement.scrollHeight - innerHeight;
  document.documentElement.style.setProperty("--p", max > 0 ? (scrollY / max).toFixed(4) : 0);
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
    await wait(speed + (ch === " " ? 40 : Math.random() * 30));
  }
}

async function intro() {
  const { scout, builder, critic, pilot } = agents;
  await wait(400);
  await guard(scout.goTo(title, 0, 0.2, 0, 0));
  scout.click();
  scout.say("Writing the headline", 0);
  // Scout rides along with the caret while typing.
  scout.goTo(caret, 1, 1, 4, 2);
  // Pilot starts on the subtitle partway through.
  const subLine = (async () => {
    await wait(900);
    await guard(pilot.goTo(sub, 0, 0, -6, 6));
    pilot.click();
    const span = document.createElement("span");
    const end = document.createElement("span");
    sub.append(span, end);
    pilot.goTo(end, 1, 0.5, 6, 6);
    await typeInto(span, sub.dataset.text, 14);
  })();
  subLine.catch(() => {});
  await typeInto(typed, title.dataset.text, 45);
  scout.hush();
  scout.goTo(title, 0.15, 1, 0, 30);

  // Builder drags a selection over the headline and paints it.
  await guard(builder.goTo(title, 0, 0, -12, -12));
  builder.click();
  title.classList.add("selected");
  await guard(builder.goTo(title, 1, 1, 14, 10));
  builder.say("Filling with the scroll gradient", 1800);
  await guard(wait(500));
  title.classList.add("painted");
  title.classList.remove("selected");
  caret.classList.add("gone");

  await guard(critic.goTo(title, 0.85, 0.15, 0, 0));
  critic.say("Tracking looks right. Ship it.", 2200);
  await subLine;

  await guard(builder.goTo(cta, 0.1, 0.5));
  builder.click();
  cta.classList.add("placed");
  await guard(wait(400));
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
}

// ---------- scenes: agents follow what's on screen ----------
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
    const prog = Math.min(Math.max(-r.top / (r.height - innerHeight), 0), 0.999);
    const i = innerWidth > 820 ? Math.floor(prog * steps.length) : nearestIndex(steps);
    if (scene === "process" && i === activeStep) return;
    scene = "process"; activeStep = i;
    steps.forEach((li, j) => {
      li.classList.toggle("active", j === i);
      const a = agents[li.dataset.agent];
      if (j === i) { a.goTo(li, 0.62, 0.2); a.click(); a.say(stepLines[li.dataset.agent], 3200); }
      else { a.goTo(li, 0.96, 0.5); a.hush(); }
    });
    return;
  }
  if (scene === name) return;
  scene = name;
  steps.forEach((li) => li.classList.remove("active"));
  activeStep = -1;
  crew.forEach((a) => a.hush());
  const { scout, builder, critic, pilot } = agents;

  if (name === "hero") {
    scout.goTo(title, 1, 0.55, 30, 0);
    builder.goTo(cta, 1, 0.5, 30, 0);
    critic.goTo(title, 0.85, 0.15);
    pilot.goTo(sub, 0.9, 1, 0, 10);
  } else if (name === "work") {
    if (hovered) return gatherOn(hovered);
    const narrow = innerWidth <= 820;
    crew.forEach((a, i) => projects[i] && a.goTo(projects[i], narrow ? 0.8 : [0.26, 0.31, 0.24, 0.29][i], narrow ? 0.12 : 0.3));
  } else if (name === "stack") {
    const list = $(".stack-list");
    scout.goTo(list, 0.1, 0.1); builder.goTo(list, 0.55, 0.3);
    critic.goTo(list, 0.3, 0.9); pilot.goTo(list, 0.85, 0.7);
    critic.say("Good list. Short, too.", 2400);
  } else if (name === "contact") {
    const link = $(".contact-link");
    scout.goTo(link, 0.05, 1, 0, 14); builder.goTo(link, 0.4, 0, 0, -30);
    critic.goTo(link, 0.75, 1, 0, 18); pilot.goTo(link, 1, 0.4, 10, 0);
    pilot.say("We're ready when you are.", 0);
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
  crew.forEach((a, i) => a.goTo(p, ...spots[i]));
  agents.critic.say(p.dataset.note, 0);
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
