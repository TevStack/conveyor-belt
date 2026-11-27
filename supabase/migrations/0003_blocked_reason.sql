-- What an action is blocked by. Run once in the Supabase SQL editor.
alter table public.actions add column if not exists blocked_reason text;
