document.documentElement.classList.add("js");

// Deck tracker: mark the exhibit currently in view.
const tabs = [...document.querySelectorAll(".tracker ol a[href^='#']")];
const sections = tabs.map((a) => document.querySelector(a.getAttribute("href"))).filter(Boolean);
if (sections.length) {
  const setActive = (id) => {
    tabs.forEach((a) => a.setAttribute("aria-current", a.getAttribute("href") === "#" + id ? "true" : "false"));
    const on = tabs.find((a) => a.getAttribute("aria-current") === "true");
    const nav = on && on.closest("nav");
    // Scroll only the tab strip sideways; scrollIntoView would also move the page mid-swipe.
    if (nav && nav.scrollWidth > nav.clientWidth) {
      const a = on.getBoundingClientRect(), n = nav.getBoundingClientRect();
      nav.scrollBy({ left: a.left + a.width / 2 - (n.left + n.width / 2), behavior: "smooth" });
    }
  };
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
    { rootMargin: "-30% 0px -60% 0px" }
  );
  sections.forEach((s) => io.observe(s));
  setActive(sections[0].id);
}

// Evidence builds in once, only for figures that start below the fold.
const builders = [...document.querySelectorAll(".flow, .gantt, .bars")].filter((el) => !el.closest(".panel"));
const bo = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("build"); bo.unobserve(e.target); }
    }),
  { threshold: 0.3 }
);
builders.forEach((el) => {
  const top = el.getBoundingClientRect().top;
  if (top < innerHeight && !el.classList.contains("flow")) return; // already visible: leave it alone
  bo.observe(el);
});

// Lot × product matcher demo (illustrative numbers).
const matcher = document.querySelector("[data-matcher]");
if (matcher) {
  const SETBACK = { side: 1.2, front: 6.0, rear: 7.5 };
  const lots = [...matcher.querySelectorAll(".lot")].map((g) => ({
    g,
    id: g.dataset.id,
    w: +g.dataset.w,
    d: +g.dataset.d,
  }));
  const readout = matcher.querySelector(".readout");
  const run = () => {
    const pick = matcher.querySelector("input[name=plan]:checked");
    if (!pick) return;
    const pw = +pick.dataset.w, pd = +pick.dataset.d;
    const fits = [];
    lots.forEach((l) => {
      const bw = l.w - 2 * SETBACK.side;
      const bd = l.d - SETBACK.front - SETBACK.rear;
      const ok = pw <= bw && pd <= bd;
      l.g.classList.toggle("fit", ok);
      l.g.classList.toggle("no", !ok);
      const why = l.g.querySelector(".why");
      const x = why.getAttribute("x");
      why.innerHTML = ok ? "" : pw > bw
        ? `<tspan x="${x}">Too wide</tspan><tspan x="${x}" dy="15">by ${(pw - bw).toFixed(1)} m</tspan>`
        : `<tspan x="${x}">Too deep</tspan><tspan x="${x}" dy="15">by ${(pd - bd).toFixed(1)} m</tspan>`;
      const home = l.g.querySelector(".home");
      const k = +home.dataset.k, h = Math.min(pd, bd) * k;
      home.setAttribute("width", Math.min(pw, bw) * k);
      home.setAttribute("height", h);
      home.setAttribute("y", +home.dataset.b - h);
      if (ok) fits.push(l.id);
    });
    readout.innerHTML = fits.length
      ? `${pick.dataset.name} fits ${fits.length} of ${lots.length} lots: ${fits.join(", ")}. <span>Setbacks: ${SETBACK.side} m sides, ${SETBACK.front} m front, ${SETBACK.rear} m rear.</span>`
      : `${pick.dataset.name} fits none of these lots. <span>Every lot is too narrow or too shallow once setbacks apply.</span>`;
  };
  matcher.addEventListener("change", run);
  run();
}

const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Reading progress along the tracker.
const progress = document.querySelector(".tracker .progress");
if (progress) {
  let ticking = false;
  const paint = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
    ticking = false;
  };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
  paint();
}

// Count figures up from zero the first time they come into view.
const fmt = (el) => {
  const m = el.textContent.trim().match(/^([^\d]*)([\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return null;
  const dec = (m[2].split(".")[1] || "").length;
  return { pre: m[1], val: parseFloat(m[2].replace(/,/g, "")), dec, post: m[3], final: el.textContent };
};
const show = (el, f, v) => {
  el.textContent = f.pre + v.toLocaleString("en-US", { minimumFractionDigits: f.dec, maximumFractionDigits: f.dec }) + f.post;
};
const countUp = (el, dur = 1100) => {
  const f = el._f || (el._f = fmt(el));
  if (!f || calm) return;
  const t0 = performance.now();
  const step = (t) => {
    const k = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(2, -10 * k);
    if (k < 1) { show(el, f, f.val * e); requestAnimationFrame(step); } else el.textContent = f.final;
  };
  requestAnimationFrame(step);
};
const counters = [...document.querySelectorAll("[data-count]")];
if (counters.length && !calm) {
  const co = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { countUp(e.target); co.unobserve(e.target); }
  }), { threshold: 0.6 });
  counters.forEach((el) => {
    if (el.getBoundingClientRect().top > innerHeight) { el._f = fmt(el); if (el._f) show(el, el._f, 0); co.observe(el); }
  });
}

// Exhibit 1: run the pipeline stage by stage, then land the result.
const panel = document.querySelector(".ex1.panel");
if (panel) {
  const stages = [...panel.querySelectorAll(".flow li")];
  const replay = panel.querySelector(".replay");
  let timers = [];
  const run = () => {
    timers.forEach(clearTimeout); timers = [];
    stages.forEach((li) => li.classList.remove("lit", "now"));
    panel.classList.add("running");
    replay.disabled = true;
    stages.forEach((li, i) => timers.push(setTimeout(() => {
      stages.forEach((x) => x.classList.remove("now"));
      li.classList.add("lit", "now");
    }, 350 + i * 380)));
    timers.push(setTimeout(() => {
      stages.forEach((x) => x.classList.remove("lit", "now"));
      panel.classList.remove("running");
      replay.disabled = false;
    }, 350 + stages.length * 380 + 250));
  };
  if (!calm && replay) {
    replay.hidden = false;
    replay.addEventListener("click", run);
    run();
  }
}

// Capability matrix: focus one project's column.
const matrix = document.querySelector(".matrix");
if (matrix) {
  const buttons = [...matrix.querySelectorAll(".mx-col")];
  const rows = [...matrix.tBodies[0].rows].filter((r) => !r.classList.contains("grp"));
  let pinned = -1;
  const focusCol = (i) => {
    matrix.classList.toggle("col-focus", i >= 0);
    rows.forEach((r) => [...r.cells].forEach((c, ci) => c.classList.toggle("on-col", ci === i + 1)));
  };
  buttons.forEach((b, i) => {
    b.addEventListener("mouseenter", () => focusCol(i));
    b.addEventListener("mouseleave", () => focusCol(pinned));
    b.addEventListener("focus", () => focusCol(i));
    b.addEventListener("blur", () => focusCol(pinned));
    b.addEventListener("click", () => {
      pinned = pinned === i ? -1 : i;
      buttons.forEach((x, xi) => x.setAttribute("aria-pressed", String(xi === pinned)));
      focusCol(pinned);
    });
  });
}
