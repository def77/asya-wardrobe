/*
  Подключение к Supabase. Оба значения публичные, их можно хранить в коде:
  доступ к данным закрыт паролем (RLS в supabase.sql).
  Где взять: Supabase → Project Settings → API (или Data API / API Keys)
    url — Project URL, вида https://xxxx.supabase.co
    key — anon / publishable key
  Пока поля пустые, сайт работает в демо-режиме с вещами-заглушками.
*/
window.CLOUD = {
  url: "https://torniujpwjcmgaqywgzx.supabase.co",
  key: "sb_publishable_TjECQCZSa68PkGp2E0Gjew_RDJoRVFa",
};
