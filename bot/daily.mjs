/*
  Телеграм-бот «образ на сегодня».
  Каждое утро (GitHub Actions, .github/workflows/daily-lookbook.yml):
  погода → подбор образов по тем же правилам, что на сайте (сезон, куртка/шапка по погоде,
  сочетания цветов из colors.js) → коллаж-картинки → альбом в Telegram.

  Переменные окружения (секреты репозитория):
    TELEGRAM_BOT_TOKEN  токен от @BotFather
    TELEGRAM_CHAT_ID    кому слать (можно несколько через запятую)
    BOT_EMAIL, BOT_PASSWORD  аккаунт бота в Supabase (Authentication → Users)
    CITY                город для погоды (по умолчанию Москва)
    OPTIONS             сколько образов прислать (по умолчанию 3)
  Режимы:
    MODE=chats   показать chat id тех, кто написал боту (чтобы узнать TELEGRAM_CHAT_ID)
    DRY_RUN=1    ничего не отправлять, сохранить картинки и текст в bot/out/
    DEMO=1       взять демо-вещи из wardrobe.js вместо облака (для проверки)
    WEATHER_JSON подставить погоду вместо запроса (для проверки)
*/
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;
const SITE = env.SITE_URL || "https://def77.github.io/asya-wardrobe/";
const OPTIONS = Math.max(1, Math.min(10, Number(env.OPTIONS) || 3));

/* ---------- shared site code: wardrobe settings, colour rules, cloud config ---------- */
const sandbox = { window: {} };
vm.createContext(sandbox);
for (const f of ["wardrobe.js", "colors.js", "config.js"]) vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sandbox);
const W = sandbox.window.WARDROBE, COLORS = sandbox.window.COLORS, CLOUD = sandbox.window.CLOUD;
const CATS = Object.keys(W.categories);
const isOpt = (c) => !!W.categories[c].optional;
const SEPARATES = ["top", "bottom"];
const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const fitsSeason = (it, seasons) => !it.seasons?.length || it.seasons.some((s) => seasons.includes(s));
const parseBox = (b) => (Array.isArray(b) ? b : String(b).trim().split(/\s+/)).map(Number);

/* ---------- telegram ---------- */
async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, { method: "POST", body });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

if (env.MODE === "chats") {
  const ups = await tg("getUpdates", new URLSearchParams({ limit: "100" }));
  const chats = new Map();
  ups.forEach((u) => { const c = (u.message || u.my_chat_member || u.channel_post)?.chat; if (c) chats.set(c.id, c); });
  if (!chats.size) console.log("Боту пока никто не писал. Открой бота в Telegram, нажми «Старт» и запусти ещё раз.");
  for (const c of chats.values()) console.log(`chat id: ${c.id}  —  ${[c.first_name, c.last_name].filter(Boolean).join(" ") || c.title || ""} ${c.username ? "@" + c.username : ""}`);
  process.exit(0);
}

/* ---------- wardrobe ---------- */
async function loadItems() {
  if (env.DEMO) {
    return W.items.map((i) => ({ ...i, id: i.img, seasons: i.seasons || [], colors: i.colors || [], src: path.join(ROOT, i.img) }));
  }
  const sb = createClient(CLOUD.url, CLOUD.key, { auth: { persistSession: false } });
  const { error: le } = await sb.auth.signInWithPassword({ email: env.BOT_EMAIL, password: env.BOT_PASSWORD });
  if (le) throw new Error("вход в Supabase: " + le.message);
  const { data, error } = await sb.from("items").select("*");
  if (error) throw error;
  const paths = data.map((r) => r.img_path);
  const { data: signed, error: se } = paths.length ? await sb.storage.from("wardrobe").createSignedUrls(paths, 3600) : { data: [] };
  if (se) throw se;
  return data.map((r, i) => ({
    id: r.id, cat: r.cat, name: r.name, box: r.box, seasons: r.seasons || [], colors: r.colors || [], src: signed[i]?.signedUrl,
  })).filter((it) => it.src && W.categories[it.cat]);
}

async function imageOf(src) {
  if (/^https?:/.test(src)) {
    const r = await fetch(src);
    if (!r.ok) throw new Error("картинка не скачалась: " + r.status);
    return loadImage(Buffer.from(await r.arrayBuffer()));
  }
  return loadImage(fs.readFileSync(src));
}

