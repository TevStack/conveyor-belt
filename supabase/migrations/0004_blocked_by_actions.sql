-- Actions can be blocked by other actions. Run once in the Supabase SQL editor.
alter table public.actions add column if not exists blocked_by text[] not null default '{}';
create index if not exists actions_blocked_by_idx on public.actions using gin (blocked_by);
