# TEJAM Mini App

Telegram Mini App: список покупок → сравнение цен магазинов с учётом дороги → цены от самих магазинов.
Стек: React + Vite, Supabase (база + Edge Function), Vercel.

## Запуск с телефона, по шагам

1. **Supabase.** Создайте проект. В SQL Editor вставьте весь `supabase/schema.sql` и нажмите Run. Это создаст таблицы, защиту (RLS) и демо-данные с выдуманными ценами.
2. **Edge Function.** Supabase → Edge Functions → создать функцию `tejam-api` (через Editor), вставить код из `supabase/functions/tejam-api/index.ts`. В Secrets добавить `BOT_TOKEN` (токен бота из @BotFather).
3. **GitHub.** Создайте репозиторий и загрузите все файлы проекта (кроме `supabase/`, он нужен только для справки).
4. **Vercel.** Импортируйте репозиторий. В Environment Variables добавьте `VITE_SUPABASE_URL` и `VITE_SUPABASE_ANON_KEY` (Supabase → Project Settings → API; нужен именно anon key). Deploy.
5. **BotFather.** `/newapp` (или Menu Button): укажите ссылку Vercel. Откройте бота в Telegram.
6. **Магазин-владелец.** Узнайте Telegram ID владельца и добавьте его в `store_owners` (пример внизу `schema.sql`). Тогда вкладка «Магазин» откроет редактирование цен.

## Важно
- Демо-цены выдуманы. Перед запуском: `delete from stores where is_demo; delete from products where is_demo;`.
- Дорога считается по прямой x 1.3, туда и обратно, по ставке «сум за км» (меняется на экране «Сравнение»). Это оценка.
- Список покупок, язык и ставка хранятся на устройстве.
- Семейный бюджет в этой версии не реализован (следующий этап по плану).
