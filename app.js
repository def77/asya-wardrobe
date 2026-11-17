(() => {
  "use strict";
  const W = window.WARDROBE;
  const CATS = ["top", "bottom", "shoes", "bag"];
  const LAYER_Z = { shoes: 1, bottom: 2, top: 3, bag: 4 };
  const THEMES = ["", "pink", "green", "yellow"];
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];

  /* ---------- storage ---------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("wardrobe:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("wardrobe:" + k, JSON.stringify(v)); } catch {} },
  };

  /* ---------- data ---------- */
  W.items.forEach((it) => { it.id = it.id || it.img; });
  const byCat = Object.fromEntries(CATS.map((c) => [c, W.items.filter((i) => i.cat === c)]));
  const byId = Object.fromEntries(W.items.map((i) => [i.id, i]));
  const fits = store.get("fits", {});

  const saved = store.get("current", {});
  const state = {
    idx: Object.fromEntries(CATS.map((c) => {
      const i = byCat[c].findIndex((x) => x.id === saved[c]);
      return [c, Math.max(0, i)];
    })),
    focus: "top",
    sound: store.get("sound", true),
    theme: store.get("theme", ""),
    looks: store.get("looks", []),
    tuning: false,
    sel: null,
    spinning: false,
  };
  const current = (c) => byCat[c][state.idx[c]];
  const outfit = () => Object.fromEntries(CATS.map((c) => [c, current(c)?.id]));
  const saveCurrent = () => store.set("current", outfit());

  const boxOf = (item) => {
    const b = fits[item.id] || item.box || W.categories[item.cat].box;
    return (Array.isArray(b) ? b : String(b).trim().split(/\s+/)).map(Number);
  };

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
      <div class="slot-head"><span class="slot-count"></span></div>
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
      const b = e.target.closest("[data-step]");
      if (b) step(c, +b.dataset.step);
    });
  }

  function renderSlot(c, anim = true) {
    const el = $(`.board .slot[data-cat="${c}"]`);
    const list = byCat[c], it = current(c);
    $(".slot-count", el).textContent = `${W.categories[c].label} ${list.length ? state.idx[c] + 1 : 0}/${list.length}`;
    const box = $(".slot-img", el);
    if (!it) {
      box.innerHTML = `<div class="slot-empty">пусто<br>добавь вещи<br>в wardrobe.js</div>`;
      $(".slot-name", el).textContent = "";
      return;
    }
    let img = $("img", box);
    if (!img) { box.innerHTML = ""; img = document.createElement("img"); box.append(img); }
    img.src = it.img; img.alt = it.name;
    if (anim) { img.classList.remove("pop"); void img.offsetWidth; img.classList.add("pop"); }
    $(".slot-name", el).textContent = it.name;
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
    function finish() {
      state.spinning = false;
      sfx.land();
      saveCurrent();
      if (!$("#tryon").hidden) renderStage($("#stage"), outfit(), true);
    }
  }

  /* ---------- stage: mannequin + layered clothes ---------- */
  function renderStage(el, look, editable = false) {
    el.innerHTML = "";
    const model = document.createElement("img");
    model.className = "model"; model.src = W.model; model.alt = "";
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

  /* ---------- try-on window ---------- */
  function openTryOn() {
    $("#tryon").hidden = false;
    renderStage($("#stage"), outfit(), true);
    sfx.wear();
  }
  function closeTryOn() {
    $("#tryon").hidden = true;
    setTuning(false);
  }
  function setTuning(on) {
    state.tuning = on;
    if (!on) state.sel = null;
    $("#stage").classList.toggle("tuning", on);
    $("#tune").hidden = !on;
    $("#tuneBtn").textContent = on ? "готово" : "подогнать";
    updateTuneLabel();
    renderStage($("#stage"), outfit(), true);
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
  function setFit(id, box) {
    fits[id] = box.map((v) => Math.round(v * 10) / 10);
    store.set("fits", fits);
    const l = $(`#stage .layer[data-id="${CSS.escape(id)}"]`);
    if (l) placeLayer(l, fits[id]);
  }
  function nudge(dx, dy) {
    const it = byId[state.sel]; if (!it) return toast("сначала тапни вещь");
    const [x, y, w, h] = boxOf(it);
    setFit(it.id, [x + dx, y + dy, w, h]);
  }
  function scale(k) {
    const it = byId[state.sel]; if (!it) return toast("сначала тапни вещь");
    const [x, y, w, h] = boxOf(it);
    setFit(it.id, [x - (w * k - w) / 2, y - (h * k - h) / 2, w * k, h * k]);
  }
  function resetFit() {
    const it = byId[state.sel]; if (!it) return toast("сначала тапни вещь");
    delete fits[it.id]; store.set("fits", fits);
    renderStage($("#stage"), outfit(), true);
  }

  // drag layers with finger/mouse
  let drag = null;
  $("#stage").addEventListener("pointerdown", (e) => {
    if (!state.tuning) return;
    const l = e.target.closest(".layer"); if (!l) return;
    e.preventDefault();
    selectLayer(l.dataset.id);
    const it = byId[l.dataset.id];
    drag = { it, sx: e.clientX, sy: e.clientY, box: boxOf(it), k: 200 / $("#stage").clientWidth };
    $("#stage").setPointerCapture(e.pointerId);
  });
  $("#stage").addEventListener("pointermove", (e) => {
    if (!drag) return;
    const [x, y, w, h] = drag.box;
    const l = $(`#stage .layer[data-id="${CSS.escape(drag.it.id)}"]`);
    drag.now = [x + (e.clientX - drag.sx) * drag.k, y + (e.clientY - drag.sy) * drag.k, w, h];
    placeLayer(l, drag.now);
  });
  const endDrag = () => { if (drag?.now) setFit(drag.it.id, drag.now); drag = null; };
  $("#stage").addEventListener("pointerup", endDrag);
  $("#stage").addEventListener("pointercancel", endDrag);

  /* ---------- lookbook ---------- */
  function like() {
    const look = { ...outfit(), t: Date.now() };
    const key = (o) => CATS.map((c) => o[c]).join("|");
    if (state.looks.some((l) => key(l) === key(look))) return toast("этот образ уже в лукбуке");
    state.looks.unshift(look);
    store.set("looks", state.looks);
    sfx.like();
    toast("♥ сохранено в лукбук");
    renderLookTab();
  }
  function renderLookTab() {
    $("#lookTab").textContent = `лукбук · ${state.looks.length}`;
  }
  function renderLookbook() {
    const g = $("#lookbookGrid");
    g.innerHTML = "";
    if (!state.looks.length) {
      g.innerHTML = `<div class="lookbook-empty">тут пока пусто<br>собери образ и жми «♥ в лукбук»</div>`;
      return;
    }
    state.looks.forEach((look, i) => {
      const card = document.createElement("div");
      card.className = "look"; card.title = "открыть образ";
      const st = document.createElement("div"); st.className = "stage";
      renderStage(st, look);
      const date = new Date(look.t).toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      card.append(st);
      card.insertAdjacentHTML("beforeend", `<div class="look-date">${date}</div><button class="look-del" aria-label="удалить">×</button>`);
      card.addEventListener("click", (e) => {
        if (e.target.closest(".look-del")) {
          state.looks.splice(i, 1); store.set("looks", state.looks);
          renderLookbook(); renderLookTab(); sfx.click();
          return;
        }
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

  /* ---------- misc ---------- */
  let toastT;
  function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), 1600);
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
    close: closeTryOn,
    tune: () => setTuning(!state.tuning),
    resetfit: resetFit,
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
    if (a && actions[a.dataset.act]) return actions[a.dataset.act]();
    const n = e.target.closest("[data-nudge]");
    if (n) { const [dx, dy] = n.dataset.nudge.split(",").map(Number); return nudge(dx, dy); }
    const s = e.target.closest("[data-scale]");
    if (s) return scale(+s.dataset.scale);
    const t = e.target.closest("[data-tab]");
    if (t) { sfx.click(); return switchTab(t.dataset.tab); }
    if (e.target.id === "tryon") closeTryOn();
  });

  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const modal = !$("#tryon").hidden;
    const k = e.key;
    if (k === "Escape" && modal) return closeTryOn();
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
      e.preventDefault(); modal ? closeTryOn() : openTryOn();
    } else if (k.toLowerCase() === "l" || k.toLowerCase() === "д") {
      like();
    }
  });

  /* ---------- init ---------- */
  document.title = W.title;
  $("#title").textContent = document.title;
  $("#season").textContent = W.season;
  $("#soundBtn").classList.toggle("on", state.sound);
  applyTheme();
  $$(".board .slot").forEach(buildSlot);
  CATS.forEach((c) => renderSlot(c, false));
  setFocus("top");
  renderLookTab();
  W.items.forEach((it) => { new Image().src = it.img; });
})();