const METAL = { mustard: "gold", yellow: "gold", sand: "gold", beige: "gold", brown: "gold", grey: "silver", graphite: "silver" };
// colours for things the site hasn't worked out yet
async function ensureColors(items) {
  for (const it of items) {
    if (it.colors?.length) continue;
    try {
      const img = await imageOf(it.src);
      const k = Math.min(1, 72 / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * k)), h = Math.max(1, Math.round(img.height * k));
      const c = createCanvas(w, h); const ctx = c.getContext("2d"); ctx.drawImage(img, 0, 0, w, h);
      it.colors = COLORS.fromPixels(ctx.getImageData(0, 0, w, h).data, w, h);
      if (it.cat === "jewelry") it.colors = [...new Set(it.colors.map((c) => METAL[c] || c))];
    } catch (e) { console.warn("цвет не определился:", it.name, e.message); }
  }
}

/* ---------- weather (Open-Meteo, no key) ---------- */
const WMO = {
  0: "ясно", 1: "почти ясно", 2: "переменная облачность", 3: "пасмурно", 45: "туман", 48: "туман",
  51: "морось", 53: "морось", 55: "морось", 56: "ледяная морось", 57: "ледяная морось",
  61: "дождь", 63: "дождь", 65: "ливень", 66: "ледяной дождь", 67: "ледяной дождь",
  71: "снег", 73: "снег", 75: "снегопад", 77: "снежная крупа", 80: "ливень", 81: "ливень", 82: "сильный ливень",
  85: "снег", 86: "снегопад", 95: "гроза", 96: "гроза с градом", 99: "гроза с градом",
};
const deg = (t) => `${t > 0 ? "+" : ""}${Math.round(t)}°`;
async function getWeather(city) {
  if (env.WEATHER_JSON) return JSON.parse(env.WEATHER_JSON);
  const g = await (await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=ru`)).json();
  const p = g.results?.[0];
  if (!p) throw new Error(`город «${city}» не найден`);
  const d = await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}` +
    "&current=temperature_2m,apparent_temperature,weather_code" +
    "&daily=temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1")).json();
  return {
    place: p.name, t: d.current.temperature_2m, feels: d.current.apparent_temperature, code: d.current.weather_code,
    dcode: d.daily.weather_code[0], tmin: d.daily.temperature_2m_min[0], tmax: d.daily.temperature_2m_max[0],
    feelsMax: d.daily.apparent_temperature_max[0], rain: d.daily.precipitation_probability_max[0] ?? 0,
  };
}
// same thresholds as the site («что надеть сегодня»); in the morning we dress for the day, so
// take the colder of "now" and the middle of the day's feels-like range
function weatherPlan(w) {
  const t = Math.min(w.feels, w.feelsMax != null ? (w.feels + w.feelsMax) / 2 : w.feels);
  const codes = [w.code, w.dcode];
  const wet = w.rain >= 50 || codes.some((c) => (c >= 51 && c <= 67) || (c >= 80 && c <= 82) || c >= 95);
  const snow = codes.some((c) => (c >= 71 && c <= 77) || c === 85 || c === 86);
  const seasons = t <= 0 ? ["winter"] : t <= 8 ? ["winter", "autumn", "spring"] : t <= 16 ? ["autumn", "spring"]
    : t <= 22 ? ["spring", "summer", "autumn"] : ["summer"];
  return {
    t, seasons, wet, snow,
    outer: t < 16 || wet || snow ? "need" : t > 22 ? "no" : "maybe",
    layer: t > 20 ? "no" : "maybe",
    hat: t <= 3 || snow ? "need" : "maybe",
  };
}
function seasonByMonth() {
  const m = new Date().getMonth();
  const s = m <= 1 || m === 11 ? "winter" : m <= 4 ? "spring" : m <= 7 ? "summer" : "autumn";
  return { t: null, seasons: [s], wet: false, snow: false, outer: s === "summer" ? "no" : "maybe", layer: s === "summer" ? "no" : "maybe", hat: s === "winter" ? "need" : "maybe" };
}

