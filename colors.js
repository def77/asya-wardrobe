/*
  Цвета вещей и правила сочетаний — по статье Guess «Как сочетать цвета в одежде»:
  цветовой круг Иттена (монохром, аналоговая, комплементарная, триада), 2–4 цвета,
  правило 60-30-10, нейтральная база, один яркий акцент, готовые пары цветов, принты.
*/
(() => {
  "use strict";

  // hue — позиция на 12-частном круге Иттена (0 жёлтый, 2 оранжевый, 4 красный, 6 фиолетовый, 8 синий, 10 зелёный)
  // kind: neutral — базовые; deep — спокойные глубокие; soft — пастель; color — цветной; bright — яркий/активный
  // fam — семейство оттенков для монохрома
  const PALETTE = [
    { id: "white",      name: "белый",        hex: "#f6f5f1", kind: "neutral", fam: "grey" },
    { id: "milk",       name: "молочный",     hex: "#ece2cc", kind: "neutral", fam: "warm" },
    { id: "beige",      name: "бежевый",      hex: "#d6c09b", kind: "neutral", fam: "warm" },
    { id: "sand",       name: "песочный",     hex: "#c2a173", kind: "neutral", fam: "warm" },
    { id: "brown",      name: "коричневый",   hex: "#5e3b28", kind: "deep",    fam: "warm",   hue: 2 },
    { id: "grey",       name: "серый",        hex: "#9b9b9b", kind: "neutral", fam: "grey" },
    { id: "graphite",   name: "графитовый",   hex: "#45474b", kind: "neutral", fam: "grey" },
    { id: "black",      name: "чёрный",       hex: "#1a1a1c", kind: "neutral", fam: "grey" },
    { id: "navy",       name: "тёмно-синий",  hex: "#1e2946", kind: "deep",    fam: "blue",   hue: 8 },
    { id: "denim",      name: "деним",        hex: "#5a78a2", kind: "deep",    fam: "blue",   hue: 8 },
    { id: "blue",       name: "синий",        hex: "#2a4db0", kind: "color",   fam: "blue",   hue: 8 },
    { id: "lightblue",  name: "голубой",      hex: "#a8c6e6", kind: "soft",    fam: "blue",   hue: 8 },
    { id: "electric",   name: "электрик",     hex: "#1e5bff", kind: "bright",  fam: "blue",   hue: 8 },
    { id: "burgundy",   name: "бордовый",     hex: "#6b1f2b", kind: "deep",    fam: "red",    hue: 4 },
    { id: "red",        name: "красный",      hex: "#c81f2b", kind: "bright",  fam: "red",    hue: 4 },
    { id: "pink",       name: "розовый",      hex: "#eeb2c3", kind: "soft",    fam: "pink",   hue: 5 },
    { id: "fuchsia",    name: "фуксия",       hex: "#cf2480", kind: "bright",  fam: "pink",   hue: 5 },
    { id: "lavender",   name: "лавандовый",   hex: "#c2b3db", kind: "soft",    fam: "violet", hue: 6 },
    { id: "purple",     name: "фиолетовый",   hex: "#6b3e9c", kind: "color",   fam: "violet", hue: 6 },
    { id: "turquoise",  name: "бирюзовый",    hex: "#2fb2a6", kind: "color",   fam: "green",  hue: 9 },
    { id: "mint",       name: "мятный",       hex: "#bfe4cf", kind: "soft",    fam: "green",  hue: 10 },
    { id: "green",      name: "зелёный",      hex: "#2e8848", kind: "color",   fam: "green",  hue: 10 },
    { id: "khaki",      name: "хаки",         hex: "#6d6846", kind: "deep",    fam: "green",  hue: 11 },
    { id: "yellow",     name: "жёлтый",       hex: "#f0ce32", kind: "bright",  fam: "yellow", hue: 0 },
    { id: "mustard",    name: "горчичный",    hex: "#c2982b", kind: "color",   fam: "yellow", hue: 1 },
    { id: "orange",     name: "оранжевый",    hex: "#e8732a", kind: "bright",  fam: "orange", hue: 2 },
    { id: "terracotta", name: "терракотовый", hex: "#b4573a", kind: "color",   fam: "orange", hue: 3 },
    { id: "gold",       name: "золото",       hex: "#cba24c", kind: "metal",   fam: "metal" },
    { id: "silver",     name: "серебро",      hex: "#c2c3c7", kind: "metal",   fam: "metal" },
  ];
  const BY = Object.fromEntries(PALETTE.map((c) => [c.id, c]));

  /* ---------- colour maths ---------- */
  const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  function rgbLab([r, g, b]) {
    const f = (v) => { v /= 255; return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92; };
    const R = f(r), G = f(g), B = f(b);
    const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const Y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
  }
  const LABS = PALETTE.filter((c) => c.kind !== "metal").map((c) => [c.id, rgbLab(hexRgb(c.hex))]);
  const LW = 0.35;
  // dark fabric in photos is often near-black but still clearly tinted (deep burgundy, raw denim)
  const DARK_TINTS = ["burgundy", "navy", "brown", "khaki", "green"];
  const angle = (a, b) => Math.atan2(b, a);
  function nearest(rgb) {
    const [L, A, B] = rgbLab(rgb);
    const C = Math.hypot(A, B);
    if (L < 32 && C >= 4.5) {
      let best = null, bd = Infinity;
      for (const [id, [, a, b]] of LABS) {
        if (!DARK_TINTS.includes(id)) continue;
        let d = Math.abs(angle(A, B) - angle(a, b));
        if (d > Math.PI) d = 2 * Math.PI - d;
        if (d < bd) { bd = d; best = id; }
      }
      if (bd < 0.7) return best;
    }
    let best = null, bd = Infinity;
    for (const [id, [l, a, b]] of LABS) {
      const d = (L - l) ** 2 * LW + (A - a) ** 2 + (B - b) ** 2; // hue matters more than lightness (shadows on fabric)
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }

  /* ---------- detect an item's colours from its picture ---------- */
  function loadImage(src) {
    return new Promise((res, rej) => {
      const i = new Image();
      if (typeof src === "string" && /^https?:/.test(src)) i.crossOrigin = "anonymous";
      const url = typeof src === "string" ? src : URL.createObjectURL(src);
      i.onload = () => { if (typeof src !== "string") URL.revokeObjectURL(url); res(i); };
      i.onerror = () => rej(new Error("картинка не загрузилась"));
      i.src = url;
    });
  }
  // → ["main", ...more if it's a print / two-tone], most to least
  async function detect(src) {
    const img = await loadImage(src);
    const k = Math.min(1, 72 / Math.max(img.naturalWidth || 72, img.naturalHeight || 72));
    const w = Math.max(1, Math.round((img.naturalWidth || 72) * k)), h = Math.max(1, Math.round((img.naturalHeight || 72) * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    let transparent = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 200) transparent++;
    const cut = transparent / (w * h) > 0.03;
    const px = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (cut ? d[i + 3] < 220 : x < w * 0.2 || x > w * 0.8 || y < h * 0.2 || y > h * 0.8) continue; // photo with background: look at the middle only
      px.push([d[i], d[i + 1], d[i + 2]]);
    }
    if (!px.length) return [];
    // k-means, 4 clusters
    const K = Math.min(4, px.length);
    let cent = Array.from({ length: K }, (_, j) => px[Math.floor((j + 0.5) * px.length / K)].slice());
    const lab = px.map(rgbLab);
    let assign = new Array(px.length).fill(0);
    for (let it = 0; it < 8; it++) {
      const cl = cent.map(rgbLab);
      lab.forEach((p, i) => {
        let b = 0, bd = Infinity;
        cl.forEach((q, j) => { const dd = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (dd < bd) { bd = dd; b = j; } });
        assign[i] = b;
      });
      cent = cent.map((old, j) => {
        let n = 0; const s = [0, 0, 0];
        px.forEach((p, i) => { if (assign[i] === j) { n++; s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } });
        return n ? s.map((v) => v / n) : old;
      });
    }
    const share = {};
    cent.forEach((cc, j) => {
      const n = assign.filter((a) => a === j).length;
      if (!n) return;
      const id = nearest(cc);
      share[id] = (share[id] || 0) + n / px.length;
    });
    const ranked = Object.entries(share).sort((a, b) => b[1] - a[1]);
    // faded denim photographs as grey: if it's grey + denim / light blue in similar amounts, it's denim
    if (["grey", "white", "graphite"].includes(ranked[0][0]) && ranked[1] &&
        ["denim", "lightblue"].includes(ranked[1][0]) && ranked[1][1] >= 0.3) ranked.unshift(ranked.splice(1, 1)[0]);
    const main = ranked[0][0];
    const out = [main];
    // shading of one colour lands in the same family — a real second colour must be another family and big enough
    for (const [id, s] of ranked.slice(1)) {
      if (s >= 0.2 && out.length < 3 && !out.some((o) => BY[o].fam === BY[id].fam)) out.push(id);
    }
    return out;
  }

  /* ---------- rules ---------- */
  // how much of the look each kind of thing is (for 60-30-10)
  const AREA = { outer: 0.34, top: 0.28, dress: 0.5, bottom: 0.3, shoes: 0.07, bag: 0.08, hat: 0.04, jewelry: 0.02 };
  const ACCESSORY = new Set(["shoes", "bag", "hat", "jewelry"]);
  // pairs the article names as good together
  const GOOD = [
    ["beige", "sand"], ["lightblue", "denim"], ["grey", "graphite"],
    ["grey", "milk"], ["grey", "black"], ["grey", "lightblue"],
    ["burgundy", "black"], ["burgundy", "milk"], ["burgundy", "navy"], ["burgundy", "brown"],
    ["blue", "white"], ["blue", "grey"], ["blue", "beige"], ["blue", "brown"], ["blue", "denim"],
    ["navy", "white"], ["navy", "grey"], ["navy", "beige"], ["navy", "brown"], ["navy", "denim"],
    ["brown", "milk"], ["brown", "sand"], ["brown", "lightblue"], ["brown", "navy"],
    ["lightblue", "beige"], ["lightblue", "white"], ["lightblue", "grey"],
  ].map((p) => p.sort().join("+"));
  const CALM_BOTTOM = new Set(["beige", "black", "denim", "navy", "sand", "milk"]);
  const wheel = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

  const SCHEMES = {
    mono:    "монохром — оттенки одного цвета",
    neutral: "нейтральная база",
    calm:    "спокойная база + глубокий цвет",
    accent:  "база + яркий акцент (60-30-10)",
    color:   "база + цвет",
    analog:  "аналоговая — соседние цвета круга",
    compl:   "комплементарная — контраст в акценте",
    triad:   "триада",
    clash:   "спорное сочетание",
  };

  // items: [{ cat, colors: [...] }] → { score, scheme, label, palette: [{ id, share }] }
  function analyze(items) {
    const share = {};
    let known = 0;
    items.forEach((it) => {
      const a = AREA[it.cat] || 0.1;
      const cols = (it.colors || []).filter((c) => BY[c]);
      if (!cols.length) return;
      known += a;
      cols.forEach((c, i) => {
        const part = cols.length === 1 ? 1 : i === 0 ? 0.6 : 0.4 / (cols.length - 1);
        share[c] = (share[c] || 0) + a * part;
      });
    });
    if (!known) return { score: 0, scheme: null, label: "", palette: [] };
    Object.keys(share).forEach((k) => { share[k] /= known; });
    const ids = Object.keys(share).filter((id) => BY[id].kind !== "metal");
    const palette = ids.map((id) => ({ id, share: share[id] })).sort((a, b) => b.share - a.share);
    const kind = (id) => BY[id].kind;
    let score = 0;

    // 2–4 colours; one active colour at most
    if (ids.length > 4) score -= 5 * (ids.length - 4);
    const brights = ids.filter((id) => kind(id) === "bright");
    if (brights.length > 1) score -= 6 * (brights.length - 1);

    // a neutral / calm base under everything
    const base = ids.filter((id) => kind(id) === "neutral" || kind(id) === "deep").reduce((s, id) => s + share[id], 0);
    if (base < 0.35) score -= 4; else score += 1;

    // 60-30-10: one clearly leading colour
    if (palette[0] && palette[0].share >= 0.42) score += 1;

    // bright colours as small accents (accessories) or as a top over a calm bottom
    const byCat = Object.fromEntries(items.map((it) => [it.cat, it]));
    brights.forEach((id) => {
      const where = items.filter((it) => (it.colors || []).includes(id)).map((it) => it.cat);
      if (where.every((c) => ACCESSORY.has(c))) score += 2;
      else if (where.length === 1 && where[0] === "top" && CALM_BOTTOM.has(byCat.bottom?.colors?.[0])) score += 2;
      else if (share[id] > 0.35) score -= 2;
    });

    // scheme on Itten's wheel, judged by the actually coloured (non-neutral, non-deep) colours
    const fams = new Set(ids.map((id) => BY[id].fam));
    const active = ids.filter((id) => ["color", "bright", "soft"].includes(kind(id)));
    const hues = [...new Set(active.map((id) => BY[id].hue))];
    let scheme;
    if (fams.size === 1) { scheme = "mono"; score += 3; }
    else if (!hues.length) {
      scheme = ids.some((id) => kind(id) === "deep") ? "calm" : "neutral"; score += 2;
    } else if (hues.length === 1) {
      const s = active.reduce((t, id) => t + share[id], 0);
      scheme = s <= 0.25 ? "accent" : "color"; score += 2;
    } else if (hues.length === 2) {
      const d = wheel(hues[0], hues[1]);
      if (d <= 2) { scheme = "analog"; score += 2; }
      else if (d >= 5) {
        scheme = "compl";
        const minor = Math.min(...hues.map((h) => active.filter((id) => BY[id].hue === h).reduce((t, id) => t + share[id], 0)));
        score += minor <= 0.15 ? 2 : -2; // second colour only as a touch
      } else { scheme = "clash"; score -= 3; }
    } else if (hues.length === 3) {
      const ds = [wheel(hues[0], hues[1]), wheel(hues[1], hues[2]), wheel(hues[0], hues[2])];
      if (ds.every((d) => d >= 3 && d <= 5)) { scheme = "triad"; score += 1; } else { scheme = "clash"; score -= 4; }
    } else { scheme = "clash"; score -= 6; }

    // pairs from the article
    let pairs = 0;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      if (GOOD.includes([ids[i], ids[j]].sort().join("+"))) pairs++;
    }
    score += Math.min(3, pairs * 1.5);

    // prints: plain things should repeat colours that are in the print
    items.filter((it) => (it.colors || []).length >= 2).forEach((pr) => {
      items.forEach((it) => {
        if (it === pr || !(it.colors || []).length) return;
        const c = it.colors[0];
        if (kind(c) === "neutral" || kind(c) === "metal") return;
        score += pr.colors.includes(c) ? 1 : -1;
      });
    });

    return { score, scheme, label: SCHEMES[scheme], palette };
  }

  window.COLORS = { PALETTE, BY, detect, analyze, SCHEMES };
})();
