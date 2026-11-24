-- Helpers on actions: one owner stays responsible, helpers can see and update the action.
-- Run once in the Supabase SQL editor.

alter table public.actions
  add column if not exists helpers text[] not null default '{}';

create index if not exists actions_helpers_idx on public.actions using gin (helpers);

drop policy if exists "owners, leads, admins edit" on public.actions;
create policy "owners, helpers, leads, admins edit" on public.actions for update to authenticated
  using (
    public.my_role() = 'admin'
    or (public.my_role() in ('lead','member') and (owner_id = public.my_person_id() or owner_id is null or public.my_person_id() = any(helpers)))
    or (public.my_role() = 'lead' and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = public.my_person_id()))
  )
  with check (public.my_role() in ('admin','lead','member'));
