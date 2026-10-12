(() => {
  "use strict";

  const MAP = window.AZ_MAP;
  const R = MAP.regions;
  const N = R.length;
  const ASPECT = 724 / 520;
  const EPOCH = Date.UTC(2026, 0, 1);
  const SPEED_SECONDS = 90;

  const $ = (id) => document.getElementById(id);
  const svg = $("map");
  const SVGNS = "http://www.w3.org/2000/svg";

  // ---------- graph ----------
  function bfs(src) {
    const d = new Array(N).fill(Infinity);
    d[src] = 0;
    const q = [src];
    for (let h = 0; h < q.length; h++) {
      const u = q[h];
      for (const v of R[u].nb) if (d[v] === Infinity) { d[v] = d[u] + 1; q.push(v); }
    }
    return d;
  }
  const DIST = R.map((_, i) => bfs(i));
  // Naxçıvan is its own connected component
  const NAKH = new Set(R.map((_, i) => i).filter((i) => DIST[R.findIndex((r) => r.en === "Nakhchivan")][i] < Infinity));

  // Path from a to b that needs the fewest districts outside `have` (0-1 BFS).
  function cheapestPath(a, b, have) {
    const cost = new Array(N).fill(Infinity), prev = new Array(N).fill(-1);
    cost[a] = 0;
    const dq = [a];
    while (dq.length) {
      const u = dq.shift();
      for (const v of R[u].nb) {
        const w = v === b || have.has(v) ? 0 : 1;
        if (cost[u] + w < cost[v]) {
          cost[v] = cost[u] + w; prev[v] = u;
          w ? dq.push(v) : dq.unshift(v);
        }
      }
    }
    const path = [];
    for (let v = b; v !== -1; v = prev[v]) path.unshift(v);
    return path;
  }

  function connected(a, b, have) {
    const seen = new Set([a]);
    const q = [a];
    for (let h = 0; h < q.length; h++) {
      for (const v of R[q[h]].nb) {
        if (v === b) return true;
        if (have.has(v) && !seen.has(v)) { seen.add(v); q.push(v); }
      }
    }
    return false;
  }

  // ---------- names ----------
  const norm = (s) =>
    s.toLocaleLowerCase("az").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/ə/g, "e").replace(/ı/g, "i").replace(/ş/g, "s").replace(/ç/g, "c").replace(/ğ/g, "g")
      .replace(/sh/g, "s").replace(/ch/g, "c").replace(/kh/g, "x").replace(/gh/g, "g")
      .replace(/[^a-z]/g, "");
  const KEYS = R.map((r) => [norm(r.name), norm(r.en)]);
  const byName = new Map();
  R.forEach((r, i) => KEYS[i].forEach((k) => byName.set(k, i)));

  function suggest(text) {
    const q = norm(text);
    if (!q) return [];
    const starts = [], contains = [];
    R.forEach((r, i) => {
      if (KEYS[i].some((k) => k.startsWith(q))) starts.push(i);
      else if (KEYS[i].some((k) => k.includes(q))) contains.push(i);
    });
    const cmp = (a, b) => R[a].name.localeCompare(R[b].name, "az");
    return [...starts.sort(cmp), ...contains.sort(cmp)].slice(0, 7);
  }

  // ---------- storage (best effort) ----------
  const store = {
    get(k, fallback) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } },
  };

  // ---------- difficulty ----------
  // `min`/`max` bound the start→end graph distance; `orange: false` shows "close" guesses as far.
  const LEVELS = {
    easy: { label: "Asan", extra: 5, min: 3, max: 4, borders: true, orange: true },
    normal: { label: "Orta", extra: 3, min: 3, max: 6, borders: false, orange: true },
    hard: { label: "Çətin", extra: 1, min: 5, max: 9, borders: false, orange: false },
  };
  let level = LEVELS[store.get("seyyah-level", "normal")] ? store.get("seyyah-level", "normal") : "normal";

  const pairCache = {};
  function pairsFor(lv) {
    if (pairCache[lv]) return pairCache[lv];
    const { min, max } = LEVELS[lv], out = [];
    for (let a = 0; a < N; a++)
      for (let b = 0; b < N; b++)
        if (a !== b && DIST[a][b] >= min && DIST[a][b] <= max) out.push([a, b]);
    return (pairCache[lv] = out);
  }

  // ---------- random ----------
  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const todayKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dayNumber = (key) => Math.round((Date.parse(key + "T00:00:00Z") - EPOCH) / 86400000) + 1;
  // the daily puzzle is always played at normal difficulty so everyone gets the same one
  const dailyPair = (key) => {
    const pairs = pairsFor("normal");
    return pairs[Math.floor(mulberry32(dayNumber(key) * 7919)() * pairs.length)];
  };
  function randomPair(lv) {
    const pairs = pairsFor(lv);
    let pair;
    do pair = pairs[Math.floor(Math.random() * pairs.length)];
    while (game && pairs.length > 1 && pair[0] === game.start && pair[1] === game.end);
    return pair;
  }

  // ---------- profile: stats, collection, badges ----------
  const defaultProfile = () => ({
    modes: {
      random: { played: 0, won: 0, streak: 0, best: 0 },
      daily: { played: 0, won: 0, streak: 0, best: 0, lastDay: null, lastWin: null },
      speed: { played: 0, best: 0, routes: 0 },
    },
    dist: {}, // winning guess count → games
    wins: 0, perfect: 0, hintless: 0, hardWins: 0, nakhWin: false,
    visited: [], badges: {},
  });
  function loadProfile() {
    const base = defaultProfile();
    const p = store.get("seyyah-profile", null);
    if (p) {
      for (const m of Object.keys(base.modes)) base.modes[m] = Object.assign(base.modes[m], p.modes && p.modes[m]);
      const { modes, ...rest } = p;
      return Object.assign(base, rest, { modes: base.modes });
    }
    // carry over the daily stats kept before profiles existed
    const old = store.get("seyyah-stats", null);
    if (old) Object.assign(base.modes.daily, old);
    if (old && old.won) base.wins = old.won;
    return base;
  }
  let profile = loadProfile();
  const saveProfile = () => store.set("seyyah-profile", profile);

  const BADGES = [
    { id: "first", icon: "🥾", name: "İlk addım", desc: "İlk marşrutu tamamla", test: (p) => p.wins >= 1 },
    { id: "perfect", icon: "🎯", name: "Mükəmməl", desc: "Ən qısa yolu artıq addımsız tap", test: (p) => p.perfect >= 1 },
    { id: "perfect10", icon: "💎", name: "Dəqiq naviqator", desc: "10 mükəmməl marşrut", test: (p) => p.perfect >= 10 },
    { id: "streak3", icon: "🔥", name: "Seriya 3", desc: "Ard-arda 3 qələbə", test: (p) => Math.max(p.modes.random.best, p.modes.daily.best) >= 3 },
    { id: "streak7", icon: "⚡", name: "Seriya 7", desc: "Ard-arda 7 qələbə", test: (p) => Math.max(p.modes.random.best, p.modes.daily.best) >= 7 },
    { id: "explore25", icon: "🧭", name: "Kəşfiyyatçı", desc: "25 rayon kəşf et", test: (p) => p.visited.length >= 25 },
    { id: "explore50", icon: "🗺️", name: "Bələdçi", desc: "50 rayon kəşf et", test: (p) => p.visited.length >= 50 },
    { id: "explore74", icon: "🏔️", name: "Böyük Səyyah", desc: `Bütün ${N} rayonu kəşf et`, test: (p) => p.visited.length >= N },
    { id: "nakh", icon: "🏛️", name: "Naxçıvan səyyahı", desc: "Naxçıvanda marşrut tamamla", test: (p) => p.nakhWin },
    { id: "hintless10", icon: "🧠", name: "Yaddaş ustası", desc: "İpucusuz 10 qələbə", test: (p) => p.hintless >= 10 },
    { id: "hard", icon: "⛰️", name: "Dağ keçidi", desc: "Çətin səviyyədə qalib gəl", test: (p) => p.hardWins >= 1 },
    { id: "speed8", icon: "🏎️", name: "Sürət ustası", desc: "Sürət rejimində 8+ xal", test: (p) => p.modes.speed.best >= 8 },
  ];

  // ---------- sound + haptics ----------
  const SOUNDS = Object.fromEntries(
    ["correct", "error", "victory", "defeat"].map((n) => [n, new Audio(`audio/${n}.mp3`)])
  );
  Object.values(SOUNDS).forEach((a) => { a.preload = "auto"; });
  const VIBES = { correct: [25], error: [70], victory: [40, 60, 40, 60, 120], defeat: [220] };
  let soundOn = store.get("seyyah-sound", true);
  function play(name) {
    if (!soundOn) return; // the sound toggle mutes vibration too
    if (navigator.vibrate) navigator.vibrate(VIBES[name]);
    for (const other of Object.values(SOUNDS)) other.pause(); // never overlap two sounds
    const a = SOUNDS[name];
    a.currentTime = 0; // restart if the previous guess is still playing
    a.play().catch(() => { /* autoplay blocked or file missing: stay silent */ });
  }

  // ---------- state ----------
  // game: {mode, level, start, end, guesses:[id], trail:[id | -1 for a hint], hints,
  //        hintTarget, hintStep, done, won, gaveUp, day}
  let game = null;
  const speed = { running: false, endsAt: 0, score: 0, routes: 0, timer: 0, newRecord: false };
  let lastOutcome = "route"; // which result the outcome modal is showing: "route" | "speed"

  function newGame(mode, start, end, day) {
    game = {
      mode, level: mode === "daily" ? "normal" : level, start, end,
      guesses: [], trail: [], hints: 0, hintTarget: null, hintStep: 0,
      done: false, won: false, gaveUp: false, day: day || null,
    };
    applyLevelView();
    render(true);
  }

  const shortest = () => DIST[game.start][game.end] - 1;
  const maxGuesses = () => shortest() + LEVELS[game.level].extra;
  const usedCount = () => game.guesses.length + game.hints; // a hint costs one try

  function rate(g) {
    const extra = DIST[game.start][g] + DIST[g][game.end] - DIST[game.start][game.end];
    return extra === 0 ? "green" : extra === 1 ? "orange" : "red";
  }
  // what the player sees: hard mode hides "close"
  const displayRate = (g) => {
    const r = rate(g);
    return r === "orange" && !LEVELS[game.level].orange ? "red" : r;
  };

  function submitGuess(id) {
    if (game.done) return;
    if (id === undefined) return reject("Belə rayon tapılmadı.");
    if (id === game.start || id === game.end) return reject(`${R[id].name} artıq marşrutdadır.`);
    if (game.guesses.includes(id)) return reject(`${R[id].name} artıq təxmin edilib.`);
    game.guesses.push(id);
    game.trail.push(id);
    const have = new Set(game.guesses);
    if (connected(game.start, game.end, have)) finish(true);
    else if (usedCount() >= maxGuesses()) finish(false);
    const r = displayRate(id);

    if (game.mode === "speed") {
      render(false, id);
      if (!game.done) return r === "green" ? play("correct") : r === "red" ? play("error") : undefined;
      // speed rounds roll straight into the next route instead of opening the result card
      if (game.won) {
        const pts = game.guesses.length === shortest() && !game.hints ? 2 : 1;
        speed.score += pts; speed.routes++;
        $("speedScore").textContent = speed.score;
        play("correct");
        toast(pts === 2 ? "Mükəmməl! +2 xal" : "+1 xal");
      } else {
        play("error");
        toast("Cəhdlər bitdi — növbəti marşrut", true);
      }
      setTimeout(() => speed.running && nextSpeedRoute(), game.won ? 650 : 1100);
      return;
    }

    // the guess that ends the game plays victory/defeat instead of its own sound;
    // otherwise green → correct, red → error, orange ("close") stays silent
    if (game.done) play(game.won ? "victory" : "defeat");
    else if (r === "green") play("correct");
    else if (r === "red") play("error");
    save();
    render(false, id);
    if (game.done) setTimeout(showOutcome, 650); // let the map paint the last guess first
  }

  function finish(won, gaveUp = false) {
    game.done = true; game.won = won; game.gaveUp = gaveUp;
    recordRoute();
  }

  // fold a finished route into the profile, then award any badges it unlocked
  function recordRoute() {
    const p = profile, used = usedCount();
    if (game.mode === "daily") {
      const d = p.modes.daily;
      if (d.lastDay === game.day) return; // already counted today's puzzle
      d.played++; d.lastDay = game.day;
      if (game.won) {
        d.won++;
        d.streak = d.lastWin && dayNumber(game.day) - dayNumber(d.lastWin) === 1 ? d.streak + 1 : 1;
        d.lastWin = game.day; d.best = Math.max(d.best, d.streak);
      } else d.streak = 0;
    } else if (game.mode === "random") {
      const m = p.modes.random;
      m.played++;
      if (game.won) { m.won++; m.streak++; m.best = Math.max(m.best, m.streak); } else m.streak = 0;
    }
    if (game.won) {
      p.wins++;
      if (game.mode !== "speed") p.dist[used] = (p.dist[used] || 0) + 1;
      if (game.guesses.length === shortest() && !game.hints) p.perfect++;
      if (!game.hints) p.hintless++;
      if (game.level === "hard") p.hardWins++;
      if (NAKH.has(game.start)) p.nakhWin = true;
      const seen = new Set(p.visited);
      [game.start, game.end, ...game.guesses].forEach((v) => seen.add(v));
      p.visited = [...seen];
    }
    saveProfile();
    checkBadges();
  }

  function save() {
    if (game.mode === "daily") store.set("seyyah-daily", game);
  }

  // ---------- hints ----------
  // 1st press: first letter of the next missing district; 2nd press on the same one: its outline
  function useHint() {
    if (game.done || game.mode === "speed") return;
    if (maxGuesses() - usedCount() <= 1) return reject("Son cəhdi ipucuya xərcləmək olmaz.");
    const target = missingOnPath()[0];
    if (target === undefined) return;
    if (game.hintTarget === target && game.hintStep === 1) {
      game.hintStep = 2;
      toast("İpucu: axtardığın rayon xəritədə işarələndi");
    } else {
      game.hintTarget = target; game.hintStep = 1;
      toast(`İpucu: “${R[target].name[0]}” hərfi ilə başlayır · ${R[target].name.length} hərf`);
    }
    game.hints++;
    game.trail.push(-1);
    save();
    render(false);
  }

  // ---------- map ----------
  const paths = [];
  const labelLayer = document.createElementNS(SVGNS, "g");
  labelLayer.setAttribute("class", "labels");
  const landLayer = document.createElementNS(SVGNS, "g");
  landLayer.setAttribute("class", "land");
  const onLayer = document.createElementNS(SVGNS, "g"); // revealed regions, lifted above the rest
  const pinLayer = document.createElementNS(SVGNS, "g"); // markers for regions too small to see
  // Cities like Xankəndi or Sumqayıt are only a few screen pixels across when the map is zoomed
  // out, and their label halo would cover them. Whether a region counts as small is decided per
  // zoom from its real area (a bbox can't tell a thin coastal strip from a solid block).
  const UNITS_PER_DEG2 = Math.cos((40.2 * Math.PI) / 180) * 160 * 160; // matches tools/build-data.js
  const SIZE = R.map((r) => Math.sqrt(r.area * UNITS_PER_DEG2)); // side of an equal-area square
  const SMALL_PX = 24; // below this on-screen size a region gets a pin
  const PIN_PX = 10; // on-screen pin radius
  const LABEL_INSIDE_PX = 60; // regions smaller than this get their label above, not on top
  // draw big regions first so enclave cities stay visible on top
  const ORDER = R.map((_, i) => i).sort((a, b) => R[b].area - R[a].area);

  // Gradient stops read CSS custom properties, so both themes restyle the map.
  const GRADIENTS = {
    "g-start": ["--start-a", "--start"],
    "g-end": ["--end-a", "--end"],
    "g-green": ["--green-a", "--green"],
    "g-orange": ["--orange-a", "--orange"],
    "g-red": ["--red-a", "--red"],
    "g-reveal": ["--reveal-a", "--reveal"],
  };
  function buildDefs() {
    const grad = (id, [a, b], attrs) =>
      `<linearGradient id="${id}" ${attrs}><stop offset="0" style="stop-color:var(${a})"/><stop offset="1" style="stop-color:var(${b})"/></linearGradient>`;
    const defs = document.createElementNS(SVGNS, "defs");
    defs.innerHTML =
      grad("g-land", ["--land-a", "--land-b"], `gradientUnits="userSpaceOnUse" x1="0" y1="${MAP.height}" x2="${MAP.width}" y2="0"`) +
      Object.entries(GRADIENTS).map(([id, stops]) => grad(id, stops, 'x1="0" y1="0" x2="1" y2="1"')).join("") +
      `<filter id="lift" x="-30%" y="-30%" width="160%" height="160%">
         <feDropShadow dx="0" dy="1.6" stdDeviation="2.2" style="flood-color:var(--shade)"/>
       </filter>
       <filter id="coast" x="-5%" y="-5%" width="110%" height="110%">
         <feDropShadow dx="0" dy="2" stdDeviation="3.5" style="flood-color:var(--shade)" flood-opacity="0.6"/>
       </filter>`;
    return defs;
  }

  function buildMap() {
    for (const i of ORDER) {
      const p = document.createElementNS(SVGNS, "path");
      p.setAttribute("d", R[i].d);
      p.setAttribute("class", "r");
      paths[i] = p;
      landLayer.appendChild(p);
    }
    svg.append(buildDefs(), landLayer, onLayer, pinLayer, labelLayer);
  }

  const FULL = [0, 0, MAP.width, MAP.width / ASPECT];
  FULL[1] = (MAP.height - FULL[3]) / 2;
  let vb = FULL.slice();
  let anim = 0;
  let shownIds = [];

  function fitBox(ids) {
    let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const i of ids) {
      const b = R[i].bbox;
      x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
    }
    let w = x1 - x0, h = y1 - y0;
    const pad = Math.max(w, h) * 0.35 + 30;
    w += pad * 2; h += pad * 2;
    if (w / h < ASPECT) w = h * ASPECT; else h = w / ASPECT;
    w = Math.max(w, 260); h = w / ASPECT;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  }
  function setView(box) {
    vb = box;
    svg.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
    sizeLabels();
  }
  function zoomTo(target, dur = 650) {
    cancelAnimationFrame(anim);
    if (reduceMotion()) dur = 0;
    const from = vb.slice(), t0 = performance.now();
    const step = () => {
      const t = dur ? Math.min(1, (performance.now() - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      setView(from.map((v, k) => v + (target[k] - v) * e));
      if (t < 1) anim = requestAnimationFrame(step);
    };
    step();
  }
  // zoom keeping the svg point (px, py) fixed on screen
  function zoomAround(factor, px, py) {
    const w = Math.min(FULL[2] * 1.6, Math.max(120, vb[2] * factor));
    const k = w / vb[2];
    return [px - (px - vb[0]) * k, py - (py - vb[1]) * k, w, w / ASPECT];
  }
  function svgPoint(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return [vb[0] + ((clientX - r.left) / r.width) * vb[2], vb[1] + ((clientY - r.top) / r.height) * vb[3]];
  }
  function sizeLabels() {
    const upp = vb[2] / (svg.clientWidth || 720); // map units per screen pixel
    const fs = 12.5 * upp; // a fixed ~12.5 screen px whatever the zoom or screen width
    const small = (i) => SIZE[i] / upp < SMALL_PX;
    const pinR = PIN_PX * upp;
    // Greedy de-overlap: pins are placed first, then labels in order (start/end first).
    // A label that hits something always steps *below* it, so it can't bounce between two obstacles.
    const placed = []; // boxes as centre + half sizes
    for (const g of pinLayer.children) {
      const on = small(+g.dataset.id);
      g.style.display = on ? "" : "none";
      if (!on) continue;
      for (const c of g.children) c.setAttribute("r", pinR.toFixed(2));
      placed.push({ x: +g.dataset.x, y: +g.dataset.y, hw: pinR, hh: pinR });
    }
    for (const t of labelLayer.children) {
      t.setAttribute("font-size", fs.toFixed(2));
      t.setAttribute("stroke-width", (fs * 0.24).toFixed(2));
      const id = +t.dataset.id;
      const x = +t.dataset.x, hw = (t.textContent.length * fs * 0.6) / 2, hh = fs * 0.6;
      // small cities: sit above the pin instead of on top of it
      // medium regions (still smaller than their own label): sit just above the shape
      let y = small(id) ? +t.dataset.y - pinR - fs * 0.8
        : SIZE[id] / upp < LABEL_INSIDE_PX ? R[id].bbox[1] - fs * 0.7
        : +t.dataset.y;
      for (let tries = 0; tries < 8; tries++) {
        const hit = placed.find((p) => Math.abs(p.x - x) < p.hw + hw && Math.abs(p.y - y) < p.hh + hh);
        if (!hit) break;
        y = hit.y + hit.hh + hh + fs * 0.1;
      }
      placed.push({ x, y, hw, hh });
      t.setAttribute("x", x);
      t.setAttribute("y", y.toFixed(2));
    }
  }

  function drawMap(fresh) {
    const have = new Set(game.guesses);
    const reveal = new Set();
    if (game.done && !game.won) {
      for (const v of cheapestPath(game.start, game.end, have)) if (!have.has(v)) reveal.add(v);
    }
    // a second-level hint outlines the district without naming it
    const hintId = game.hintStep === 2 && !game.done && !have.has(game.hintTarget) ? game.hintTarget : null;
    shownIds = [game.start, game.end, ...game.guesses, ...reveal];
    if (hintId !== null) shownIds.push(hintId);
    const state = (i) =>
      i === game.start ? "start" : i === game.end ? "end" : have.has(i) ? displayRate(i)
        : reveal.has(i) ? "reveal" : i === hintId ? "hint" : "";
    paths.forEach((p, i) => {
      const s = state(i);
      p.setAttribute("class", "r" + (s ? " on " + s : "") + (i === fresh ? " fresh" : ""));
    });
    // re-append in area order so enclaves stay above their host in both layers
    for (const i of ORDER) (paths[i].classList.contains("on") ? onLayer : landLayer).appendChild(paths[i]);

    // every shown region gets a pin; sizeLabels only displays the ones too small at this zoom
    pinLayer.replaceChildren(...shownIds.map((i) => {
      // a pulsing halo behind a solid dot, both in the region's state color
      const g = document.createElementNS(SVGNS, "g");
      g.setAttribute("class", `pin-wrap ${state(i)}${i === fresh ? " fresh" : ""}`);
      g.dataset.id = i;
      g.dataset.x = R[i].label[0];
      g.dataset.y = R[i].label[1];
      for (const cls of ["pulse", "pin"]) {
        const c = document.createElementNS(SVGNS, "circle");
        c.setAttribute("class", cls);
        c.setAttribute("cx", R[i].label[0]);
        c.setAttribute("cy", R[i].label[1]);
        g.appendChild(c);
      }
      return g;
    }));
    labelLayer.replaceChildren(...shownIds.filter((i) => i !== hintId).map((i) => {
      const t = document.createElementNS(SVGNS, "text");
      t.dataset.x = R[i].label[0];
      t.dataset.y = R[i].label[1];
      t.dataset.id = i;
      t.textContent = R[i].name;
      return t;
    }));
    zoomTo(fitBox(shownIds));
  }

  // ---------- UI ----------
  const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const LABELS = { green: "ən qısa yolda", orange: "yaxındır", red: "uzaqdır" };
  const MODE_LABELS = { random: "Təsadüfi oyun", daily: "Günün oyunu", speed: "Sürət rejimi" };

  function missingOnPath() {
    return cheapestPath(game.start, game.end, new Set(game.guesses))
      .filter((v) => v !== game.start && v !== game.end && !game.guesses.includes(v));
  }

  function render(reset, fresh) {
    const used = usedCount();
    const isSpeed = game.mode === "speed";
    const idle = isSpeed && !speed.running; // speed mode waiting for "Başla"
    $("modeLabel").textContent = MODE_LABELS[game.mode] + (game.mode === "daily" ? ` #${dayNumber(game.day)}` : "");
    $("shortBadge").textContent = `Ən qısa: ${shortest()} rayon`;
    $("startName").textContent = R[game.start].name;
    $("endName").textContent = R[game.end].name;
    $("hintStart").textContent = R[game.start].name;
    $("hintEnd").textContent = R[game.end].name;
    $("triesText").textContent = `${used} / ${maxGuesses()}`;
    $("levelText").textContent = LEVELS[game.level].label;
    $("levelBtn").disabled = game.mode === "daily" || speed.running;
    $("levelBtn").title = game.mode === "daily" ? "Günün oyunu həmişə Orta səviyyədədir" : "Çətinliyi dəyiş";

    $("pips").replaceChildren(...Array.from({ length: maxGuesses() }, (_, k) => {
      const i = document.createElement("i");
      const t = game.trail[k];
      i.className = "pip" + (t === undefined ? "" : t === -1 ? " hint" : " " + displayRate(t));
      return i;
    }));

    $("guessList").replaceChildren(...game.guesses.map((g, k) => {
      const li = document.createElement("li");
      const c = displayRate(g);
      li.className = c + (g === fresh ? " new" : "");
      li.innerHTML = `<span class="n">${k + 1}</span><span class="name"></span><span class="tag">${LABELS[c]}</span>`;
      li.querySelector(".name").textContent = R[g].name;
      return li;
    }).reverse());
    $("emptyHint").hidden = game.guesses.length > 0;
    $("guessCount").textContent = game.guesses.length ? `${game.guesses.length} rayon` : "";

    const input = $("guessInput");
    input.disabled = game.done || idle;
    document.querySelector(".command-go").disabled = game.done || idle;
    $("panelFoot").hidden = game.done || idle;
    resetGiveUp();
    const hint = $("hintBtn");
    hint.hidden = isSpeed;
    hint.disabled = maxGuesses() - used <= 1;
    hint.querySelector("span").textContent =
      game.hintStep === 1 && missingOnPath()[0] === game.hintTarget ? "Xəritədə göstər" : "İpucu";

    $("timer").hidden = !speed.running;
    $("speedStart").hidden = !idle;
    $("speedBest").textContent = profile.modes.speed.best ? `Rekordun: ${profile.modes.speed.best} xal` : "";

    const bar = $("doneBar");
    bar.hidden = !game.done || isSpeed;
    if (game.done && !isSpeed) {
      bar.className = "card done-bar " + (game.won ? "win" : "lose");
      $("doneTitle").textContent = game.won ? "Marşrut tamamlandı" : game.gaveUp ? "Təslim oldun" : "Cəhdlər bitdi";
      $("doneText").textContent = game.won
        ? `${used} cəhdlə çatdın`
        : "Çatışmayan: " + missingOnPath().map((v) => R[v].name).join(", ");
    }
    renderStats();
    drawMap(fresh);
    if (reset) input.value = "";
  }

  // compact daily stats under the panel
  function renderStats() {
    const el = $("stats");
    el.hidden = game.mode !== "daily";
    if (el.hidden) return;
    const s = profile.modes.daily;
    const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
    el.innerHTML =
      `<div><b>${s.played}</b>oyun</div><div><b>${pct}%</b>qələbə</div>` +
      `<div><b>${s.streak}</b>seriya</div><div><b>${s.best}</b>rekord</div>`;
  }

  function shareText() {
    if (lastOutcome === "speed") return `Səyyah ⚡ Sürət rejimi (${LEVELS[level].label})\n${speed.score} xal · ${speed.routes} marşrut`;
    const sq = { green: "🟩", orange: "🟧", red: "🟥" };
    const head = game.mode === "daily" ? `Səyyah #${dayNumber(game.day)}` : `Səyyah · ${LEVELS[game.level].label}`;
    const score = game.won ? `${usedCount()}/${maxGuesses()}` : "X/" + maxGuesses();
    return `${head} ${R[game.start].name} → ${R[game.end].name}\n${score} (ən qısa ${shortest()})\n` +
      game.trail.map((t) => (t === -1 ? "💡" : sq[displayRate(t)])).join("");
  }

  // ---------- toast ----------
  // badge announcements queue up behind each other; ordinary toasts just replace what is showing
  const toastQueue = [];
  let toastBusy = false;
  const toast = (text, error) => showToast(text, error);
  let toastTimer = 0;
  function showToast(text, error, ms = 2200) {
    const el = $("toast");
    el.textContent = text;
    el.classList.toggle("error", !!error);
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.classList.remove("show"); toastBusy = false; drainToasts(); }, ms);
  }
  function queueToast(text) {
    toastQueue.push(text);
    drainToasts();
  }
  function drainToasts() {
    if (toastBusy || !toastQueue.length) return;
    toastBusy = true;
    showToast(toastQueue.shift(), false, 2800);
    if (!reduceMotion()) confetti(70);
  }
  function reject(text) {
    toast(text, true);
    const f = $("guessForm");
    f.classList.remove("shake");
    void f.offsetWidth; // restart the animation
    f.classList.add("shake");
  }
  async function copyResult() {
    try { await navigator.clipboard.writeText(shareText()); toast("Nəticə kopyalandı"); }
    catch { toast(shareText()); }
  }

  function checkBadges() {
    for (const b of BADGES) {
      if (profile.badges[b.id] || !b.test(profile)) continue;
      profile.badges[b.id] = Date.now();
      // let the outcome card open first, then announce
      setTimeout(() => queueToast(`🏅 Yeni nişan: ${b.icon} ${b.name}`), 1200);
    }
    saveProfile();
  }

  // ---------- share image ----------
  async function shareImage() {
    const btn = $("outImage");
    btn.disabled = true;
    try {
      const data = lastOutcome === "speed"
        ? { kind: "speed", title: speed.newRecord ? "Yeni rekord!" : "Sürət rejimi", score: `${speed.score} xal`,
            sub: `${speed.routes} marşrut · ${LEVELS[level].label}`, shown: [] }
        : {
            kind: "route",
            title: `${R[game.start].name} → ${R[game.end].name}`,
            score: game.won ? `${usedCount()} / ${maxGuesses()} cəhd` : "Alınmadı",
            sub: game.won ? `Ən qısa yol: ${shortest()} rayon` : `Çatışmayan: ${missingOnPath().map((v) => R[v].name).join(", ")}`,
            emoji: shareText().split("\n").pop(),
            shown: shownIds.map((id) => ({ id, state: stateOf(id) })),
          };
      const blob = await window.SeyyahShare.render(data, document.querySelector(".hiker"));
      const file = new File([blob], "seyyah-netice.png", { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText() }).catch(() => {});
      } else {
        const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: file.name });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast("Şəkil yükləndi");
      }
    } catch (e) {
      toast("Şəkil yaradıla bilmədi", true);
    } finally {
      btn.disabled = false;
    }
  }
  // the same state names the map uses, for the share image
  function stateOf(i) {
    if (i === game.start) return "start";
    if (i === game.end) return "end";
    if (game.guesses.includes(i)) return displayRate(i);
    return game.done && !game.won ? "reveal" : "hint";
  }

  // ---------- modals ----------
  function openModal(id) {
    const m = $(id);
    m.classList.remove("closing");
    m.hidden = false;
  }
  function closeModal(id, then) {
    const m = $(id);
    if (m.hidden || m.classList.contains("closing")) return;
    m.classList.add("closing");
    setTimeout(() => { m.hidden = true; m.classList.remove("closing"); then && then(); }, 220);
  }

  function countUp(el, to, suffix = "") {
    if (reduceMotion()) { el.textContent = to + suffix; return; }
    const t0 = performance.now(), dur = 700;
    const step = () => {
      const t = Math.min(1, (performance.now() - t0) / dur);
      el.textContent = Math.round(to * (1 - Math.pow(1 - t, 3))) + suffix;
      if (t < 1) requestAnimationFrame(step);
    };
    step();
  }
  function fillOutStats(cells) {
    $("outStats").innerHTML = cells.map(([n, label, s = ""]) => `<div><b data-n="${n}" data-s="${s}"></b><span>${label}</span></div>`).join("");
    $("outStats").querySelectorAll("b").forEach((b) => countUp(b, +b.dataset.n, b.dataset.s));
  }

  function showOutcome() {
    lastOutcome = "route";
    const won = game.won;
    const used = usedCount();
    const greens = game.guesses.filter((g) => rate(g) === "green").length;
    const accuracy = game.guesses.length ? Math.round((greens / game.guesses.length) * 100) : 0;
    const path = cheapestPath(game.start, game.end, new Set(game.guesses));
    const missing = missingOnPath();

    $("outcome").className = "modal " + (won ? "win" : "lose");
    $("outKicker").textContent = `${R[game.start].name} → ${R[game.end].name} · ${LEVELS[game.level].label}`;
    if (won) {
      const perfect = game.guesses.length === shortest() && !game.hints;
      $("outTitle").textContent = perfect ? "Mükəmməl marşrut!" : "Təyinat nöqtəsindəsən!";
      $("outSub").textContent = perfect
        ? "Ən qısa yolu heç bir artıq addım atmadan tapdın."
        : `Yolu ${used} cəhdlə tapdın — ən qısası ${shortest()} idi.` + (game.hints ? ` (${game.hints} ipucu)` : "");
    } else {
      $("outTitle").textContent = game.gaveUp ? "Bu dəfə alınmadı" : "Cəhdlər bitdi";
      $("outSub").textContent = `Çatışmayan: ${missing.map((v) => R[v].name).join(", ")}`;
    }
    fillOutStats([[used, `cəhd / ${maxGuesses()}`], [shortest(), "ən qısa yol"], [accuracy, "dəqiqlik", "%"]]);

    $("outRoute").hidden = false;
    $("outRoute").replaceChildren(...path.map((v, k) => {
      const li = document.createElement("li");
      li.style.animationDelay = 0.6 + k * 0.09 + "s";
      if (k) li.appendChild(Object.assign(document.createElement("i"), { className: "link" }));
      const chip = document.createElement("span");
      chip.className = "chip" + (v === game.start ? " start" : v === game.end ? " end" : missing.includes(v) ? " missing" : "");
      chip.textContent = R[v].name;
      li.appendChild(chip);
      return li;
    }));
    $("outAgainText").textContent = "Yeni oyun";

    openModal("outcome");
    $("outAgain").focus({ preventScroll: true });
    if (won && !reduceMotion()) confetti();
  }

  function showSpeedOutcome() {
    lastOutcome = "speed";
    const good = speed.score > 0;
    $("outcome").className = "modal " + (good ? "win" : "lose");
    $("outKicker").textContent = `Sürət rejimi · ${LEVELS[level].label}`;
    $("outTitle").textContent = speed.newRecord ? "Yeni rekord!" : "Vaxt bitdi!";
    $("outSub").textContent = good
      ? `${SPEED_SECONDS} saniyədə ${speed.routes} marşrut tamamladın.`
      : "Bu dəfə heç bir marşrut tamamlanmadı. Yenə cəhd et!";
    fillOutStats([[speed.score, "xal"], [speed.routes, "marşrut"], [profile.modes.speed.best, "rekord"]]);
    $("outRoute").hidden = true;
    $("outAgainText").textContent = "Yenidən oyna";
    openModal("outcome");
    $("outAgain").focus({ preventScroll: true });
    if (speed.newRecord && good && !reduceMotion()) confetti();
  }

  function confetti(count = 160) {
    const cv = $("confetti");
    // badge confetti can fire while no modal is open; borrow the outcome canvas on top of everything
    cv.classList.toggle("floating", $("outcome").hidden);
    const ctx = cv.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const W = (cv.width = innerWidth * dpr), H = (cv.height = innerHeight * dpr);
    const css = getComputedStyle(document.documentElement);
    const colors = ["--green", "--brand", "--start", "--end", "--orange"].map((v) => css.getPropertyValue(v).trim());
    const parts = Array.from({ length: count }, (_, i) => {
      // two cannons in the lower corners, aimed up and inwards
      const dir = i % 2 ? 1 : -1;
      const tilt = 0.15 + Math.random() * 0.5; // radians away from vertical
      const speedV = (14 + Math.random() * 10) * dpr;
      return {
        x: dir > 0 ? W * 0.1 : W * 0.9, y: H,
        vx: dir * Math.sin(tilt) * speedV, vy: -Math.cos(tilt) * speedV,
        w: (5 + Math.random() * 6) * dpr, h: (8 + Math.random() * 8) * dpr,
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.35,
        flip: Math.random() * Math.PI, vf: 0.08 + Math.random() * 0.12,
        color: colors[i % colors.length],
      };
    });
    const t0 = performance.now();
    const frame = () => {
      ctx.clearRect(0, 0, W, H);
      const age = (performance.now() - t0) / 1000;
      for (const p of parts) {
        p.vy += 0.32 * dpr; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.flip += p.vf;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - Math.max(0, age - 2) / 1.2);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.scale(1, Math.cos(p.flip));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < 3.2) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, W, H); cv.classList.remove("floating"); }
    };
    requestAnimationFrame(frame);
  }

  // ---------- stats & achievements modal ----------
  function renderStatsModal() {
    const p = profile, m = p.modes;
    const pct = (s) => (s.played ? Math.round((s.won / s.played) * 100) : 0);
    const row = (title, cells) =>
      `<div class="stat-group"><h3>${title}</h3><div class="stat-grid">${cells
        .map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div></div>`;
    const dist = Object.entries(p.dist).map(([k, v]) => [+k, v]).sort((a, b) => a[0] - b[0]);
    const top = Math.max(1, ...dist.map(([, v]) => v));
    $("panelStats").innerHTML =
      row("Təsadüfi", [[m.random.played, "oyun"], [pct(m.random) + "%", "qələbə"], [m.random.streak, "seriya"], [m.random.best, "rekord"]]) +
      row("Günün oyunu", [[m.daily.played, "oyun"], [pct(m.daily) + "%", "qələbə"], [m.daily.streak, "seriya"], [m.daily.best, "rekord"]]) +
      row("Sürət", [[m.speed.played, "oyun"], [m.speed.best, "rekord xal"], [m.speed.routes, "marşrut"], [p.perfect, "mükəmməl"]]) +
      `<div class="stat-group"><h3>Qələbə üçün cəhd sayı</h3>${
        dist.length
          ? `<div class="dist">${dist.map(([k, v]) =>
              `<div class="dist-row"><span>${k}</span><i style="--w:${Math.max(8, (v / top) * 100)}%"><b>${v}</b></i></div>`).join("")}</div>`
          : `<p class="empty">Hələ qələbə yoxdur — ilk marşrutu tamamla!</p>`
      }</div>`;

    const seen = new Set(p.visited);
    $("panelCollection").innerHTML =
      `<div class="collect-head"><b>${seen.size}</b> / ${N} rayon kəşf edildi</div>
       <div class="collect-bar"><i style="--w:${(seen.size / N) * 100}%"></i></div>
       <svg class="collect-map" viewBox="${FULL.join(" ")}" role="img" aria-label="Kəşf edilmiş rayonlar">${ORDER
         .map((i) => `<path d="${R[i].d}" class="${seen.has(i) ? "v" : ""}"><title>${seen.has(i) ? R[i].name : "?"}</title></path>`)
         .join("")}</svg>
       <p class="muted small">Qalib gəldiyin marşrutlardakı bütün rayonlar kolleksiyana düşür.</p>`;

    const got = BADGES.filter((b) => p.badges[b.id]).length;
    $("panelBadges").innerHTML =
      `<div class="collect-head"><b>${got}</b> / ${BADGES.length} nişan</div><div class="badge-grid">${BADGES.map((b) => {
        const at = p.badges[b.id];
        return `<div class="badge-card${at ? " got" : ""}"><span class="badge-icon">${at ? b.icon : "🔒"}</span>
          <b>${b.name}</b><small>${b.desc}</small>${at ? `<em>${new Date(at).toLocaleDateString("az")}</em>` : ""}</div>`;
      }).join("")}</div>`;
  }
  function showTab(name) {
    document.querySelectorAll("#statsModal [role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    document.querySelectorAll("#statsModal .tab-panel").forEach((p) => { p.hidden = p.dataset.panel !== name; });
  }

  // ---------- give up / skip ----------
  let giveUpTimer = 0;
  function resetGiveUp() {
    clearTimeout(giveUpTimer);
    const b = $("giveUpBtn");
    b.classList.remove("confirm");
    b.querySelector("span").textContent = game && game.mode === "speed" ? "Keç" : "Təslim ol";
    b.querySelector("use").setAttribute("href", game && game.mode === "speed" ? "#i-skip" : "#i-flag");
  }
  function giveUp() {
    if (game.done) return;
    if (game.mode === "speed") return nextSpeedRoute(); // skipping costs nothing but the time spent
    const b = $("giveUpBtn");
    if (!b.classList.contains("confirm")) {
      b.classList.add("confirm");
      b.querySelector("span").textContent = "Əminsən? Bəli";
      giveUpTimer = setTimeout(resetGiveUp, 3000);
      return;
    }
    finish(false, true); save(); render();
    play("defeat");
    setTimeout(showOutcome, 300);
  }

  // ---------- autocomplete ----------
  let acItems = [], acIndex = -1;
  function showAc() {
    const list = $("acList");
    acItems = suggest($("guessInput").value);
    acIndex = acItems.length ? 0 : -1;
    list.replaceChildren(...acItems.map((id, k) => {
      const li = document.createElement("li");
      li.setAttribute("role", "option");
      li.innerHTML = "<span></span><kbd>Enter</kbd>";
      li.firstChild.textContent = R[id].name;
      if (k === acIndex) li.className = "active";
      li.addEventListener("mousedown", (e) => { e.preventDefault(); pick(id); });
      li.addEventListener("mouseenter", () => setAc(k));
      return li;
    }));
    list.hidden = !acItems.length;
    $("guessInput").setAttribute("aria-expanded", String(!list.hidden));
    placeAc();
  }
  // On phones the on-screen keyboard covers whatever is below the input, so open the list
  // upwards when there is more visible room above, and cap its height to the room it gets.
  function placeAc() {
    const list = $("acList");
    if (list.hidden) return;
    const vv = window.visualViewport;
    const viewTop = vv ? vv.offsetTop : 0;
    const viewBottom = vv ? vv.offsetTop + vv.height : innerHeight;
    const box = $("guessInput").getBoundingClientRect();
    const topbar = document.querySelector(".topbar").getBoundingClientRect().bottom;
    const below = viewBottom - box.bottom - 12;
    const above = box.top - Math.max(viewTop, topbar) - 12;
    list.style.maxHeight = "";
    const want = list.scrollHeight;
    const up = below < want && above > below;
    list.classList.toggle("up", up);
    list.style.maxHeight = Math.max(120, Math.min(want, up ? above : below)) + "px";
  }
  function setAc(k) {
    acIndex = k;
    [...$("acList").children].forEach((li, j) => li.classList.toggle("active", j === acIndex));
  }
  function hideAc() {
    $("acList").hidden = true;
    $("guessInput").setAttribute("aria-expanded", "false");
  }
  function pick(id) {
    const input = $("guessInput");
    // A guess changes the panel's height (the new row, the empty hint going away), which makes
    // the page jump. Keep the input exactly where the player's thumb is.
    const before = input.getBoundingClientRect().top;
    input.value = "";
    hideAc();
    acItems = [];
    submitGuess(id);
    const shift = input.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 0.5) window.scrollBy({ top: shift, behavior: "instant" });
    // scrolled to the very bottom and the page got shorter: grow a spacer so the scroll can hold
    const rest = input.getBoundingClientRect().top - before;
    if (rest > 0.5) {
      const layout = document.querySelector(".layout");
      layout.style.paddingBottom = parseFloat(getComputedStyle(layout).paddingBottom) + rest + "px";
      window.scrollBy({ top: rest, behavior: "instant" });
    }
    if (!game.done) input.focus({ preventScroll: true });
  }

  // ---------- modes ----------
  function startDaily() {
    const day = todayKey();
    const saved = store.get("seyyah-daily", null);
    if (saved && saved.day === day) {
      // saves from before hints/levels existed lack these fields
      game = Object.assign({ level: "normal", hints: 0, hintTarget: null, hintStep: 0, trail: saved.guesses.slice() }, saved);
      applyLevelView();
      render(true);
      return;
    }
    const [a, b] = dailyPair(day);
    newGame("daily", a, b, day);
    save();
  }
  function startRandom() {
    const [a, b] = randomPair(level);
    newGame("random", a, b);
  }

  // speed: a 90 s session of back-to-back random routes
  function enterSpeed() {
    stopSpeed();
    const [a, b] = randomPair(level);
    newGame("speed", a, b);
  }
  function startSpeed() {
    stopSpeed();
    Object.assign(speed, { running: true, score: 0, routes: 0, newRecord: false, endsAt: performance.now() + SPEED_SECONDS * 1000 });
    $("speedScore").textContent = "0";
    nextSpeedRoute();
    speed.timer = setInterval(tickSpeed, 100);
    tickSpeed();
  }
  function nextSpeedRoute() {
    if (!speed.running) return;
    const [a, b] = randomPair(level);
    newGame("speed", a, b);
    $("guessInput").focus({ preventScroll: true });
  }
  function tickSpeed() {
    const left = Math.max(0, speed.endsAt - performance.now());
    $("timerText").textContent = Math.ceil(left / 1000);
    $("timerFill").style.width = (left / (SPEED_SECONDS * 1000)) * 100 + "%";
    $("timer").classList.toggle("low", left < 10000);
    if (left <= 0) endSpeed();
  }
  function stopSpeed() {
    clearInterval(speed.timer);
    speed.running = false;
  }
  function endSpeed() {
    stopSpeed();
    game.done = true;
    const s = profile.modes.speed;
    s.played++; s.routes += speed.routes;
    speed.newRecord = speed.score > s.best;
    s.best = Math.max(s.best, speed.score);
    saveProfile();
    checkBadges();
    render(false);
    play(speed.score > 0 ? "victory" : "defeat");
    setTimeout(showSpeedOutcome, 300);
  }

  function moveThumb() {
    const active = document.querySelector(".mode.active");
    const thumb = document.querySelector(".seg-thumb");
    thumb.style.width = active.offsetWidth + "px";
    thumb.style.transform = `translateX(${active.offsetLeft}px)`;
  }
  function setMode(mode) {
    document.querySelectorAll(".mode").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    moveThumb();
    if (mode !== "speed") stopSpeed();
    if (mode === "daily") startDaily();
    else if (mode === "speed") enterSpeed();
    else startRandom();
  }

  // ---------- difficulty UI ----------
  let userBorders = store.get("seyyah-borders", false);
  const bordersBtn = $("bordersBtn");
  function setBorders(on) {
    svg.classList.toggle("borders", on);
    bordersBtn.setAttribute("aria-pressed", String(on));
  }
  // easy mode always shows borders; hard mode hides the "close" legend entry
  function applyLevelView() {
    const lv = LEVELS[game.level];
    setBorders(lv.borders || userBorders);
    document.body.classList.toggle("no-orange", !lv.orange);
  }
  function syncLevelControls() {
    document.querySelectorAll("[data-level]").forEach((b) => {
      const on = b.dataset.level === level;
      b.classList.toggle("active", on);
      if (b.getAttribute("role") === "radio") b.setAttribute("aria-checked", String(on));
    });
  }
  function setLevel(lv) {
    if (!LEVELS[lv]) return;
    level = lv;
    store.set("seyyah-level", lv);
    syncLevelControls();
    if (game.mode === "random") startRandom();
    else if (game.mode === "speed" && !speed.running) enterSpeed();
  }
  function toggleLevelMenu(open) {
    const menu = $("levelMenu");
    open = open ?? menu.hidden;
    menu.hidden = !open;
    $("levelBtn").setAttribute("aria-expanded", String(open));
  }

  // ---------- theme ----------
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    $("themeBtn").querySelector("use").setAttribute("href", t === "dark" ? "#i-sun" : "#i-moon");
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === "dark" ? "#0c0e11" : "#f3f3ef";
  }

  // ---------- wire up ----------
  buildMap();
  applyTheme(document.documentElement.dataset.theme || "light");

  $("guessForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("guessInput").value;
    if (!v.trim()) return reject("Rayon adını yaz.");
    // exact name wins; otherwise take the highlighted suggestion
    pick(byName.get(norm(v)) ?? (acIndex >= 0 ? acItems[acIndex] : undefined));
  });
  $("guessInput").addEventListener("input", showAc);
  $("guessInput").addEventListener("keydown", (e) => {
    if (!acItems.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setAc((acIndex + 1) % acItems.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAc((acIndex - 1 + acItems.length) % acItems.length); }
    else if (e.key === "Escape") hideAc();
  });
  $("guessInput").addEventListener("blur", () => {
    hideAc();
    document.body.classList.remove("typing");
    document.querySelector(".layout").style.paddingBottom = ""; // drop the spacer pick() may have grown
  });
  $("guessInput").addEventListener("focus", () => document.body.classList.add("typing"));
  // the keyboard opening or closing changes the visible area
  if (window.visualViewport) {
    visualViewport.addEventListener("resize", placeAc);
    visualViewport.addEventListener("scroll", placeAc);
  }

  document.querySelectorAll(".mode").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  window.addEventListener("resize", () => { moveThumb(); sizeLabels(); });
  document.fonts && document.fonts.ready.then(moveThumb);
  $("giveUpBtn").addEventListener("click", giveUp);
  $("hintBtn").addEventListener("click", useHint);
  $("speedGo").addEventListener("click", startSpeed);

  // a finished game always continues with a random one; a finished speed run restarts the run
  const playAgain = () => setMode("random");
  $("againBtn").addEventListener("click", playAgain);
  $("reopenBtn").addEventListener("click", showOutcome);
  $("outAgain").addEventListener("click", () => closeModal("outcome", lastOutcome === "speed" ? startSpeed : playAgain));
  $("outShare").addEventListener("click", copyResult);
  $("outImage").addEventListener("click", shareImage);
  document.querySelectorAll("#outcome [data-close]").forEach((el) => el.addEventListener("click", () => closeModal("outcome")));

  $("statsBtn").addEventListener("click", () => { renderStatsModal(); openModal("statsModal"); });
  document.querySelectorAll("#statsModal [data-close]").forEach((el) => el.addEventListener("click", () => closeModal("statsModal")));
  document.querySelectorAll("#statsModal [role=tab]").forEach((t) => t.addEventListener("click", () => showTab(t.dataset.tab)));

  $("introStart").addEventListener("click", () => closeModal("intro", () => $("guessInput").focus()));
  $("introDaily").addEventListener("click", () => closeModal("intro", () => setMode("daily")));
  $("helpBtn").addEventListener("click", () => openModal("intro"));
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    toggleLevelMenu(false);
    closeModal("outcome");
    closeModal("intro");
    closeModal("statsModal");
  });

  document.querySelectorAll("[data-level]").forEach((b) => b.addEventListener("click", () => {
    setLevel(b.dataset.level);
    toggleLevelMenu(false);
  }));
  $("levelBtn").addEventListener("click", (e) => { e.stopPropagation(); toggleLevelMenu(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".level-wrap")) toggleLevelMenu(false); });

  function applySound() {
    const b = $("soundBtn");
    b.setAttribute("aria-pressed", String(soundOn));
    b.setAttribute("aria-label", soundOn ? "Səsi söndür" : "Səsi aç");
    b.querySelector("use").setAttribute("href", soundOn ? "#i-sound" : "#i-mute");
  }
  applySound();
  $("soundBtn").addEventListener("click", () => {
    soundOn = !soundOn;
    store.set("seyyah-sound", soundOn);
    applySound();
    toast(soundOn ? "Səs və titrəmə açıldı" : "Səs və titrəmə söndürüldü");
  });

  $("themeBtn").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(t);
    store.set("seyyah-theme", t);
  });

  // map controls
  bordersBtn.addEventListener("click", () => {
    const on = !svg.classList.contains("borders");
    userBorders = on;
    setBorders(on);
    store.set("seyyah-borders", on);
    toast(on ? "Sərhədlər göstərilir" : "Sərhədlər gizlədildi");
  });
  const center = () => [vb[0] + vb[2] / 2, vb[1] + vb[3] / 2];
  $("zoomIn").addEventListener("click", () => zoomTo(zoomAround(0.7, ...center()), 300));
  $("zoomOut").addEventListener("click", () => zoomTo(zoomAround(1 / 0.7, ...center()), 300));
  $("zoomFit").addEventListener("click", () => zoomTo(fitBox(shownIds)));
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    cancelAnimationFrame(anim);
    setView(zoomAround(Math.exp(e.deltaY * 0.0015), ...svgPoint(e.clientX, e.clientY)));
  }, { passive: false });
  let drag = null;
  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return; // touch keeps page scrolling; use the buttons
    cancelAnimationFrame(anim);
    drag = { x: e.clientX, y: e.clientY, vb: vb.slice() };
    svg.setPointerCapture(e.pointerId);
    svg.classList.add("dragging");
  });
  svg.addEventListener("pointermove", (e) => {
    if (!drag) return;
    const r = svg.getBoundingClientRect();
    const dx = ((e.clientX - drag.x) / r.width) * drag.vb[2];
    const dy = ((e.clientY - drag.y) / r.height) * drag.vb[3];
    setView([drag.vb[0] - dx, drag.vb[1] - dy, drag.vb[2], drag.vb[3]]);
  });
  const endDrag = () => { drag = null; svg.classList.remove("dragging"); };
  svg.addEventListener("pointerup", endDrag);
  svg.addEventListener("pointercancel", endDrag);

  // ---------- install as an app (PWA) ----------
  // service workers only run over http(s), not when index.html is opened as a file
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    $("installBtn").hidden = false;
  });
  $("installBtn").addEventListener("click", async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice.catch(() => {});
    installPrompt = null;
    $("installBtn").hidden = true;
  });
  window.addEventListener("appinstalled", () => { $("installBtn").hidden = true; toast("Səyyah quraşdırıldı"); });

  // ---------- boot ----------
  setView(FULL);
  document.querySelector('.mode[data-mode="random"]').classList.add("active");
  moveThumb();
  syncLevelControls();
  startRandom();
  openModal("intro");
  $("introStart").focus({ preventScroll: true });
})();