/* ---------- picking outfits (mirrors app.js) ---------- */
function makePicker(items) {
  const byCat = Object.fromEntries(CATS.map((c) => [c, items.filter((i) => i.cat === c)]));
  function targets(p) {
    const t = Object.fromEntries(CATS.map((c) => {
      const list = byCat[c];
      const ok = list.filter((it) => fitsSeason(it, p.seasons));
      if (c === "dress") return [c, null];
      if (isOpt(c)) {
        const mode = c === "outer" ? p.outer : c === "hat" ? p.hat : c === "layer" ? p.layer : "maybe";
        if (mode === "no" || !ok.length) return [c, null];
        if (mode === "maybe" && Math.random() < (c === "hat" ? 0.65 : 0.4)) return [c, null];
        const warmest = mode === "need" ? ok.filter((it) => it.seasons?.includes(p.seasons[0])) : [];
        return [c, rnd(warmest.length ? warmest : ok)];
      }
      if (!list.length) return [c, null];
      // shoes: prefer ones made for the main season of the weather (boots in the cold, sandals in the heat)
      const main = c === "shoes" ? ok.filter((it) => it.seasons?.includes(p.seasons[0])) : [];
      return [c, main.length ? rnd(main) : ok.length ? rnd(ok) : rnd(list)];
    }));
    const dresses = (byCat.dress || []).filter((it) => fitsSeason(it, p.seasons));
    if (dresses.length && (SEPARATES.every((c) => !t[c]) || Math.random() < 0.3)) {
      t.dress = rnd(dresses);
      SEPARATES.forEach((c) => { t[c] = null; });
    }
    return t;
  }
  const key = (t) => CATS.map((c) => t[c]?.id || "").join("|");
  // several good and different outfits
  return function pick(p, n) {
    const pool = [], seen = new Set();
    for (let i = 0; i < 1500; i++) {
      const t = targets(p), k = key(t);
      if (seen.has(k) || !CATS.some((c) => t[c])) continue;
      seen.add(k);
      pool.push({ t, a: COLORS.analyze(CATS.map((c) => t[c]).filter(Boolean)) });
    }
    pool.sort((x, y) => y.a.score - x.a.score);
    const BIG = ["outer", "layer", "top", "bottom", "dress"];
    const usedScheme = {}, usedItem = {}, chosen = [];
    while (chosen.length < n && pool.length) {
      let best = 0, bestV = -Infinity;
      pool.slice(0, 300).forEach((o, i) => {
        const v = o.a.score - 2 * (usedScheme[o.a.scheme] || 0) -
          2 * BIG.reduce((s, c) => s + (o.t[c] ? usedItem[o.t[c].id] || 0 : 0), 0) + Math.random() * 0.8;
        if (v > bestV) { bestV = v; best = i; }
      });
      const o = pool.splice(best, 1)[0];
      chosen.push(o);
      usedScheme[o.a.scheme] = (usedScheme[o.a.scheme] || 0) + 1;
      BIG.forEach((c) => { if (o.t[c]) usedItem[o.t[c].id] = (usedItem[o.t[c].id] || 0) + 1; });
    }
    return chosen;
  };
}

/* ---------- collage picture (mirrors collageLayout in app.js) ---------- */
const WEIGHT = { outer: 1.35, layer: 1.0, top: 1.05, dress: 1.75, bottom: 1.8, shoes: 0.55, bag: 0.75, hat: 0.45, jewelry: 0.35 };
function collageLayout(t) {
  const has = (c) => !!t[c];
  const ORDER = ["hat", "outer", "layer", "top", "jewelry", "bag", "dress", "bottom", "shoes"];
  const SMALL = ["hat", "jewelry", "bag", "shoes"], LOWER = ["dress", "bottom", "shoes"];
  const byBody = (a) => a.sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
  let L = ["hat", "outer", "layer", has("dress") ? null : "top"].filter((c) => c && has(c));
  let R = ["jewelry", "bag", has("dress") ? "dress" : "bottom", "shoes"].filter((c) => has(c));
  const bb = has("bottom") ? parseBox(t.bottom.box || W.categories.bottom.box) : null;
  const wt = (c) => (c === "bottom" && bb && bb[3] < 220 ? 1.05 : WEIGHT[c]);
  const sum = (a) => a.reduce((s, c) => s + wt(c), 0);
  for (let g = 0; g < 4; g++) {
    const d = sum(L) - sum(R);
    const from = d > 1.1 ? L : d < -1.1 ? R : null;
    if (!from) break;
    const c = ["jewelry", "hat", "bag", "shoes"].find((x) => from.includes(x));
    if (!c || from.length === 1) break;
    if (from === L) { L = L.filter((x) => x !== c); R.push(c); } else { R = R.filter((x) => x !== c); L.push(c); }
  }
  byBody(L); byBody(R);
  if (!L.length) [L, R] = [R, []];
  const cols = [L, R].filter((a) => a.length);
  const X = cols.length === 2 ? [[0.04, 0.47], [0.51, 0.45]] : [[0.2, 0.6]];
  const PAD = 0.035, GAP = 0.02, out = [];
  const avail = (col) => 1 - 2 * PAD - GAP * (col.length - 1);
  const unit = Math.min(...cols.map((col) => avail(col) / sum(col)));
  cols.forEach((col, ci) => {
    const [x, w] = X[ci];
    const spare = avail(col) - unit * sum(col);
    const firstLow = col.findIndex((c) => LOWER.includes(c));
    let y = PAD;
    col.forEach((c, i) => {
      if (i === firstLow) y += spare;
      const h = unit * wt(c);
      const ww = SMALL.includes(c) && c !== "bag" ? w * 0.78 : w;
      out.push({ it: t[c], rect: [x + (w - ww) / 2, y, ww, h] });
      y += h + GAP;
    });
  });
  return out;
}
async function renderCollage(t) {
  const W0 = 1080, H0 = 1440;
  const c = createCanvas(W0, H0); const ctx = c.getContext("2d");
  ctx.fillStyle = "#f4f1ec"; ctx.fillRect(0, 0, W0, H0);
  for (const { it, rect: [x, y, w, h] } of collageLayout(t)) {
    try {
      const img = await imageOf(it.src);
      const k = Math.min((w * W0) / img.width, (h * H0) / img.height);
      const dw = img.width * k, dh = img.height * k;
      ctx.drawImage(img, x * W0 + (w * W0 - dw) / 2, y * H0 + (h * H0 - dh) / 2, dw, dh);
    } catch (e) { console.warn("не нарисовалась вещь:", it.name, e.message); }
  }
  return c.encode("jpeg", 88);
}

