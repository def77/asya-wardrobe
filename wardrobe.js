/*
  Настройки гардероба и демо-каталог.
  Демо-вещи видны, пока никто не вошёл. Настоящие вещи Ася добавляет
  на сайте кнопкой «+ вещь», они хранятся в облаке.

  box — где вещь сидит на манекене, в координатах манекена 200×500
        ("x y ширина высота"). Подгоняется на сайте: «Надень меня» → «Подогнать».
  seasons — winter / spring / summer / autumn. Пусто = всесезонная.
*/
window.WARDROBE = {
  title: "Гардероб Аси",
  model: "items/doll.svg",

  // order = порядок слоёв на манекене снизу вверх
  // optional — можно выбрать «без» (не надевать)
  // box — стандартное место для новых фото этой категории
  categories: {
    top:     { label: "верх",       short: "верх",    box: "36 74 128 170" },
    bottom:  { label: "низ",        short: "низ",     box: "58 194 84 270" },
    dress:   { label: "платья",     short: "платья",  box: "44 76 112 260", optional: true }, // платье заменяет верх и низ
    outer:   { label: "верхняя",    short: "верхняя", box: "30 70 140 210", optional: true },
    hat:     { label: "головные",   short: "головн.", box: "72 6 56 44",    optional: true },
    shoes:   { label: "обувь",      short: "обувь",   box: "70 440 60 50" },
    jewelry: { label: "украшения",  short: "укр.",    box: "84 76 32 40",   optional: true },
    bag:     { label: "сумки",      short: "сумки",   box: "124 150 60 90" },
  },
  layers: ["shoes", "bottom", "dress", "top", "jewelry", "outer", "bag", "hat"],

  seasons: {
    winter: "зима",
    spring: "весна",
    summer: "лето",
    autumn: "осень",
  },

  items: [
    { cat: "top",     name: "серое зип-худи",     img: "items/top-hoodie.svg",      box: "36 60 128 184", seasons: ["autumn", "spring"] },
    { cat: "top",     name: "белая футболка",     img: "items/top-tee.svg",         box: "44 76 112 136", seasons: ["summer", "spring"] },
    { cat: "top",     name: "кожаная куртка",     img: "items/top-jacket.svg",      box: "36 70 128 166", seasons: ["autumn", "spring"] },
    { cat: "top",     name: "бордовый кардиган",  img: "items/top-cardigan.svg",    box: "36 70 128 166", seasons: ["autumn", "winter"] },

    { cat: "bottom",  name: "мини-юбка в клетку", img: "items/bottom-plaid.svg",    box: "56 192 88 104", seasons: ["autumn", "spring"] },
    { cat: "bottom",  name: "голубые джинсы",     img: "items/bottom-jeans.svg",    box: "62 192 76 278" },
    { cat: "bottom",  name: "чёрные брюки",       img: "items/bottom-trousers.svg", box: "58 192 84 280", seasons: ["autumn", "winter", "spring"] },
    { cat: "bottom",  name: "плиссе миди",        img: "items/bottom-midi.svg",     box: "52 192 96 196", seasons: ["summer", "spring"] },

    { cat: "dress",   name: "чёрное слип-платье", img: "items/dress-slip.svg",      box: "60 78 80 250",  seasons: ["summer", "spring", "autumn"] },
    { cat: "dress",   name: "платье в цветочек",  img: "items/dress-floral.svg",    box: "46 76 108 216", seasons: ["summer"] },

    { cat: "outer",   name: "бежевый тренч",      img: "items/outer-trench.svg",    box: "30 66 140 222", seasons: ["autumn", "spring"] },
    { cat: "outer",   name: "чёрный пуховик",     img: "items/outer-puffer.svg",    box: "28 62 144 192", seasons: ["winter"] },

    { cat: "hat",     name: "бордовая шапка",     img: "items/hat-beanie.svg",      box: "70 0 60 48",    seasons: ["winter", "autumn"] },
    { cat: "hat",     name: "чёрная кепка",       img: "items/hat-cap.svg",         box: "70 12 62 38",   seasons: ["summer", "spring"] },

    { cat: "shoes",   name: "серые кроссовки",    img: "items/shoes-sneakers.svg",  box: "72 446 56 40",  seasons: ["spring", "summer", "autumn"] },
    { cat: "shoes",   name: "чёрные сапоги",      img: "items/shoes-boots.svg",     box: "72 380 56 108", seasons: ["winter", "autumn"] },
    { cat: "shoes",   name: "мэри джейн",         img: "items/shoes-maryjanes.svg", box: "72 452 56 34",  seasons: ["spring", "summer"] },

    { cat: "jewelry", name: "жемчуг",             img: "items/jewelry-pearls.svg",  box: "84 76 32 38" },
    { cat: "jewelry", name: "цепочка с сердцем",  img: "items/jewelry-chain.svg",   box: "84 76 32 44" },

    { cat: "bag",     name: "коричневая сумка",   img: "items/bag-shoulder.svg",    box: "118 84 72 150" },
    { cat: "bag",     name: "чёрный шоппер",      img: "items/bag-tote.svg",        box: "118 84 72 176" },
    { cat: "bag",     name: "розовая мини",       img: "items/bag-mini.svg",        box: "118 84 64 136", seasons: ["summer", "spring"] },
  ],
};
