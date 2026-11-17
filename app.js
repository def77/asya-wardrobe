(() => {
  "use strict";
  const W = window.WARDROBE;
  const CFG = window.CLOUD || {};
  const CATS = ["top", "bottom", "shoes", "bag"];
  const LAYER_Z = { shoes: 1, bottom: 2, top: 3, bag: 4 };
  const THEMES = ["", "pink", "green", "yellow"];
  const BUCKET = "wardrobe";
  const URL_TTL = 60 * 60 * 24 * 7; // signed image links live a week; refreshed on every page load
  const BG_LIB = "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/+esm";
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- local storage (per-device prefs, demo data) ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("wardrobe:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("wardrobe:" + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- data ---------- */
  const cloud = { sb: null, user: null };
  let items = [], byCat = {}, byId = {}, looks = [];
  let modelUrl = W.model, modelPath = null;
  const demoFits = store.get("fits", {});

  const state = {
    idx: { top: 0, bottom: 0, shoes: 0, bag: 0 },
    focus: "top",
    sound: store.get("sound", true),
    theme: store.get("theme", ""),
    tuning: false,
    sel: null,
    spinning: false,
  };

  const isCloud = () => !!cloud.user;
  const current = (c) => byCat[c][state.idx[c]];
  const outfit = () => Object.fromEntries(CATS.map((c) => [c, current(c)?.id || null]));
  const curKey = () => (isCloud() ? "current-cloud" : "current");
  const saveCurrent = () => store.set(curKey(), outfit());
  const parseBox = (b) => (Array.isArray(b) ? b : String(b).trim().split(/\s+/)).map(Number);
  const catBox = (c) => parseBox(W.categories[c].box);
  const boxOf = (it) => parseBox((!isCloud() && demoFits[it.id]) || it.box || W.categories[it.cat].box);

  // fit an image of aspect a (w/h) inside box, centred horizontally, pinned to the top
  function fitBox([x, y, w, h], a) {
    if (w / h > a) { const nw = h * a; return [x + (w - nw) / 2, y, nw, h]; }
    return [x, y, w, w / a];
  }

  function reindex() {
    byCat = Object.fromEntries(CATS.map((c) => [c, items.filter((i) => i.cat === c)]));
    byId = Object.fromEntries(items.map((i) => [i.id, i]));
    const saved = store.get(curKey(), {});
    CATS.forEach((c) => { state.idx[c] = Math.max(0, byCat[c].findIndex((x) => x.id === saved[c])); });
  }

  function loadDemo() {
    items = W.items.map((i) => ({ ...i, id: i.id || i.img }));
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
    modelPath = rs.data.find((s) => s.key === "model")?.value?.path || null;
    const paths = ri.data.map((r) => r.img_path);
    if (modelPath) paths.push(modelPath);
    const urls = await signUrls(paths);
    items = ri.data.map((r) => ({ id: r.id, cat: r.cat, name: r.name, img: urls[r.img_path], path: r.img_path, box: r.box }));
    looks = rl.data.map((r) => ({ ...r.outfit, id: r.id, t: Date.parse(r.created_at) }));
    modelUrl = (modelPath && urls[modelPath]) || W.model;
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
      <div class="slot-head"><span class="slot-count"></span><button class="slot-del" title="удалить вещь" hidden>✕</button></div>
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
      if (e.target.closest(".slot-del")) return deleteItem(current(c));
      const b = e.target.closest("[data-step]");
      if (b) step(c, +b.dataset.step);
    });
  }

  function renderSlot(c, anim = true) {
    const el = $(`.board .slot[data-cat="${c}"]`);
    const list = byCat[c], it = current(c);
    $(".slot-count", el).textContent = `${W.categories[c].label} ${list.length ? state.idx[c] + 1 : 0}/${list.length}`;
    $(".slot-del", el).hidden = !(isCloud() && it);
    const box = $(".slot-img", el);
    if (!it) {
      box.innerHTML = `<div class="slot-empty">пусто${isCloud() ? "<br>жми «+ вещь»" : ""}</div>`;
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
    if (!$("#tryon").hidden) renderStage($("#stage"), outfit(), true);
    $("#authBtn").hidden = !cloud.sb;
    $("#addBtn").hidden = !cloud.sb;
    $("#authBtn").textContent = isCloud() ? "выход" : "вход";
    $("#tuneModel").hidden = !isCloud();
    $("#dollBtn").hidden = !modelPath;
  }

  function step(c, d, sound = true) {
    const n = byCat[c].length;
    if (!n) return;
    state.idx[c] = ((state.idx[c] + d) % n + n) % n;
    renderSlot(c);
    if (sound) sfx.click();
    saveCurrent();
    if (!$("#tryon").hidden) renderStage($("#stage"), outfit(), true);
  }

  function setFocus(c) {
    state.focus = c;
    $$(".board .slot").forEach((s) => s.classList.toggle("focus", s.dataset.cat === c));
  }

  /* ---------- random: slot-machine spin ---------- */
  function randomize() {
    if (state.spinning) return;
    state.spinning = true;
    let done = 0;
    const finish = () => {
      state.spinning = false;
      sfx.land();
      saveCurrent();
      if (!$("#tryon").hidden) renderStage($("#stage"), outfit(), true);
    };
    CATS.forEach((c, k) => {
      const n = byCat[c].length;
      if (n < 2) { done++; return; }
      let target;
      do { target = Math.floor(Math.random() * n); } while (target === state.idx[c]);
      let spins = 7 + k * 4;
      const t = setInterval(() => {
        if (--spins <= 0) {
          clearInterval(t);
          state.idx[c] = target;
          renderSlot(c);
          if (++done === CATS.length) finish();
          return;
        }
        state.idx[c] = (state.idx[c] + 1) % n;
        renderSlot(c, false);
        sfx.tick();
      }, 55);
    });
    if (done === CATS.length) finish();
  }

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
    if (m.id === "tryon") setTuning(false);
  }
  const openModalEl = () => $$(".modal").find((m) => !m.hidden);

  /* ---------- try-on window ---------- */
  function openTryOn() {
    openModal("tryon");
    renderStage($("#stage"), outfit(), true);
    sfx.wear();
  }
  function setTuning(on) {
    state.tuning = on;
    if (!on) state.sel = null;
    $("#stage").classList.toggle("tuning", on);
    $("#tune").hidden = !on;
    $("#tuneBtn").textContent = on ? "готово" : "подогнать";
    updateTuneLabel();
    if (!$("#tryon").hidden) renderStage($("#stage"), outfit(), true);
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
    setFit(it.id, fitBox(catBox(it.cat), a));
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
  const lookKey = (o) => CATS.map((c) => o[c]).join("|");
  async function like() {
    const look = outfit();
    if (!CATS.some((c) => look[c])) return toast("гардероб пока пуст");
    if (looks.some((l) => lookKey(l) === lookKey(look))) return toast("этот образ уже в лукбуке");
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
      const st = document.createElement("div"); st.className = "stage";
      renderStage(st, look);
      const date = new Date(look.t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      card.append(st);
      card.insertAdjacentHTML("beforeend", `<div class="look-date">${date}</div><button class="look-del" aria-label="удалить">×</button>`);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".look-del")) return deleteLook(i);
        CATS.forEach((c) => {
          const k = byCat[c].findIndex((x) => x.id === look[c]);
          if (k >= 0) state.idx[c] = k;
        });
        saveCurrent();
        switchTab("board");
        CATS.forEach((c) => renderSlot(c));
        sfx.land();
      });
      g.append(card);
    });
  }
  function switchTab(tab) {
    $("#board").hidden = tab !== "board";
    $("#lookbook").hidden = tab !== "lookbook";
    $$(".tab").forEach((t) => t.classList.toggle("on", t.dataset.tab === tab));
    if (tab === "lookbook") renderLookbook();
  }

  /* ---------- images: resize, background removal, trim ---------- */
  function loadImg(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("не получилось открыть картинку")); };
      img.src = url;
    });
  }
  const toBlob = (canvas, type, q) => new Promise((r) => canvas.toBlob(r, type, q));

  async function downscale(file, max = 1400) {
    const img = await loadImg(file);
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return toBlob(c, "image/jpeg", 0.9);
  }

  // crop transparent margins so the picture's box matches the garment itself
  async function trim(blob, max = 1000) {
    const img = await loadImg(blob);
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, c.width, c.height);
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

  let bgLib;
  async function removeBg(blob, onStatus) {
    onStatus("загружаю нейросеть для фона… (первый раз ~40 МБ, потом быстро)");
    bgLib = bgLib || (await import(BG_LIB));
    const out = await bgLib.removeBackground(blob, {
      model: "isnet_quint8",
      output: { format: "image/png" },
      progress: (key, cur, total) => {
        if (key.startsWith("fetch") && total) onStatus(`скачиваю нейросеть… ${Math.round((cur / total) * 100)}%`);
        else if (key.startsWith("compute")) onStatus("убираю фон…");
      },
    });
    return trim(out);
  }

  async function imageAspect(blob) {
    const img = await loadImg(blob);
    return img.naturalWidth / img.naturalHeight;
  }

  async function upload(folder, blob) {
    const ext = blob.type === "image/png" ? "png" : "jpg";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await cloud.sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: "31536000" });
    if (error) throw error;
    return path;
  }

  /* ---------- add item ---------- */
  const add = { orig: null, blob: null, busy: false, token: 0 };
  const addStatus = (t) => { $("#addStatus").textContent = t; };
  function addPreview(blob) {
    const img = $("#addPreview");
    if (img.src.startsWith("blob:")) URL.revokeObjectURL(img.src);
    img.src = URL.createObjectURL(blob);
    img.hidden = false;
    $("#drop").classList.add("has");
  }
  function addBusy(on) {
    add.busy = on;
    $("#saveBtn").disabled = on;
  }
  function resetAdd() {
    add.orig = add.blob = null; add.token++;
    $("#addFile").value = ""; $("#addName").value = "";
    $("#addPreview").hidden = true; $("#drop").classList.remove("has");
    addStatus(""); addBusy(false);
  }
  function openAdd() {
    if (!cloud.sb) return toast("облако ещё не подключено");
    if (!isCloud()) { toast("сначала войди"); return openModal("authModal"); }
    $$("#addCats input").forEach((r) => { r.checked = r.value === state.focus; });
    openModal("addModal");
  }
  async function processAdd() {
    if (!add.orig) return;
    const token = ++add.token;
    if (!$("#addBg").checked) { add.blob = add.orig; addPreview(add.orig); addBusy(false); return addStatus(""); }
    addBusy(true);
    try {
      const out = await removeBg(add.orig, (t) => token === add.token && addStatus(t));
      if (token !== add.token) return;
      add.blob = out; addPreview(out); addStatus("готово ✓ фон убран");
    } catch (e) {
      console.error(e);
      if (token !== add.token) return;
      add.blob = add.orig; addPreview(add.orig);
      addStatus("фон убрать не вышло, сохраню как есть. Совет: на айфоне в «Фото» зажми вещь → «Поделиться» → сохрани, фон уберётся сам");
    } finally {
      if (token === add.token) addBusy(false);
    }
  }
  $("#addFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      add.orig = await downscale(f);
      addPreview(add.orig);
      processAdd();
    } catch (err) { addStatus(err.message); }
  });
  $("#addBg").addEventListener("change", processAdd);

  async function saveItem() {
    if (add.busy) return;
    if (!add.blob) return addStatus("сначала выбери фото");
    const cat = $("#addCats input:checked").value;
    const name = $("#addName").value.trim() || W.categories[cat].label;
    addBusy(true); addStatus("загружаю в облако…");
    try {
      const blob = add.blob;
      const box = fitBox(catBox(cat), await imageAspect(blob)).map((v) => Math.round(v * 10) / 10);
      const path = await upload("items", blob);
      const { data, error } = await cloud.sb.from("items").insert({ cat, name, img_path: path, box }).select().single();
      if (error) throw error;
      const urls = await signUrls([path]);
      items.push({ id: data.id, cat, name, img: urls[path], path, box });
      reindex();
      state.idx[cat] = byCat[cat].length - 1;
      saveCurrent();
      renderAll(); setFocus(cat);
      closeModal($("#addModal")); resetAdd();
      sfx.land(); toast("добавлено ✓");
    } catch (e) {
      console.error(e);
      addStatus("ошибка: " + (e.message || e));
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
    reindex(); renderAll(); sfx.click();
  }

  /* ---------- model photo ---------- */
  $("#modelFile").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const base = await downscale(f, 1600);
      let blob;
      try { blob = await removeBg(base, toast); }
      catch (err) { console.error(err); blob = base; toast("фон убрать не вышло, загружаю как есть"); }
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
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 2400);
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
    random: randomize,
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
  };

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-act]");
    if (a && actions[a.dataset.act]) { e.preventDefault(); return actions[a.dataset.act](a); }
    const n = e.target.closest("[data-nudge]");
    if (n) { const [dx, dy] = n.dataset.nudge.split(",").map(Number); return nudge(dx, dy); }
    const s = e.target.closest("[data-scale]");
    if (s) return scale(+s.dataset.scale);
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
    if (k === "ArrowUp" || k === "ArrowDown") {
      e.preventDefault();
      const i = CATS.indexOf(state.focus) + (k === "ArrowUp" ? -1 : 1);
      setFocus(CATS[(i + CATS.length) % CATS.length]); sfx.click();
    } else if (k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault(); step(state.focus, k === "ArrowLeft" ? -1 : 1);
    } else if (k === " ") {
      e.preventDefault(); randomize();
    } else if (k === "Enter") {
      e.preventDefault(); modal ? closeModal(modal) : openTryOn();
    } else if (k.toLowerCase() === "l" || k.toLowerCase() === "д") {
      like();
    }
  });

  /* ---------- init ---------- */
  async function init() {
    document.title = W.title;
    $("#title").textContent = W.title;
    $("#season").textContent = W.season;
    $("#soundBtn").classList.toggle("on", state.sound);
    applyTheme();
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
