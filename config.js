/*
  Подключение к Supabase. Оба значения публичные, их можно хранить в коде:
  доступ к данным закрыт паролем (RLS в supabase.sql).
  Где взять: Supabase → Project Settings → API (или Data API / API Keys)
    url — Project URL, вида https://xxxx.supabase.co
    key — anon / publishable key
  Пока поля пустые, сайт работает в демо-режиме с вещами-заглушками.
*/
window.CLOUD = {
  url: "",
  key: "",
};
