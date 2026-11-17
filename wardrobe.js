/*
  Каталог гардероба.
  Чтобы добавить вещь: положи картинку (лучше PNG без фона) в папку items/
  и добавь строку в список items ниже.

  box — где вещь сидит на манекене, в координатах манекена 200×500
        ("x y ширина высота"). Если не указать, возьмётся стандартное место
        для категории, а точнее подогнать можно прямо на сайте:
        «Надень меня» → «Подогнать».
*/
window.WARDROBE = {
  title: "Гардероб Аси",
  season: "осень · 26",
  model: "items/doll.svg",           // потом можно заменить на фото Аси в полный рост

  categories: {
    top:    { label: "верх",  box: "36 66 128 176" },
    bottom: { label: "низ",   box: "56 192 88 140" },
    shoes:  { label: "обувь", box: "72 446 56 40" },
    bag:    { label: "сумки", box: "118 84 72 150" },
  },

  items: [
    { cat: "top",    name: "серое зип-худи",       img: "items/top-hoodie.svg",      box: "36 60 128 184" },
    { cat: "top",    name: "белая футболка",       img: "items/top-tee.svg",         box: "44 76 112 136" },
    { cat: "top",    name: "кожаная куртка",       img: "items/top-jacket.svg",      box: "36 70 128 166" },
    { cat: "top",    name: "бордовый кардиган",    img: "items/top-cardigan.svg",    box: "36 70 128 166" },

    { cat: "bottom", name: "мини-юбка в клетку",   img: "items/bottom-plaid.svg",    box: "56 192 88 104" },
    { cat: "bottom", name: "голубые джинсы",       img: "items/bottom-jeans.svg",    box: "62 192 76 278" },
    { cat: "bottom", name: "чёрные брюки",         img: "items/bottom-trousers.svg", box: "58 192 84 280" },
    { cat: "bottom", name: "плиссе миди",          img: "items/bottom-midi.svg",     box: "52 192 96 196" },

    { cat: "shoes",  name: "серые кроссовки",      img: "items/shoes-sneakers.svg",  box: "72 446 56 40" },
    { cat: "shoes",  name: "чёрные сапоги",        img: "items/shoes-boots.svg",     box: "72 380 56 108" },
    { cat: "shoes",  name: "мэри джейн",           img: "items/shoes-maryjanes.svg", box: "72 452 56 34" },

    { cat: "bag",    name: "коричневая сумка",     img: "items/bag-shoulder.svg",    box: "118 84 72 150" },
    { cat: "bag",    name: "чёрный шоппер",        img: "items/bag-tote.svg",        box: "118 84 72 176" },
    { cat: "bag",    name: "розовая мини",         img: "items/bag-mini.svg",        box: "118 84 64 136" },
  ],
};