/* ---------- main ---------- */
const city = env.CITY || "Москва";
const items = await loadItems();
if (!items.length) throw new Error("в гардеробе пока нет вещей");
await ensureColors(items);

let w = null, plan;
try { w = await getWeather(city); plan = weatherPlan(w); }
catch (e) { console.warn("погода недоступна:", e.message); plan = seasonByMonth(); }

const picks = makePicker(items)(plan, OPTIONS);
if (!picks.length) throw new Error("не получилось собрать образ");

const date = new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const lines = [`☀️ Образы на сегодня, ${date}`];
if (w) {
  lines.push(`${w.place || city}: ${deg(w.t)}, ощущается ${deg(w.feels)}, ${WMO[w.code] || ""} · днём ${deg(w.tmin)}…${deg(w.tmax)}`);
  const hasOuter = items.some((i) => i.cat === "outer" && fitsSeason(i, plan.seasons));
  lines.push([
    plan.outer === "need" ? (hasOuter ? "нужна куртка" : "нужна куртка (добавь верхнюю одежду)") : plan.outer === "no" ? "можно без куртки" : "куртка по желанию",
    plan.wet && "☂️ возьми зонт", plan.snow && "❄️ снег",
  ].filter(Boolean).join(" · "));
}
lines.push("");
picks.forEach((o, i) => {
  const names = CATS.map((c) => o.t[c]).filter(Boolean).map((it) => it.name);
  lines.push(`${i + 1}) ${o.a.label || "образ"}: ${names.join(", ")}`);
});
lines.push("", SITE);
const caption = lines.join("\n").slice(0, 1024);

const photos = [];
for (const o of picks) photos.push(await renderCollage(o.t));

if (env.DRY_RUN) {
  const out = path.join(ROOT, "bot", "out"); fs.mkdirSync(out, { recursive: true });
  photos.forEach((p, i) => fs.writeFileSync(path.join(out, `look-${i + 1}.jpg`), p));
  fs.writeFileSync(path.join(out, "caption.txt"), caption);
  console.log(caption, `\n\n→ ${photos.length} картинки в bot/out/`);
  process.exit(0);
}

for (const chat of String(env.TELEGRAM_CHAT_ID || "").split(",").map((s) => s.trim()).filter(Boolean)) {
  const form = new FormData();
  form.append("chat_id", chat);
  if (photos.length === 1) {
    form.append("photo", new Blob([photos[0]], { type: "image/jpeg" }), "look.jpg");
    form.append("caption", caption);
    await tg("sendPhoto", form);
  } else {
    form.append("media", JSON.stringify(photos.map((_, i) => ({ type: "photo", media: `attach://p${i}`, ...(i === 0 ? { caption } : {}) }))));
    photos.forEach((p, i) => form.append(`p${i}`, new Blob([p], { type: "image/jpeg" }), `look-${i + 1}.jpg`));
    await tg("sendMediaGroup", form);
  }
  console.log("отправлено в", chat);
}
