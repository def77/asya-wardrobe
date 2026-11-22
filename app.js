(() => {
  "use strict";
  const W = window.WARDROBE;
  const CFG = window.CLOUD || {};
  const CATS = Object.keys(W.categories);
  const NAV = ["outer", "layer", "hat", "shoes", "top", "bottom", "dress", "jewelry", "bag"].filter((c) => CATS.includes(c));
  const LAYER_Z = Object.fromEntries(W.layers.map((c, i) => [c, i + 1]));
  const SEASONS = Object.keys(W.seasons);
  const THEMES = ["", "pink", "green", "yellow"];
  const BUCKET = "wardrobe";
  const URL_TTL = 60 * 60 * 24 * 7; // signed image links live a week; refreshed on every page load
  const BG_LIB = "./vendor/bg/bg-removal.js";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const isOpt = (c) => !!W.categories[c].optional;
  const SEPARATES = ["top", "bottom"]; // a dress is worn instead of these
  const hasDress = CATS.includes("dress");
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];

  /* ---------- local storage (per-device prefs, demo data) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("wardrobe:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("wardrobe:" + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- data ---------- */
  const cloud = { sb: null, user: null, needsMigration: false };
  let items = [], byCat = {}, byId = {}, looks = [];
  let modelUrl = W.model, modelPath = null;
  const demoFits = store.get("fits", {});

  const state = {
    idx: Object.fromEntries(CATS.map((c) => [c, -1])), // -1 = nothing chosen
    focus: "top",
    season: store.get("season", ""),
    sound: store.get("sound", true),
    theme: store.get("theme", ""),
    view: store.get("view", "doll"),
    closetSel: null,
    collageVariant: store.get("collageVariant", 0),
    arranging: false,
    colSel: null,
    tuning: false,
    sel: null,
    spinning: false,
  };

  const isCloud = () => !!cloud.user;
  const current = (c) => (state.idx[c] >= 0 ? byCat[c][state.idx[c]] : null);
  const outfit = () => Object.fromEntries(CATS.map((c) => [c, current(c)?.id || null]));
  const curKey = () => (isCloud() ? "current-cloud" : "current");
  const saveCurrent = () => store.set(curKey(), outfit());
  const parseBox = (b) => (Array.isArray(b) ? b : String(b).trim().split(/\s+/)).map(Number);
  const catBox = (c) => parseBox(W.categories[c].box);
  const boxOf = (it) => parseBox((!isCloud() && demoFits[it.id]) || it.box || W.categories[it.cat].box);
  const fitsSeason = (it, seasons) => !it.seasons?.length || it.seasons.some((s) => seasons.includes(s));
  const seasonWord = (s) => (s ? W.seasons[s] : "весь год");

  // fit an image of aspect a (w/h) inside box, centred horizontally, pinned to the top
  function fitBox([x, y, w, h], a) {
    if (w / h > a) { const nw = h * a; return [x + (w - nw) / 2, y, nw, h]; }
    return [x, y, w, w / a];
  }

  // where a real photo of a laid-out garment goes on the 200×500 mannequin.
  // Flat-lay photos have sleeves and legs spread out, so clothes are fitted to the body
  // (and may be stretched a little) instead of keeping the photo's proportions.
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const centred = (w, y, h) => [100 - w / 2, y, w, h];
  const r1 = (b) => b.map((v) => Math.round(v * 10) / 10);
  function smartBox(cat, a) {
    switch (cat) {
      case "top": return r1(centred(132, 80, clamp(132 / a, 135, 175)));      // shoulders → hips
      case "outer": return r1(centred(140, 76, clamp(140 / a, 150, 235)));
      case "layer": return r1(centred(136, 78, clamp(136 / a, 125, 190)));      // vest / cardigan / open shirt
      case "dress": return r1(centred(112, 82, clamp(112 / a, 150, 300)));
      case "bottom":
        if (a < 0.9) return r1(centred(clamp(268 * a, 64, 98), 194, 268));    // trousers: waist → ankles
        return r1(centred(92, 194, clamp(92 / a, 50, 200)));                    // skirt / shorts
      default: return r1(fitBox(catBox(cat), a));
    }
  }
  // boxes that earlier versions set automatically (photo proportions kept) — safe to re-fit
  const OLD_AUTO = { top: [36, 74, 128, 170], bottom: [58, 194, 84, 270], outer: [30, 70, 140, 210], dress: [44, 76, 112, 260] };
  function wasAutoPlaced(it) {
    const o = OLD_AUTO[it.cat], b = it.box;
    if (!o || !Array.isArray(b) || b.length !== 4) return false;
    const eq = (u, v) => Math.abs(u - v) < 0.3;
    const widthLimited = eq(b[0], o[0]) && eq(b[1], o[1]) && eq(b[2], o[2]);
    const heightLimited = eq(b[1], o[1]) && eq(b[3], o[3]) && eq(b[0] + b[2] / 2, o[0] + o[2] / 2);
    return widthLimited || heightLimited;
  }

  // rebuild per-category lists for the season filter, then point every slot at the given item ids
  function reindex(ids = store.get(curKey(), {})) {
    byId = Object.fromEntries(items.map((i) => [i.id, i]));
    byCat = Object.fromEntries(CATS.map((c) => [c, items.filter((i) => i.cat === c && (!state.season || fitsSeason(i, [state.season])))]));
    CATS.forEach((c) => {
      const k = byCat[c].findIndex((x) => x.id === ids[c]);
      state.idx[c] = k >= 0 ? k : (isOpt(c) || !byCat[c].length ? -1 : 0);
    });
    if (hasDress && state.idx.dress >= 0) SEPARATES.forEach((c) => { state.idx[c] = -1; });
  }
  const dressOn = () => hasDress && state.idx.dress >= 0;
  // put on a dress → take off top & bottom (remembered); take it off → put them back
  function wearDress(on) {
    if (on) {
      if (SEPARATES.some((c) => state.idx[c] >= 0)) state.prevSep = Object.fromEntries(SEPARATES.map((c) => [c, state.idx[c]]));
      SEPARATES.forEach((c) => { state.idx[c] = -1; });
    } else {
      SEPARATES.forEach((c) => {
        if (state.idx[c] >= 0 || !byCat[c].length) return;
        const prev = state.prevSep?.[c] ?? 0;
        state.idx[c] = prev >= 0 && prev < byCat[c].length ? prev : 0;
      });
    }
  }

  function loadDemo() {
    items = W.items.map((i) => ({ ...i, id: i.id || i.img, seasons: i.seasons || [], colors: i.colors || [] }));
    looks = store.get("looks", []);
    modelUrl = W.model; modelPath = null;
  }

  async function signUrls(paths) {
    if (!paths.length) return {};
    const { data, error } = await cloud.sb.storage.from(BUCKET).createSignedUrls(paths, URL_TTL);
    if (error) throw error;
    const out = {};
    data.forEach((d, i) => { out[paths[i]] = d.signedUrl; });
    return out;
  }

  async function loadCloud() {
    const sb = cloud.sb;
    const [ri, rl, rs] = await Promise.all([
      sb.from("items").select("*").order("created_at"),
      sb.from("looks").select("*").order("created_at", { ascending: false }),
      sb.from("settings").select("*"),
    ]);
    for (const r of [ri, rl, rs]) if (r.error) throw r.error;
    cloud.needsMigration = ri.data.length > 0 && !("seasons" in ri.data[0]);
    modelPath = rs.data.find((s) => s.key === "model")?.value?.path || null;
    const paths = ri.data.map((r) => r.img_path);
    if (modelPath) paths.push(modelPath);
    const urls = await signUrls(paths);
    items = ri.data.map((r) => ({
      id: r.id, cat: r.cat, name: r.name, img: urls[r.img_path], path: r.img_path, box: r.box, seasons: r.seasons || [],
      colors: r.colors || [],
    }));
    looks = rl.data.map((r) => ({ ...r.outfit, id: r.id, t: Date.parse(r.created_at) }));
    modelUrl = (modelPath && urls[modelPath]) || W.model;
    // re-seat garments that were placed by the old proportional rule and never adjusted by hand
    items.filter(wasAutoPlaced).forEach((it) => {
      it.box = smartBox(it.cat, it.box[2] / it.box[3]);
      sb.from("items").update({ box: it.box }).eq("id", it.id).then(({ error }) => error && console.error(error));
    });
  }

  async function load() {
    document.body.classList.add("loading");
    try {
      if (isCloud()) await loadCloud(); else loadDemo();
    } catch (e) {
      console.error(e);
      toast("облако не ответило: " + (e.message || e));
      loadDemo();
    }
    document.body.classList.remove("loading");
    reindex();
    renderAll();
    fillColors();
    if (cloud.needsMigration) toast("обнови базу: выполни migration-3.sql в Supabase");
  }

  /* ---------- sound (tiny synth, no files) ---------- */
  let ac;
  function beep(freq = 660, dur = 0.05, type = "square", vol = 0.05) {
    if (!state.sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g).connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
    } catch {}
  }
  const sfx = {
    click: () => beep(520, 0.04),
    tick: () => beep(900 + Math.random() * 300, 0.025, "square", 0.03),
    land: () => { beep(660, 0.06); setTimeout(() => beep(990, 0.09), 70); },
    wear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.09, "triangle", 0.07), i * 80)),
    like: () => { beep(784, 0.06, "triangle", 0.07); setTimeout(() => beep(1175, 0.12, "triangle", 0.07), 80); },
  };

  /* ---------- slots ---------- */
  function buildSlot(el) {
    const c = el.dataset.cat;
    el.innerHTML = `
      <div class="slot-head"><span class="slot-count"></span><span class="slot-tools">
        <button class="slot-del slot-edit" title="изменить вещь" hidden>✎</button>
        <button class="slot-del slot-rm" title="удалить вещь" hidden>✕</button></span></div>
      <div class="slot-img"></div>
      <div class="slot-name"></div>
      <div class="slot-nav">
        <button data-step="-3" aria-label="на 3 назад">◀◀</button>
        <button data-step="-1" aria-label="назад">◀</button>
        <button data-step="1" aria-label="вперёд">▶</button>
        <button data-step="3" aria-label="на 3 вперёд">▶▶</button>
      </div>`;
    el.addEventListener("click", (e) => {
      setFocus(c);
      if (e.target.closest(".slot-rm")) return deleteItem(current(c));
      if (e.target.closest(".slot-edit")) return openEdit(current(c));
      const b = e.target.closest("[data-step]");
      if (b) step(c, +b.dataset.step);
    });
  }

  function renderSlot(c, anim = true) {
    const el = $(`.board .slot[data-cat="${c}"]`);
    if (!el) return;
    const list = byCat[c], it = current(c);
    $(".slot-count", el).innerHTML = `${W.categories[c].label} ${it ? state.idx[c] + 1 : "—"}/${list.length}` + swatches(it?.colors);
    $(".slot-rm", el).hidden = $(".slot-edit", el).hidden = !(isCloud() && it);
    const box = $(".slot-img", el);
    if (!it) {
      let msg;
      if (list.length && SEPARATES.includes(c) && dressOn()) msg = `<div class="slot-none">— на мне платье —</div>`;
      else if (list.length) msg = `<div class="slot-none">— без —</div>`;
      else if (state.season && items.some((i) => i.cat === c)) msg = `<div class="slot-empty">нет вещей<br>на ${seasonWord(state.season)}</div>`;
      else msg = `<div class="slot-empty">пусто${isCloud() ? "<br>жми «+ вещь»" : ""}</div>`;
      box.innerHTML = msg;
      $(".slot-name", el).textContent = "";
      return;
    }
    let img = $("img", box);
    if (!img) { box.innerHTML = ""; img = document.createElement("img"); box.append(img); }
    if (img.getAttribute("src") !== it.img) img.src = it.img;
    img.alt = it.name;
    if (anim) { img.classList.remove("pop"); void img.offsetWidth; img.classList.add("pop"); }
    $(".slot-name", el).textContent = it.name;
  }

  function renderAll() {
    CATS.forEach((c) => renderSlot(c, false));
    renderLookTab();
    if (!$("#lookbook").hidden) renderLookbook();
    refreshStage();
    $("#seasonBtn").textContent = seasonWord(state.season);
    $("#authBtn").hidden = !cloud.sb;
    $("#addBtn").hidden = !cloud.sb;
    $("#authBtn").textContent = isCloud() ? "выход" : "вход";
    $("#tuneModel").hidden = !isCloud();
    $("#dollBtn").hidden = !modelPath;
    updatePalette();
    if (!$("#closet").hidden) renderCloset();
  }
  const refreshStage = () => {
    if ($("#tryon").hidden) return;
    if (state.view === "collage") renderCurrentCollage(); else renderStage($("#stage"), outfit(), true);
  };

  // positions a slot can take: optional categories also have "nothing" (-1)
  const positions = (c) => [...(isOpt(c) ? [-1] : []), ...byCat[c].map((_, i) => i)];

  function step(c, d, sound = true) {
    if (SEPARATES.includes(c) && dressOn()) {
      // browsing top/bottom while wearing a dress takes the dress off
      if (!byCat[c].length) return;
      state.idx.dress = -1;
      wearDress(false);
      ["dress", ...SEPARATES].forEach((x) => renderSlot(x));
      if (sound) sfx.click();
      saveCurrent(); refreshStage();
      return;
    }
    const pos = positions(c);
    if (pos.length < 2) return;
    const i = Math.max(0, pos.indexOf(state.idx[c]));
    state.idx[c] = pos[((i + d) % pos.length + pos.length) % pos.length];
    if (c === "dress") { wearDress(state.idx.dress >= 0); SEPARATES.forEach((x) => renderSlot(x, false)); }
    renderSlot(c);
    if (sound) sfx.click();
    saveCurrent();
    refreshStage();
    updatePalette();
  }

  function setFocus(c) {
    state.focus = c;
    $$(".board .slot").forEach((s) => s.classList.toggle("focus", s.dataset.cat === c));
  }

  /* ---------- season filter ---------- */
  function cycleSeason() {
    const order = ["", ...SEASONS];
    setSeason(order[(order.indexOf(state.season) + 1) % order.length]);
    sfx.click();
    const n = CATS.reduce((s, c) => s + byCat[c].length, 0);
    toast(state.season ? `${seasonWord(state.season)}: ${n} вещей` : `весь год: ${n} вещей`);
  }
  function setSeason(s) {
    const keep = outfit();
    state.season = s;
    store.set("season", s);
    reindex(keep);
    renderAll();
  }

  /* ---------- random: slot-machine spin ---------- */
  function randomTargets() {
    const t = Object.fromEntries(CATS.map((c) => {
      const n = byCat[c].length;
      if (!n) return [c, -1];
      if (c === "dress") return [c, -1]; // decided below
      if (isOpt(c) && Math.random() < 0.45) return [c, -1];
      const choices = byCat[c].map((_, i) => i).filter((i) => n < 2 || i !== state.idx[c]);
      return [c, rnd(choices)];
    }));
    return chooseDress(t, hasDress ? byCat.dress.map((_, i) => i) : []);
  }
  // sometimes a dress instead of top + bottom (always, if there are no separates at all)
  function chooseDress(t, dresses) {
    if (!dresses.length) return t;
    const noSeparates = SEPARATES.every((c) => t[c] < 0);
    if (noSeparates || Math.random() < 0.3) {
      t.dress = rnd(dresses);
      SEPARATES.forEach((c) => { t[c] = -1; });
    }
    return t;
  }

  function spin(pick) {
    if (state.spinning) return;
    pick = pick || harmonious(randomTargets);
    const targets = pick.t;
    state.spinning = true;
    const spinning = NAV.filter((c) => positions(c).length > 1);
    let done = 0;
    const finish = () => {
      state.spinning = false;
      CATS.forEach((c) => renderSlot(c, false));
      updatePalette(true);
      sfx.land();
      saveCurrent();
      refreshStage();
    };
    if (!spinning.length) { CATS.forEach((c) => { state.idx[c] = targets[c]; renderSlot(c); }); return finish(); }
    spinning.forEach((c, k) => {
      const pos = positions(c);
      let spins = 6 + k * 3;
      const t = setInterval(() => {
        if (--spins <= 0) {
          clearInterval(t);
          state.idx[c] = targets[c];
          renderSlot(c);
          if (++done === spinning.length) finish();
          return;
        }
        const i = Math.max(0, pos.indexOf(state.idx[c]));
        state.idx[c] = pos[(i + 1) % pos.length];
        renderSlot(c, false);
        sfx.tick();
      }, 55);
    });
  }


  /* ---------- colours: harmony by the colour rules (colors.js) ---------- */
  const swatches = (ids) => (ids || []).filter((c) => COLORS.BY[c])
    .map((c) => `<i class="sw" style="background:${COLORS.BY[c].hex}" title="${COLORS.BY[c].name}"></i>`).join("");
  // jewellery: yellowish → gold, greyish → silver
  const METAL = { mustard: "gold", yellow: "gold", sand: "gold", beige: "gold", brown: "gold", grey: "silver", graphite: "silver" };
  const tidyColors = (cat, cols) => [...new Set((cols || []).map((c) => (cat === "jewelry" && METAL[c]) || c))];
  const targetItems = (t) => CATS.map((c) => (t[c] >= 0 ? byCat[c][t[c]] : null)).filter(Boolean);
  const targetKey = (t) => CATS.map((c) => t[c]).join(",");

  // try many outfits from `make`, keep the best-matching by colour rules (with a little randomness)
  function harmonious(make, tries = 260) {
    const seen = new Set(), cands = [];
    for (let i = 0; i < tries; i++) {
      const t = make(), k = targetKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      cands.push({ t, a: COLORS.analyze(targetItems(t)) });
    }
    cands.sort((x, y) => y.a.score - x.a.score);
    return rnd(cands.slice(0, Math.max(1, Math.min(5, Math.ceil(cands.length * 0.04)))));
  }

  // line under the top bar: scheme + palette of the outfit on screen
  function updatePalette(show) {
    if (show) store.set("paletteHidden", false);
    const bar = $("#palette");
    const a = COLORS.analyze(CATS.map((c) => current(c)).filter(Boolean));
    if (!a.label || store.get("paletteHidden", false)) { bar.hidden = true; return; }
    const total = a.palette.reduce((s, p) => s + p.share, 0) || 1;
    $("#paletteText").innerHTML = `<b>${escapeHtml(a.label)}</b> ` + a.palette.slice(0, 4)
      .map((p) => `<span class="pal">${swatches([p.id])}${COLORS.BY[p.id].name} ${Math.round((p.share / total) * 100)}%</span>`).join(" ");
    bar.hidden = false;
  }

  // a handful of different, well-matched outfits straight into the lookbook
  async function autoLookbook(n = 6) {
    const pool = [];
    const seen = new Set(looks.map((l) => lookKey(l)));
    for (let i = 0; i < 1800; i++) {
      const t = randomTargets(), look = Object.fromEntries(CATS.map((c) => [c, t[c] >= 0 ? byCat[c][t[c]].id : null]));
      const k = lookKey(look);
      if (seen.has(k)) continue;
      seen.add(k);
      const a = COLORS.analyze(targetItems(t));
      if (a.scheme && a.scheme !== "clash" && a.score >= 3) pool.push({ look, a });
    }
    if (!pool.length) return toast(items.some((i) => i.colors?.length) ? "не нашлось удачных сочетаний — добавь вещей" : "у вещей пока не определены цвета");
    pool.sort((x, y) => y.a.score - x.a.score);
    const usedScheme = {}, usedItem = {}, chosen = [];
    const BIG = ["outer", "layer", "top", "bottom", "dress"];
    while (chosen.length < n && pool.length) {
      let best = -1, bestV = -Infinity;
      pool.slice(0, 300).forEach((p, i) => {
        const v = p.a.score - 2.5 * (usedScheme[p.a.scheme] || 0) -
          1.5 * BIG.reduce((s, c) => s + (p.look[c] ? usedItem[p.look[c]] || 0 : 0), 0) + Math.random() * 0.8;
        if (v > bestV) { bestV = v; best = i; }
      });
      const p = pool.splice(best, 1)[0];
      chosen.push(p);
      usedScheme[p.a.scheme] = (usedScheme[p.a.scheme] || 0) + 1;
      BIG.forEach((c) => { if (p.look[c]) usedItem[p.look[c]] = (usedItem[p.look[c]] || 0) + 1; });
    }
    toast("собираю лукбук…");
    for (const p of chosen.reverse()) {
      const look = { ...p.look, scheme: p.a.label };
      if (isCloud()) {
        const { data, error } = await cloud.sb.from("looks").insert({ outfit: look }).select().single();
        if (error) { toast("не сохранилось: " + error.message); break; }
        looks.unshift({ ...look, id: data.id, t: Date.parse(data.created_at) });
      } else {
        looks.unshift({ ...look, t: Date.now() });
      }
    }
    if (!isCloud()) store.set("looks", looks);
    renderLookTab(); renderLookbook(); sfx.like();
    toast(`✨ +${chosen.length} образов в лукбуке`);
  }

  // work out colours for things that don't have them yet (and remember them in the cloud)
  let filling = false;
  async function fillColors() {
    if (filling) return;
    filling = true;
    const todo = items.filter((it) => !it.colors?.length && it.img);
    for (const it of todo) {
      try { it.colors = tidyColors(it.cat, await COLORS.detect(it.img)); } catch (e) { console.error(e); continue; }
      if (isCloud() && it.path && it.colors.length && !cloud.noColors) {
        const { error } = await cloud.sb.from("items").update({ colors: it.colors }).eq("id", it.id);
        if (error && /colors/i.test(error.message)) cloud.noColors = true;
      }
    }
    filling = false;
    if (todo.length) { CATS.forEach((c) => renderSlot(c, false)); updatePalette(); }
  }

  /* ---------- weather: «что надеть сегодня» ---------- */
  const WMO = {
    0: "ясно", 1: "почти ясно", 2: "переменная облачность", 3: "пасмурно", 45: "туман", 48: "туман",
    51: "морось", 53: "морось", 55: "морось", 56: "ледяная морось", 57: "ледяная морось",
    61: "дождь", 63: "дождь", 65: "ливень", 66: "ледяной дождь", 67: "ледяной дождь",
    71: "снег", 73: "снег", 75: "снегопад", 77: "снежная крупа", 80: "ливень", 81: "ливень", 82: "сильный ливень",
    85: "снег", 86: "снегопад", 95: "гроза", 96: "гроза с градом", 99: "гроза с градом",
  };
  const deg = (t) => `${t > 0 ? "+" : ""}${Math.round(t)}°`;
  const getJSON = async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error("сервис погоды не ответил");
    return r.json();
  };

  async function placeName(lat, lon) {
    try {
      const d = await getJSON(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=ru`);
      return d.city || d.locality || "";
    } catch { return ""; }
  }
  function geolocate() {
    return new Promise((res, rej) => {
      if (!navigator.geolocation) return rej(new Error("нет геолокации"));
      navigator.geolocation.getCurrentPosition(res, rej, { timeout: 10000, maximumAge: 3600e3 });
    });
  }
  async function findCity(name) {
    const d = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=ru`);
    const g = d.results?.[0];
    if (!g) throw new Error(`не нашла город «${name}»`);
    return { lat: g.latitude, lon: g.longitude, name: g.name };
  }
  async function locate(ask = false) {
    const saved = store.get("geo", null);
    if (saved && !ask) return saved;
    let geo = null;
    if (ask) {
      const city = prompt("город для погоды (оставь пустым — по геолокации)", saved?.name || "");
      if (city === null) return null;
      if (city.trim()) geo = await findCity(city.trim());
    }
    if (!geo) {
      try {
        const p = await geolocate();
        geo = { lat: p.coords.latitude, lon: p.coords.longitude };
        geo.name = await placeName(geo.lat, geo.lon);
      } catch {
        const city = prompt("не получилось определить место. в каком ты городе?", saved?.name || "Москва");
        if (!city) return null;
        geo = await findCity(city.trim());
      }
    }
    store.set("geo", geo);
    return geo;
  }
  async function getWeather(g) {
    const d = await getJSON(
      `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}` +
      "&current=temperature_2m,apparent_temperature,weather_code" +
      "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code" +
      "&timezone=auto&forecast_days=1");
    return {
      t: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code,
      dcode: d.daily.weather_code[0], tmin: d.daily.temperature_2m_min[0], tmax: d.daily.temperature_2m_max[0],
      rain: d.daily.precipitation_probability_max[0] ?? 0,
    };
  }
  function weatherPlan(w) {
    const t = w.feels, codes = [w.code, w.dcode];
    const wet = w.rain >= 50 || codes.some((c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95);
    const snow = codes.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
    const seasons = t <= 0 ? ["winter"] : t <= 8 ? ["winter", "autumn", "spring"] : t <= 16 ? ["autumn", "spring"]
      : t <= 22 ? ["spring", "summer", "autumn"] : ["summer"];
    return {
      seasons, wet, snow,
      outer: t < 16 || wet || snow ? "need" : t > 22 ? "no" : "maybe",
      layer: t > 20 ? "no" : "maybe",
      hat: t <= 3 || snow ? "need" : "maybe",
    };
  }
  function weatherTargets(p) {
    const t = Object.fromEntries(CATS.map((c) => {
      const list = byCat[c];
      const ok = list.map((it, i) => [it, i]).filter(([it]) => fitsSeason(it, p.seasons)).map(([, i]) => i);
      if (c === "dress") return [c, -1]; // decided below
      if (isOpt(c)) {
        const mode = c === "outer" ? p.outer : c === "hat" ? p.hat : c === "layer" ? p.layer : "maybe";
        if (mode === "no" || !ok.length) return [c, -1];
        if (mode === "maybe" && Math.random() < (c === "hat" ? 0.65 : 0.4)) return [c, -1];
        // when it's needed (cold / rain), prefer things made for the coldest fitting season
        const warmest = mode === "need" ? ok.filter((i) => list[i].seasons?.includes(p.seasons[0])) : [];
        return [c, rnd(warmest.length ? warmest : ok)];
      }
      if (!list.length) return [c, -1];
      return [c, ok.length ? rnd(ok) : Math.floor(Math.random() * list.length)];
    }));
    const dresses = hasDress ? byCat.dress.map((it, i) => [it, i]).filter(([it]) => fitsSeason(it, p.seasons)).map(([, i]) => i) : [];
    return chooseDress(t, dresses);
  }
  async function today(askPlace = false) {
    if (state.spinning) return;
    try {
      toast("смотрю погоду…");
      const g = await locate(askPlace);
      if (!g) return;
      const w = await getWeather(g);
      const p = weatherPlan(w);
      if (state.season) setSeason("");
      const hasOuter = byCat.outer?.some((it) => fitsSeason(it, p.seasons));
      const advice = [
        `сегодня ${p.seasons.map((s) => W.seasons[s]).join(" / ")}`,
        p.outer === "need" ? (hasOuter ? "нужна куртка" : "нужна куртка — добавь верхнюю одежду") : p.outer === "no" ? "можно без куртки" : "куртка по желанию",
        p.wet && "☂ возьми зонт",
        p.snow && "❄ снег",
      ].filter(Boolean).join(" · ");
      $("#weatherText").innerHTML =
        `<b>${escapeHtml(g.name || "сейчас")}</b> ${deg(w.t)}, ощущается ${deg(w.feels)}, ${WMO[w.code] || ""}` +
        ` · днём ${deg(w.tmin)}…${deg(w.tmax)}<br>${escapeHtml(advice)}`;
      $("#weather").hidden = false;
      $("#toast").hidden = true;
      switchTab("board");
      spin(harmonious(() => weatherTargets(p)));
    } catch (e) {
      console.error(e);
      toast("погода: " + (e.message || "не получилось"));
    }
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  /* ---------- stage: model + layered clothes, 200×500 coordinate space ---------- */
  function renderStage(el, look, editable = false) {
    el.innerHTML = "";
    const model = document.createElement("img");
    model.className = "model"; model.src = modelUrl; model.alt = "";
    el.append(model);
    CATS.map((c) => byId[look[c]]).filter(Boolean)
      .sort((a, b) => (a.z ?? LAYER_Z[a.cat]) - (b.z ?? LAYER_Z[b.cat]))
      .forEach((it) => {
        const img = document.createElement("img");
        img.className = "layer"; img.src = it.img; img.alt = it.name;
        img.dataset.id = it.id;
        img.style.zIndex = 1 + (it.z ?? LAYER_Z[it.cat]);
        placeLayer(img, boxOf(it));
        if (editable && state.sel === it.id) img.classList.add("sel");
        el.append(img);
      });
  }
  function placeLayer(img, [x, y, w, h]) {
    Object.assign(img.style, { left: x / 2 + "%", top: y / 5 + "%", width: w / 2 + "%", height: h / 5 + "%" });
  }

  /* ---------- modals ---------- */
  function openModal(id) { $("#" + id).hidden = false; }
  function closeModal(m) {
    if (!m) return;
    m.hidden = true;
    if (m.id === "tryon") { setTuning(false); setArranging(false); }
    if (m.id === "addModal") resetAdd();
  }
  const openModalEl = () => $$(".modal").find((m) => !m.hidden);

  /* ---------- collage: flat-lay board like Pinterest outfit collages ---------- */
  // relative visual weight (height share) of each kind of thing in a column
  const WEIGHT = { outer: 1.35, layer: 1.0, top: 1.05, dress: 1.75, bottom: 1.8, shoes: 0.55, bag: 0.75, hat: 0.45, jewelry: 0.35 };
  const COLLAGE_VARIANTS = 4;

  // → [{ it, rect: [x, y, w, h] }] in 0..1 of a 3:4 board
  function collageLayout(look, variant = 0) {
    const has = (c) => !!(look[c] && byId[look[c]]);
    const dress = has("dress");
    // body order: what's higher on the body goes higher on the board
    const ORDER = ["hat", "outer", "layer", "top", "jewelry", "bag", "dress", "bottom", "shoes"];
    const SMALL = ["hat", "jewelry", "bag", "shoes"]; // only these may change columns
    const LOWER = ["dress", "bottom", "shoes"];        // these sit at the bottom of their column
    const byBody = (a) => a.sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
    // left: upper-body clothes; right: accessories on top, bottoms / dress / shoes at the bottom
    let L = ["hat", "outer", "layer", dress ? null : "top"].filter((c) => c && has(c));
    let R = ["jewelry", "bag", dress ? "dress" : "bottom", "shoes"].filter((c) => has(c));
    if (variant & 2 && R.includes("shoes")) { R = R.filter((c) => c !== "shoes"); L.push("shoes"); }
    // short bottoms (skirts, shorts) take less room than trousers
    const bottomBox = has("bottom") ? boxOf(byId[look.bottom]) : null;
    const wt = (c) => (c === "bottom" && bottomBox && bottomBox[3] < 220 ? 1.05 : WEIGHT[c]);
    const sum = (a) => a.reduce((s, c) => s + wt(c), 0);
    // balance the columns with small things only; clothes stay where they belong
    for (let guard = 0; guard < 4; guard++) {
      const d = sum(L) - sum(R);
      const from = d > 1.1 ? L : d < -1.1 ? R : null;
      if (!from) break;
      const pick = ["jewelry", "hat", "bag", "shoes"].find((c) => from.includes(c));
      if (!pick || from.length === 1) break;
      if (from === L) { L = L.filter((c) => c !== pick); R.push(pick); }
      else { R = R.filter((c) => c !== pick); L.push(pick); }
    }
    byBody(L); byBody(R);
    if (!L.length) [L, R] = [R, []];
    const cols = [L, R].filter((a) => a.length);
    const X = cols.length === 2 ? [[0.04, 0.47], [0.51, 0.45]] : [[0.2, 0.6]];
    const PAD = 0.035, GAP = 0.02, out = [];
    // one scale for both columns so things keep comparable sizes
    const avail = (col) => 1 - 2 * PAD - GAP * (col.length - 1);
    const unit = Math.min(...cols.map((col) => avail(col) / sum(col)));
    cols.forEach((col, ci) => {
      const [x, w] = X[ci];
      const spare = avail(col) - unit * sum(col);
      const firstLow = col.findIndex((c) => LOWER.includes(c));
      let y = PAD;
      col.forEach((c, i) => {
        if (i === firstLow) y += spare; // push bottoms and shoes down to the bottom edge
        const h = unit * wt(c);
        const ww = SMALL.includes(c) && c !== "bag" ? w * 0.78 : w;
        out.push({ it: byId[look[c]], rect: [x + (w - ww) / 2, y, ww, h] });
        y += h + GAP;
      });
    });
    if (variant & 1) out.forEach((o) => { o.rect[0] = 1 - o.rect[0] - o.rect[2]; });
    return out;
  }

  /* hand-made arrangement: { variant, rects: { itemId: [x,y,w,h] }, z: { itemId: n } }
     — for the outfit on screen it lives in this browser (per outfit), and is saved with the look in the lookbook */
  const collageEdits = store.get("collageEdits", {});
  const currentEdits = () => collageEdits[lookKey(outfit())] || null;
  function saveEdits(look, e) {
    const k = lookKey(look);
    if (e) collageEdits[k] = e; else delete collageEdits[k];
    store.set("collageEdits", collageEdits);
  }
  function collageParts(look, edits, variant = state.collageVariant) {
    const parts = collageLayout(look, edits ? edits.variant ?? variant : variant);
    if (edits) {
      parts.forEach((p) => {
        const r = edits.rects?.[p.it.id];
        if (r) p.rect = r.slice();
        p.z = edits.z?.[p.it.id] || 0;
      });
      parts.sort((a, b) => a.z - b.z);
    }
    return parts;
  }
  const placeRect = (img, [x, y, w, h]) =>
    Object.assign(img.style, { left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%" });

  function renderCollage(el, look, edits = null, editable = false) {
    el.innerHTML = "";
    const parts = collageParts(look, edits, edits ? undefined : (editable ? state.collageVariant : 0));
    if (!parts.length) { el.innerHTML = `<div class="collage-empty">тут пока пусто</div>`; return; }
    parts.forEach(({ it, rect }) => {
      const img = document.createElement("img");
      img.src = it.img; img.alt = it.name; img.dataset.id = it.id;
      placeRect(img, rect);
      if (editable && state.colSel === it.id) img.classList.add("sel");
      el.append(img);
    });
  }
  const renderCurrentCollage = () => renderCollage($("#collage"), outfit(), currentEdits(), true);

  // --- arranging by hand ---
  function setArranging(on) {
    state.arranging = on;
    if (!on) state.colSel = null;
    $("#collage").classList.toggle("arranging", on);
    $("#arrangeBar").hidden = !on;
    $("#arrangeBtn").textContent = on ? "готово" : "двигать";
    $("#arrangeLabel").textContent = "тапни вещь и двигай пальцем, два пальца — размер";
    if (!$("#tryon").hidden && state.view === "collage") renderCurrentCollage();
  }
  // the outfit's arrangement as editable data (starts from the automatic layout)
  function editableArrangement() {
    const look = outfit();
    const e = currentEdits() || { variant: state.collageVariant, rects: {}, z: {} };
    collageParts(look, e).forEach((p) => { if (!e.rects[p.it.id]) e.rects[p.it.id] = p.rect.slice(); });
    return e;
  }
  function commitRect(id, rect) {
    const e = editableArrangement();
    e.rects[id] = rect.map((v) => Math.round(v * 1000) / 1000);
    saveEdits(outfit(), e);
  }
  function selectCollageItem(id) {
    state.colSel = id;
    const e = editableArrangement();
    e.z[id] = Math.max(0, ...Object.values(e.z)) + 1; // bring to front
    saveEdits(outfit(), e);
    renderCurrentCollage();
    $("#arrangeLabel").textContent = `двигаю: ${byId[id]?.name || ""}`;
  }
  function resizeSelected(k) {
    const id = state.colSel;
    if (!id) return toast("сначала тапни вещь");
    const [x, y, w, h] = editableArrangement().rects[id];
    const r = [x - (w * k - w) / 2, y - (h * k - h) / 2, w * k, h * k];
    commitRect(id, r);
    const img = $$("#collage img").find((i) => i.dataset.id === id);
    if (img) placeRect(img, r);
  }
  function resetArrangement() {
    saveEdits(outfit(), null);
    state.colSel = null;
    renderCurrentCollage();
    sfx.click();
  }

  // drag with one finger, pinch with two
  const ptrs = new Map();
  let gesture = null;
  const collageEl = $("#collage");
  collageEl.addEventListener("pointerdown", (e) => {
    if (!state.arranging) return;
    const img = e.target.closest("img");
    if (!img && ptrs.size === 0) return;
    e.preventDefault();
    try { collageEl.setPointerCapture(e.pointerId); } catch {}
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (img && ptrs.size === 1 && img.dataset.id !== state.colSel) selectCollageItem(img.dataset.id);
    if (!state.colSel) return;
    const rect = editableArrangement().rects[state.colSel].slice();
    const pts = [...ptrs.values()];
    gesture = pts.length >= 2
      ? { kind: "pinch", rect, d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 }
      : { kind: "drag", rect, sx: e.clientX, sy: e.clientY };
  });
  collageEl.addEventListener("pointermove", (e) => {
    if (!gesture || !ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [x, y, w, h] = gesture.rect;
    let r;
    if (gesture.kind === "drag") {
      r = [x + (e.clientX - gesture.sx) / collageEl.clientWidth, y + (e.clientY - gesture.sy) / collageEl.clientHeight, w, h];
    } else {
      const pts = [...ptrs.values()];
      if (pts.length < 2) return;
      const k = Math.min(4, Math.max(0.25, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) / gesture.d0));
      r = [x - (w * k - w) / 2, y - (h * k - h) / 2, w * k, h * k];
    }
    gesture.now = r;
    const img = $$("#collage img").find((i) => i.dataset.id === state.colSel);
    if (img) placeRect(img, r);
  });
  const endGesture = (e) => {
    ptrs.delete(e.pointerId);
    if (gesture?.now && state.colSel) commitRect(state.colSel, gesture.now);
    gesture = null;
    // a finger still down after a pinch continues as a drag from where things are now
    if (ptrs.size === 1 && state.colSel) {
      const p = [...ptrs.values()][0];
      gesture = { kind: "drag", rect: editableArrangement().rects[state.colSel].slice(), sx: p.x, sy: p.y };
    }
  };
  collageEl.addEventListener("pointerup", endGesture);
  collageEl.addEventListener("pointercancel", endGesture);

  // draw the collage into a picture and share / download it
  async function exportCollage() {
    const parts = collageParts(outfit(), currentEdits());
    if (!parts.length) return toast("сначала выбери вещи");
    toast("собираю картинку…");
    try {
      const W0 = 1080, H0 = 1440;
      const c = document.createElement("canvas"); c.width = W0; c.height = H0;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#f4f1ec"; ctx.fillRect(0, 0, W0, H0);
      for (const { it, rect: [x, y, w, h] } of parts) {
        const img = await new Promise((res, rej) => {
          const i = new Image(); i.crossOrigin = "anonymous";
          i.onload = () => res(i); i.onerror = () => rej(new Error("не загрузилась картинка " + it.name));
          i.src = it.img;
        });
        const iw = img.naturalWidth || 300, ih = img.naturalHeight || 300;
        const k = Math.min((w * W0) / iw, (h * H0) / ih);
        const dw = iw * k, dh = ih * k;
        ctx.drawImage(img, x * W0 + (w * W0 - dw) / 2, y * H0 + (h * H0 - dh) / 2, dw, dh);
      }
      ctx.fillStyle = "#9a8f80"; ctx.font = "22px 'Press Start 2P', monospace"; ctx.textAlign = "right";
      ctx.fillText(W.title.toLowerCase(), W0 - 24, H0 - 14);
      const blob = await toBlob(c, "image/png");
      const file = new File([blob], `outfit-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: W.title }).catch(() => {});
      } else {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
        toast("картинка сохранена ✓");
      }
    } catch (e) { console.error(e); toast("не получилось: " + (e.message || e)); }
  }

  // which picture the try-on window and lookbook show: mannequin or collage
  function setView(v) {
    state.view = v; store.set("view", v);
    if (v === "collage" && state.tuning) setTuning(false);
    if (v !== "collage" && state.arranging) setArranging(false);
    applyView();
    refreshStage();
    if (!$("#lookbook").hidden) renderLookbook();
  }
  function applyView() {
    const col = state.view === "collage";
    $$("[data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === state.view));
    $("#stage").hidden = col; $("#collage").hidden = !col;
    $("#relayoutBtn").hidden = !col;
    $("#tuneBtn").hidden = col; $("#exportBtn").hidden = !col; $("#arrangeBtn").hidden = !col;
    $("#tryon .win-actions").classList.toggle("two-cols", col);
    if (!col) $("#arrangeBar").hidden = true;
  }
  function renderLookPreview(el, look) {
    el.className = state.view === "collage" ? "collage" : "stage";
    if (state.view === "collage") renderCollage(el, look, look.collage || null); else renderStage(el, look);
  }

  /* ---------- try-on window ---------- */
  function openTryOn() {
    openModal("tryon");
    applyView();
    refreshStage();
    sfx.wear();
  }
  function setTuning(on) {
    state.tuning = on;
    if (!on) state.sel = null;
    $("#stage").classList.toggle("tuning", on);
    $("#tune").hidden = !on;
    $("#tuneBtn").textContent = on ? "готово" : "подогнать";
    updateTuneLabel();
    refreshStage();
  }
  function updateTuneLabel() {
    const it = byId[state.sel];
    $("#tuneLabel").textContent = it ? `двигаю: ${it.name}` : "тапни вещь, потом двигай пальцем";
  }
  function selectLayer(id) {
    state.sel = id;
    $$("#stage .layer").forEach((l) => l.classList.toggle("sel", l.dataset.id === id));
    updateTuneLabel();
  }
  const layerEl = (id) => $$("#stage .layer").find((l) => l.dataset.id === id);

  const fitTimers = {};
  function setFit(id, box) {
    box = box.map((v) => Math.round(v * 10) / 10);
    const it = byId[id];
    if (isCloud()) {
      it.box = box;
      clearTimeout(fitTimers[id]);
      fitTimers[id] = setTimeout(async () => {
        const { error } = await cloud.sb.from("items").update({ box }).eq("id", id);
        if (error) toast("не сохранилось: " + error.message);
      }, 500);
    } else {
      demoFits[id] = box; store.set("fits", demoFits);
    }
    const l = layerEl(id);
    if (l) placeLayer(l, box);
  }
  const selected = () => { const it = byId[state.sel]; if (!it) toast("сначала тапни вещь"); return it; };
  function nudge(dx, dy) {
    const it = selected(); if (!it) return;
    const [x, y, w, h] = boxOf(it);
    setFit(it.id, [x + dx, y + dy, w, h]);
  }
  // separate width / height: width grows from the centre, length from the top (waist / shoulders stay put)
  function stretch(kx, ky) {
    const it = selected(); if (!it) return;
    const [x, y, w, h] = boxOf(it);
    setFit(it.id, [x - (w * kx - w) / 2, y, w * kx, h * ky]);
  }
  function scale(k) {
    const it = selected(); if (!it) return;
    const [x, y, w, h] = boxOf(it);
    setFit(it.id, [x - (w * k - w) / 2, y - (h * k - h) / 2, w * k, h * k]);
  }
  function resetFit() {
    const it = selected(); if (!it) return;
    if (!isCloud()) {
      delete demoFits[it.id]; store.set("fits", demoFits);
      return renderStage($("#stage"), outfit(), true);
    }
    const l = layerEl(it.id);
    const a = l && l.naturalWidth ? l.naturalWidth / l.naturalHeight : 1;
    setFit(it.id, smartBox(it.cat, a));
  }

  // drag layers with finger/mouse
  let drag = null;
  $("#stage").addEventListener("pointerdown", (e) => {
    if (!state.tuning) return;
    const l = e.target.closest(".layer"); if (!l) return;
    e.preventDefault();
    selectLayer(l.dataset.id);
    const it = byId[l.dataset.id];
    drag = { it, l, sx: e.clientX, sy: e.clientY, box: boxOf(it), k: 200 / $("#stage").clientWidth };
    $("#stage").setPointerCapture(e.pointerId);
  });
  $("#stage").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y, w, h] = drag.box;
    drag.now = [x + (e.clientX - drag.sx) * drag.k, y + (e.clientY - drag.sy) * drag.k, w, h];
    placeLayer(drag.l, drag.now);
  });
  const endDrag = () => { if (drag?.now) setFit(drag.it.id, drag.now); drag = null; };
  $("#stage").addEventListener("pointerup", endDrag);
  $("#stage").addEventListener("pointercancel", endDrag);

  /* ---------- lookbook ---------- */
  const lookKey = (o) => CATS.map((c) => o[c] || "").join("|");
  async function like() {
    const look = outfit();
    if (!CATS.some((c) => look[c])) return toast("гардероб пока пуст");
    const cur = currentEdits();
    const edits = cur ? JSON.parse(JSON.stringify(cur)) : null; // a copy: later edits must not change the saved look
    if (edits) look.collage = edits;
    const same = looks.find((l) => lookKey(l) === lookKey(look));
    if (same) {
      if (!edits || JSON.stringify(same.collage) === JSON.stringify(edits)) return toast("этот образ уже в лукбуке");
      same.collage = edits;
      if (isCloud()) {
        const { id, t, ...outfitData } = same;
        const { error } = await cloud.sb.from("looks").update({ outfit: outfitData }).eq("id", id);
        if (error) return toast("не сохранилось: " + error.message);
      } else store.set("looks", looks);
      sfx.like();
      return toast("♥ раскладка в лукбуке обновлена");
    }
    if (isCloud()) {
      const { data, error } = await cloud.sb.from("looks").insert({ outfit: look }).select().single();
      if (error) return toast("не сохранилось: " + error.message);
      looks.unshift({ ...look, id: data.id, t: Date.parse(data.created_at) });
    } else {
      looks.unshift({ ...look, t: Date.now() });
      store.set("looks", looks);
    }
    sfx.like();
    toast("♥ сохранено в лукбук");
    renderLookTab();
  }
  async function deleteLook(i) {
    const look = looks[i];
    if (isCloud()) {
      const { error } = await cloud.sb.from("looks").delete().eq("id", look.id);
      if (error) return toast("не удалилось: " + error.message);
    }
    looks.splice(i, 1);
    if (!isCloud()) store.set("looks", looks);
    renderLookbook(); renderLookTab(); sfx.click();
  }
  function openLook(look) {
    const ids = Object.fromEntries(CATS.map((c) => [c, look[c] || null]));
    const hidden = CATS.some((c) => ids[c] && byId[ids[c]] && !byCat[c].some((x) => x.id === ids[c]));
    if (hidden) { state.season = ""; store.set("season", ""); }
    if (look.collage) saveEdits(look, JSON.parse(JSON.stringify(look.collage)));
    reindex(ids);
    saveCurrent();
    switchTab("board");
    renderAll();
    sfx.land();
  }
  function renderLookTab() {
    $("#lookTab").textContent = `лукбук · ${looks.length}`;
  }
  function renderLookbook() {
    const g = $("#lookbookGrid");
    g.innerHTML = "";
    if (!looks.length) {
      g.innerHTML = `<div class="lookbook-empty">тут пока пусто<br>собери образ и жми «♥ в лукбук»</div>`;
      return;
    }
    looks.forEach((look, i) => {
      const card = document.createElement("div");
      card.className = "look"; card.title = "открыть образ";
      const st = document.createElement("div");
      renderLookPreview(st, look);
      const date = new Date(look.t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      card.append(st);
      const an = COLORS.analyze(CATS.map((c) => byId[look[c]]).filter(Boolean));
      const label = look.scheme || an.label;
      card.insertAdjacentHTML("beforeend",
        `<div class="look-date">${date}${swatches(an.palette.map((p) => p.id))}</div>` +
        (label ? `<div class="look-scheme">${escapeHtml(label)}</div>` : "") +
        `<button class="look-del" aria-label="удалить">×</button>`);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".look-del")) return deleteLook(i);
        openLook(look);
      });
      g.append(card);
    });
  }
  function switchTab(tab) {
    $("#board").hidden = tab !== "board";
    $("#lookbook").hidden = tab !== "lookbook";
    $("#closet").hidden = tab !== "closet";
    $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === tab));
    if (tab === "lookbook") renderLookbook();
    if (tab === "closet") { openCloset(); renderCloset(); }
  }

  /* ---------- closet: every item, pick what to wear ---------- */
  const CLOSET_ORDER = ["top", "layer", "bottom", "dress", "outer", "hat", "shoes", "bag", "jewelry"].filter((c) => CATS.includes(c));
  function openCloset() {
    state.closetSel = outfit(); // start from what's on now
  }
  function closetPick(id) {
    const it = byId[id]; if (!it) return;
    const sel = state.closetSel, c = it.cat;
    if (sel[c] === id) sel[c] = null; // tap again = take off
    else {
      sel[c] = id;
      if (c === "dress") SEPARATES.forEach((x) => { sel[x] = null; }); // a dress replaces top + bottom
      if (SEPARATES.includes(c)) sel.dress = null;
    }
    sfx.click();
    renderCloset();
  }
  function renderCloset() {
    const sel = state.closetSel || {};
    const g = $("#closetGroups");
    const groups = CLOSET_ORDER.map((c) => {
      const list = items.filter((i) => i.cat === c);
      const cards = list.map((it) => `
        <div class="ccard${sel[c] === it.id ? " on" : ""}" data-id="${escapeHtml(it.id)}" role="button" tabindex="0">
          ${isCloud() ? `<button class="ccard-edit" data-edit="${escapeHtml(it.id)}" title="изменить">✎</button>` : ""}
          <img src="${escapeHtml(it.img)}" alt="" loading="lazy">
          <span class="ccard-name">${escapeHtml(it.name)}</span>
          <span class="ccard-meta">${swatches(it.colors)}${(it.seasons || []).map((s) => W.seasons[s]).join(" · ") || "всесезон."}</span>
        </div>`).join("");
      return `<div class="closet-group"><h3>${W.categories[c].label} <small>${list.length}</small></h3>
        <div class="closet-grid">${cards || `<div class="closet-empty">пусто${isCloud() ? " — жми «+ вещь»" : ""}</div>`}</div></div>`;
    }).join("");
    g.innerHTML = groups;
    const chosen = CATS.map((c) => byId[sel[c]]).filter(Boolean);
    const a = COLORS.analyze(chosen);
    $("#closetInfo").innerHTML = chosen.length
      ? `выбрано: ${chosen.length}${a.label ? ` · <b>${escapeHtml(a.label)}</b> ${swatches(a.palette.map((p) => p.id))}` : ""}`
      : "тапни вещи, которые хочешь надеть";
  }
  function closetWear() {
    const sel = { ...state.closetSel };
    if (!CATS.some((c) => sel[c])) return toast("сначала выбери вещи");
    const now = outfit();
    // required things that weren't picked stay as they were (unless a dress is on)
    CATS.forEach((c) => {
      if (sel[c] || isOpt(c)) return;
      if (SEPARATES.includes(c) && sel.dress) return;
      sel[c] = now[c];
    });
    if (CATS.some((c) => sel[c] && !byCat[c].some((x) => x.id === sel[c]))) { state.season = ""; store.set("season", ""); }
    reindex(sel);
    if (sel.dress) SEPARATES.forEach((c) => { state.idx[c] = -1; });
    else SEPARATES.forEach((c) => { if (!sel[c]) state.idx[c] = byCat[c].length ? state.idx[c] : -1; });
    saveCurrent();
    switchTab("board");
    renderAll();
    openTryOn();
  }
  $("#closetGroups").addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) { e.stopPropagation(); return openEdit(byId[ed.dataset.edit]); }
    const card = e.target.closest(".ccard");
    if (card) closetPick(card.dataset.id);
  });


  /* ---------- images: resize, background removal, trim ---------- */
  function loadImg(src) {
    return new Promise((res, rej) => {
      const url = typeof src === "string" ? src : URL.createObjectURL(src);
      const img = new Image();
      const done = () => { if (typeof src !== "string") URL.revokeObjectURL(url); };
      img.onload = () => { done(); res(img); };
      img.onerror = () => { done(); rej(new Error("не получилось открыть картинку")); };
      img.src = url;
    });
  }
  const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));
  const imageAspect = async (src) => { const img = await loadImg(src); return img.naturalWidth / img.naturalHeight; };

  // image file → canvas no bigger than max px, transparency preserved
  async function toCanvas(src, max = 1400) {
    const img = await loadImg(src);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height);

  // share of see-through pixels (iPhone «lift subject» cut-outs are already transparent)
  function transparentShare(c) {
    const { data } = pixels(c);
    let n = 0, t = 0;
    for (let i = 3; i < data.length; i += 4 * 7) { n++; if (data[i] < 200) t++; }
    return t / n;
  }
  // share of pixels that are clearly visible after a cut-out
  function solidShare(c) {
    const { data } = pixels(c);
    let n = 0, s = 0;
    for (let i = 3; i < data.length; i += 4 * 7) { n++; if (data[i] > 160) s++; }
    return s / n;
  }

  // plain background (sheet, floor, wall): flood-fill it away from the edges by colour
  function floodCut(src) {
    const w = src.width, h = src.height;
    const img = pixels(src), d = img.data;
    const border = [];
    for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
    for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);
    const med = [0, 1, 2].map((ch) => {
      const v = border.map((p) => d[p * 4 + ch]).sort((a, b) => a - b);
      return v[v.length >> 1];
    });
    const dist = (p) => {
      const i = p * 4;
      if (d[i + 3] < 30) return 0; // already transparent counts as background
      const r = d[i] - med[0], g = d[i + 1] - med[1], b = d[i + 2] - med[2];
      return Math.sqrt(r * r + g * g + b * b);
    };
    const T = 46, SOFT = 26;
    if (border.filter((p) => dist(p) < T).length / border.length < 0.8) return null; // background isn't plain
    const bg = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0, tail = 0;
    for (const p of border) if (!bg[p] && dist(p) < T) { bg[p] = 1; queue[tail++] = p; }
    while (head < tail) {
      const p = queue[head++], x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) if (q >= 0 && q < w * h && !bg[q] && dist(q) < T) { bg[q] = 1; queue[tail++] = q; }
    }
    // soft edge: object pixels touching the background fade by how close they are to its colour
    for (let p = 0; p < w * h; p++) {
      if (bg[p]) { d[p * 4 + 3] = 0; continue; }
      const x = p % w;
      const touches = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (p >= w && bg[p - w]) || (p + w < w * h && bg[p + w]);
      if (touches) {
        const k = Math.min(1, Math.max(0, (dist(p) - T) / SOFT));
        d[p * 4 + 3] = Math.round(d[p * 4 + 3] * (0.35 + 0.65 * k));
      }
    }
    const out = document.createElement("canvas");
    out.width = w; out.height = h;
    out.getContext("2d").putImageData(img, 0, 0);
    return out;
  }

  // crop transparent margins so the picture's box matches the garment itself
  function trimCanvas(c, max = 1000) {
    const { data, width, height } = pixels(c);
    let x0 = width, y0 = height, x1 = -1, y1 = -1;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 < 0) throw new Error("на фото ничего не нашлось");
    const pad = 4;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(width - 1, x1 + pad); y1 = Math.min(height - 1, y1 + pad);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    const k = Math.min(1, max / Math.max(w, h));
    const o = document.createElement("canvas");
    o.width = Math.round(w * k); o.height = Math.round(h * k);
    o.getContext("2d").drawImage(c, x0, y0, w, h, 0, 0, o.width, o.height);
    return toBlob(o, "image/png");
  }

  // neural network, served from this site (vendor/bg) so it doesn't depend on outside CDNs
  let bgLib;
  async function aiCut(c, onStatus) {
    onStatus("загружаю нейросеть… (первый раз ~60 МБ, потом быстро)");
    bgLib = bgLib || (await import(BG_LIB));
    const input = await toBlob(c, "image/png");
    const out = await bgLib.removeBackground(input, {
      publicPath: new URL("vendor/bg/data/", location.href).href,
      model: "small",
      output: { format: "image/png" },
      progress: (key, cur, total) => {
        if (key.startsWith("fetch") && total) onStatus(`скачиваю нейросеть… ${Math.round((cur / total) * 100)}%`);
        else if (key.startsWith("compute")) onStatus("убираю фон…");
      },
    });
    return toCanvas(out, 4000);
  }

  // try, in order: already transparent → plain background by colour → neural network
  async function cutout(c, onStatus) {
    if (transparentShare(c) > 0.03) return { blob: await trimCanvas(c), how: "фон уже прозрачный ✓" };
    const flat = floodCut(c);
    if (flat) {
      const s = solidShare(flat);
      if (s > 0.03 && s < 0.97) return { blob: await trimCanvas(flat), how: "готово ✓ фон убран" };
    }
    const ai = await aiCut(c, onStatus);
    const s = solidShare(ai);
    if (s < 0.03) throw new Error("нейросеть не нашла вещь на фото");
    return { blob: await trimCanvas(ai), how: "готово ✓ фон убран нейросетью" };
  }

  // the untouched photo: PNG if it has transparency, JPEG otherwise
  const plainBlob = (c) => (transparentShare(c) > 0.03 ? toBlob(c, "image/png") : toBlob(c, "image/jpeg", 0.9));

  async function upload(folder, blob) {
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await cloud.sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;
    return path;
  }

  const missingSeasons = (e) => /seasons/i.test(e?.message || "") || e?.code === "42703" || e?.code === "PGRST204";
  // which of the given optional columns the database says it doesn't have
  const missingCols = (e, cols) => cols.filter((c) => new RegExp(`'${c}'|\\b${c}\\b`, "i").test(e?.message || ""));
  // insert / update, dropping optional columns the database doesn't have yet
  async function writeItem(op, row, id) {
    for (let tries = 0; tries < 3; tries++) {
      const q = op === "insert" ? cloud.sb.from("items").insert(row).select().single() : cloud.sb.from("items").update(row).eq("id", id);
      const res = await q;
      if (!res.error) return res;
      const gone = missingCols(res.error, ["seasons", "colors"]).filter((c) => c in row);
      if (!gone.length) return res;
      gone.forEach((c) => delete row[c]);
      setTimeout(() => toast("часть данных не сохранилась: обнови базу (migration-5.sql)"), 2700);
    }
    return { error: { message: "не получилось сохранить" } };
  }
  const dbError = (e) => {
    const m = e?.message || String(e);
    if (/items_cat_check|check constraint/i.test(m)) return `в базе нет этой категории — выполни обновление базы (migration-5.sql). (${m})`;
    if (missingSeasons(e)) return `в базе нет сезонов — выполни обновление базы (migration-5.sql). (${m})`;
    return m;
  };

  /* ---------- add / edit item ---------- */
  const add = { orig: null, canvas: null, blob: null, busy: false, token: 0, edit: null, colors: [], colorsTouched: false };
  const addStatus = (t) => { $("#addStatus").textContent = t; };
  function buildAddForm() {
    $("#addCats").innerHTML = CATS.map((c) =>
      `<label><input type="radio" name="cat" value="${c}"><span>${W.categories[c].short || W.categories[c].label}</span></label>`).join("");
    $("#addSeasons").innerHTML = SEASONS.map((s) =>
      `<label><input type="checkbox" value="${s}"><span>${W.seasons[s]}</span></label>`).join("");
    $("#addColors").innerHTML = COLORS.PALETTE.map((c) =>
      `<button type="button" class="chip" data-color="${c.id}" title="${c.name}"><i style="background:${c.hex}"></i><span>${c.name}</span></button>`).join("");
    $("#addColors").addEventListener("click", (e) => {
      const b = e.target.closest("[data-color]"); if (!b) return;
      const id = b.dataset.color;
      add.colors = add.colors.includes(id) ? add.colors.filter((x) => x !== id) : [...add.colors, id];
      add.colorsTouched = true;
      renderColorChips();
    });
  }
  function renderColorChips() {
    $$("#addColors .chip").forEach((b) => {
      const i = add.colors.indexOf(b.dataset.color);
      b.classList.toggle("on", i >= 0);
      b.classList.toggle("main", i === 0);
    });
    $("#addColorsNote").textContent = add.colors.length
      ? `главный: ${COLORS.BY[add.colors[0]].name}${add.colors.length > 1 ? " · ещё: " + add.colors.slice(1).map((c) => COLORS.BY[c].name).join(", ") : ""}`
      : "не выбран";
  }
  async function autoColors(src) {
    if (add.colorsTouched) return;
    try { add.colors = await COLORS.detect(src); } catch (e) { console.error(e); }
    renderColorChips();
  }
  const formSeasons = () => $$("#addSeasons input:checked").map((i) => i.value);
  function setForm(cat, seasons = [], name = "") {
    $$("#addCats input").forEach((r) => { r.checked = r.value === cat; });
    $$("#addSeasons input").forEach((i) => { i.checked = seasons.includes(i.value); });
    $("#addName").value = name;
  }
  function addPreview(src) {
    const img = $("#addPreview");
    if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
    img.src = typeof src === "string" ? src : URL.createObjectURL(src);
    img.hidden = false;
    $("#drop").classList.add("has");
  }
  function addBusy(on) {
    add.busy = on;
    $("#saveBtn").disabled = on;
  }
  function resetAdd() {
    add.orig = add.canvas = add.blob = add.edit = null; add.token++;
    $("#addFile").value = ""; $("#addFile").disabled = false;
    $("#addPreview").hidden = true; $("#drop").classList.remove("has");
    $("#addBgRow").hidden = false;
    $("#addTitle").textContent = "новая_вещь.exe";
    $("#saveBtn").textContent = "в гардероб";
    add.colors = []; add.colorsTouched = false; renderColorChips();
    setForm("top");
    addStatus(""); addBusy(false);
  }
  function openAdd() {
    if (!cloud.sb) return toast("облако ещё не подключено");
    if (!isCloud()) { toast("сначала войди"); return openModal("authModal"); }
    resetAdd();
    setForm(state.focus, state.season ? [state.season] : []);
    openModal("addModal");
  }
  function openEdit(it) {
    if (!it || !isCloud()) return;
    resetAdd();
    add.edit = it;
    $("#addTitle").textContent = "правка.exe";
    $("#saveBtn").textContent = "сохранить";
    addPreview(it.img);
    setForm(it.cat, it.seasons, it.name);
    add.colors = (it.colors || []).slice(); add.colorsTouched = true; renderColorChips();
    addStatus("чтобы заменить фото — нажми на него");
    openModal("addModal");
  }
  async function processAdd() {
    if (!add.orig) return;
    const token = ++add.token;
    if (!$("#addBg").checked) { add.blob = add.orig; addPreview(add.orig); addBusy(false); autoColors(add.orig); return addStatus(""); }
    addBusy(true);
    try {
      const { blob, how } = await cutout(add.canvas, (t) => token === add.token && addStatus(t));
      if (token !== add.token) return;
      add.blob = blob; addPreview(blob); addStatus(how); autoColors(blob);
    } catch (e) {
      console.error(e);
      if (token !== add.token) return;
      add.blob = add.orig; addPreview(add.orig); autoColors(add.orig);
      addStatus(`фон убрать не вышло (${e.message || e}), сохраню как есть. Совет: на айфоне в «Фото» зажми вещь → «Поделиться» → сохрани, фон уберётся сам`);
    } finally {
      if (token === add.token) addBusy(false);
    }
  }
  $("#addFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (add.edit) add.colorsTouched = false; // a new photo → work the colours out again
    try {
      add.canvas = await toCanvas(f);
      add.orig = await plainBlob(add.canvas);
      addPreview(add.orig);
      processAdd();
    } catch (err) { addStatus(err.message); }
  });
  $("#addBg").addEventListener("change", processAdd);

  async function saveItem() {
    if (add.busy) return;
    if (add.edit) return saveEdit();
    if (!add.blob) return addStatus("сначала выбери фото");
    const cat = $("#addCats input:checked")?.value || "top";
    const seasons = formSeasons();
    const name = $("#addName").value.trim() || W.categories[cat].label;
    addBusy(true); addStatus("загружаю в облако…");
    try {
      const blob = add.blob;
      const box = smartBox(cat, await imageAspect(blob));
      const path = await upload("items", blob);
      const colors = tidyColors(cat, add.colors);
      const row = { cat, name, img_path: path, box, seasons, colors };
      // database not migrated yet: save without the newer fields rather than lose the photo
      const { data, error } = await writeItem("insert", row);
      if (error) { cloud.sb.storage.from(BUCKET).remove([path]); throw error; }
      const urls = await signUrls([path]);
      items.push({ id: data.id, cat, name, img: urls[path], path, box, seasons, colors });
      const ids = { ...outfit(), [cat]: data.id };
      if (state.season && !fitsSeason({ seasons }, [state.season])) { state.season = ""; store.set("season", ""); }
      reindex(ids);
      saveCurrent();
      renderAll(); setFocus(cat);
      closeModal($("#addModal"));
      sfx.land(); toast("добавлено ✓");
    } catch (e) {
      console.error(e);
      addStatus("ошибка: " + dbError(e));
      addBusy(false);
    }
  }
  async function saveEdit() {
    const it = add.edit;
    const cat = $("#addCats input:checked")?.value || it.cat;
    const seasons = formSeasons();
    const name = $("#addName").value.trim() || W.categories[cat].label;
    const patch = { cat, name, seasons, colors: tidyColors(cat, add.colors) };
    addBusy(true); addStatus("сохраняю…");
    let newPath = null;
    try {
      if (add.blob) {
        // replaced photo: upload it first, swap paths only once the database agrees
        addStatus("загружаю новое фото…");
        newPath = await upload("items", add.blob);
        patch.img_path = newPath;
        patch.box = smartBox(cat, await imageAspect(add.blob));
      } else if (cat !== it.cat) patch.box = smartBox(cat, await imageAspect(it.img));
      const keep = { ...patch };
      const { error } = await writeItem("update", patch, it.id);
      if (error) throw error;
      delete keep.img_path;
      Object.assign(it, keep);
      if (newPath) {
        const old = it.path;
        it.path = newPath;
        it.img = (await signUrls([newPath]))[newPath];
        if (old) cloud.sb.storage.from(BUCKET).remove([old]);
        newPath = null;
      }
      const ids = outfit();
      ids[cat] = it.id;
      if (state.season && !fitsSeason(it, [state.season])) { state.season = ""; store.set("season", ""); }
      reindex(ids);
      saveCurrent();
      renderAll(); setFocus(cat);
      closeModal($("#addModal"));
      sfx.land(); toast("сохранено ✓");
    } catch (e) {
      console.error(e);
      if (newPath) cloud.sb.storage.from(BUCKET).remove([newPath]);
      addStatus("ошибка: " + dbError(e));
      addBusy(false);
    }
  }

  async function deleteItem(it) {
    if (!it || !isCloud()) return;
    if (!confirm(`удалить «${it.name}» из гардероба?`)) return;
    const { error } = await cloud.sb.from("items").delete().eq("id", it.id);
    if (error) return toast("не удалилось: " + error.message);
    cloud.sb.storage.from(BUCKET).remove([it.path]);
    items = items.filter((x) => x.id !== it.id);
    reindex(outfit()); saveCurrent(); renderAll(); sfx.click();
  }

  /* ---------- model photo ---------- */
  $("#modelFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const base = await toCanvas(f, 1600);
      let blob;
      try { blob = (await cutout(base, toast)).blob; }
      catch (err) { console.error(err); blob = await plainBlob(base); toast("фон убрать не вышло, загружаю как есть"); }
      toast("загружаю фото…");
      const path = await upload("model", blob);
      const { error } = await cloud.sb.from("settings").upsert({ key: "model", value: { path } });
      if (error) throw error;
      if (modelPath) cloud.sb.storage.from(BUCKET).remove([modelPath]);
      modelPath = path;
      modelUrl = (await signUrls([path]))[path];
      renderAll(); toast("готово ✓");
    } catch (err) { console.error(err); toast("ошибка: " + (err.message || err)); }
  });
  async function resetModel() {
    if (!modelPath || !confirm("вернуть манекен вместо фото?")) return;
    const { error } = await cloud.sb.from("settings").delete().eq("key", "model");
    if (error) return toast("ошибка: " + error.message);
    cloud.sb.storage.from(BUCKET).remove([modelPath]);
    modelPath = null; modelUrl = W.model;
    renderAll();
  }

  /* ---------- auth ---------- */
  async function authClick() {
    if (!cloud.sb) return;
    if (!isCloud()) { $("#authStatus").textContent = ""; openModal("authModal"); return $("#authEmail").focus(); }
    if (!confirm("выйти из аккаунта?")) return;
    await cloud.sb.auth.signOut();
    cloud.user = null;
    await load();
  }
  $("#authForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("#authSubmit").disabled = true; $("#authStatus").textContent = "вхожу…";
    const { data, error } = await cloud.sb.auth.signInWithPassword({
      email: $("#authEmail").value.trim(), password: $("#authPass").value,
    });
    $("#authSubmit").disabled = false;
    if (error) {
      $("#authStatus").textContent = /invalid/i.test(error.message) ? "неверная почта или пароль" : error.message;
      return;
    }
    cloud.user = data.user;
    $("#authPass").value = "";
    closeModal($("#authModal"));
    await load();
    sfx.wear(); toast("привет! ♥");
  });

  /* ---------- misc ---------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2600);
  }
  function applyTheme() {
    if (state.theme) document.body.dataset.theme = state.theme; else delete document.body.dataset.theme;
  }
  function toggleFull() {
    const d = document;
    if (d.fullscreenElement) return d.exitFullscreen();
    const r = d.documentElement.requestFullscreen;
    if (r) r.call(d.documentElement).catch(() => {});
    else toast("на айфоне: поделиться → на экран «домой»");
  }

  const actions = {
    random: () => spin(),
    today: () => today(false),
    city: () => today(true),
    hideweather: () => { $("#weather").hidden = true; },
    season: cycleSeason,
    wear: openTryOn,
    like,
    close: (el) => closeModal(el.closest(".modal")),
    tune: () => setTuning(!state.tuning),
    resetfit: resetFit,
    add: openAdd,
    save: saveItem,
    auth: authClick,
    doll: resetModel,
    theme: () => {
      state.theme = THEMES[(THEMES.indexOf(state.theme) + 1) % THEMES.length];
      store.set("theme", state.theme); applyTheme(); sfx.click();
    },
    sound: () => {
      state.sound = !state.sound; store.set("sound", state.sound);
      $("#soundBtn").classList.toggle("on", state.sound); sfx.click();
    },
    full: toggleFull,
    closetwear: closetWear,
    closetclear: () => { state.closetSel = Object.fromEntries(CATS.map((c) => [c, null])); sfx.click(); renderCloset(); },
    autolook: () => autoLookbook(),
    hidepalette: () => { store.set("paletteHidden", true); $("#palette").hidden = true; },
    export: exportCollage,
    relayout: () => {
      // a new automatic layout replaces any hand-made one for this outfit
      saveEdits(outfit(), null); state.colSel = null;
      state.collageVariant = (state.collageVariant + 1) % COLLAGE_VARIANTS;
      store.set("collageVariant", state.collageVariant); sfx.click(); refreshStage();
    },
    arrange: () => setArranging(!state.arranging),
    colsmaller: () => resizeSelected(0.92),
    colbigger: () => resizeSelected(1.08),
    colreset: resetArrangement,
  };

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a && actions[a.dataset.act]) { e.preventDefault(); return actions[a.dataset.act](a); }
    const n = e.target.closest("[data-nudge]");
    if (n) { const [dx, dy] = n.dataset.nudge.split(",").map(Number); return nudge(dx, dy); }
    const s = e.target.closest("[data-scale]");
    if (s) return scale(+s.dataset.scale);
    const st = e.target.closest("[data-stretch]");
    if (st) { const [kx, ky] = st.dataset.stretch.split(",").map(Number); return stretch(kx, ky); }
    const v = e.target.closest("[data-view]");
    if (v) { sfx.click(); return setView(v.dataset.view); }
    const t = e.target.closest("[data-tab]");
    if (t) { sfx.click(); return switchTab(t.dataset.tab); }
    if (e.target.classList.contains("modal")) closeModal(e.target);
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.target.closest && e.target.closest("input, textarea, select")) return;
    const modal = openModalEl();
    const k = e.key;
    if (k === "Escape" && modal) return closeModal(modal);
    if (modal && modal.id !== "tryon") return;
    if (modal && state.tuning && state.sel) {
      const m = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (m) { e.preventDefault(); return nudge(...m); }
      if (k === "+" || k === "=") return scale(1.03);
      if (k === "-") return scale(0.97);
    }
    const lk = k.toLowerCase();
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const i = NAV.indexOf(state.focus) + (k === "ArrowUp" ? -1 : 1);
      setFocus(NAV[(i + NAV.length) % NAV.length]); sfx.click();
    } else if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault(); step(state.focus, k === "ArrowLeft" ? -1 : 1);
    } else if (k === " ") {
      e.preventDefault(); spin();
    } else if (k === "Enter") {
      e.preventDefault(); modal ? closeModal(modal) : openTryOn();
    } else if (lk === "l" || lk === "д") {
      like();
    } else if (!modal && (lk === "s" || lk === "ы")) {
      cycleSeason();
    }
  });

  /* ---------- init ---------- */
  async function init() {
    document.title = W.title;
    $("#title").textContent = W.title;
    $("#soundBtn").classList.toggle("on", state.sound);
    if (!SEASONS.includes(state.season)) state.season = "";
    applyTheme();
    buildAddForm();
    resetAdd();
    $$(".board .slot").forEach(buildSlot);
    setFocus("top");
    if (CFG.url && CFG.key && window.supabase) {
      try {
        cloud.sb = window.supabase.createClient(CFG.url, CFG.key);
        const { data } = await cloud.sb.auth.getSession();
        cloud.user = data.session?.user || null;
      } catch (e) { console.error(e); cloud.sb = null; }
    }
    await load();
    W.items.forEach((it) => { new Image().src = it.img; });
  }
  init();
})();
