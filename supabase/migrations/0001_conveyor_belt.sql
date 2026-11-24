-- Conveyor Belt: tables, permissions and starting data.
-- Paste this whole file into the Supabase SQL editor and run it once.
--
-- BEFORE YOU RUN IT: put your own work email in the line marked "YOUR EMAIL"
-- near the bottom, so you're the first admin when you sign in.

create extension if not exists pgcrypto;

-- ---------- tables ----------

create table public.departments (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  external boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table public.people (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  email text,
  dept text references public.departments(id) on delete set null,
  role text not null default 'member' check (role in ('admin','lead','member','viewer')),
  user_id uuid unique references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create unique index people_email_unique on public.people (lower(email)) where email is not null;

create table public.projects (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  stream text,
  region text check (region in ('uk','ie','both')),
  stage int not null default 0 check (stage between 0 and 5),
  status text not null default 'ok' check (status in ('ok','risk','blocked','paused')),
  owner_id text references public.people(id) on delete set null,
  suggested_lead text,
  due date,
  summary text,
  blockers text,
  link text,
  next_step text,
  next_owner text references public.people(id) on delete set null,
  next_by date,
  stage_log jsonb not null default '[]'::jsonb,
  date_log jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table public.actions (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  text text not null,
  state text not null default 'todo' check (state in ('todo','doing','waiting','blocked','done')),
  owner_id text references public.people(id) on delete set null,
  suggested_lead text,
  dept text references public.departments(id) on delete set null,
  waiting_on text references public.departments(id) on delete set null,
  due date,
  done_at timestamptz,
  date_log jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);
create index actions_project_idx on public.actions(project_id);

create table public.updates (
  id text primary key default gen_random_uuid()::text,
  project_id text not null references public.projects(id) on delete cascade,
  text text not null,
  by_id text references public.people(id) on delete set null,
  created_at timestamptz not null default now()
);
create index updates_project_idx on public.updates(project_id);

create table public.milestones (
  id text primary key default gen_random_uuid()::text,
  label text not null,
  date date not null,
  kind text not null default 'milestone' check (kind in ('milestone','release')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text
);

create table public.absences (
  id text primary key default gen_random_uuid()::text,
  person_id text not null references public.people(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  check (to_date >= from_date)
);

create table public.decisions (
  id text primary key default gen_random_uuid()::text,
  text text not null,
  project_id text references public.projects(id) on delete set null,
  by_id text references public.people(id) on delete set null,
  at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- ---------- who am I ----------

create or replace function public.my_person_id() returns text
language sql stable security definer set search_path = public as $$
  select id from public.people where user_id = auth.uid()
$$;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.people where user_id = auth.uid()
$$;

create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.people where user_id = auth.uid())
$$;

-- Called by the app after sign-in: links the signed-in account to the People row with the same email.
create or replace function public.link_me() returns public.people
language plpgsql security definer set search_path = public as $$
declare
  me public.people;
begin
  select * into me from public.people where user_id = auth.uid();
  if found then return me; end if;
  update public.people
     set user_id = auth.uid(), updated_at = now()
   where user_id is null
     and email is not null
     and lower(email) = lower(auth.jwt() ->> 'email')
  returning * into me;
  return me;
end $$;

grant execute on function public.my_person_id(), public.my_role(), public.is_member(), public.link_me() to authenticated;

-- ---------- permissions ----------
-- Everyone on the People list can see everything. Writes follow the roles:
-- viewer (read only), member (own actions, add actions, own time off), lead (own initiatives),
-- admin (everything, including people and departments).

alter table public.departments enable row level security;
alter table public.people      enable row level security;
alter table public.projects    enable row level security;
alter table public.actions     enable row level security;
alter table public.updates     enable row level security;
alter table public.milestones  enable row level security;
alter table public.absences    enable row level security;
alter table public.decisions   enable row level security;
alter table public.settings    enable row level security;

-- read
create policy "members read" on public.departments for select to authenticated using (public.is_member());
create policy "members read" on public.people      for select to authenticated using (public.is_member());
create policy "members read" on public.projects    for select to authenticated using (public.is_member());
create policy "members read" on public.actions     for select to authenticated using (public.is_member());
create policy "members read" on public.updates     for select to authenticated using (public.is_member());
create policy "members read" on public.milestones  for select to authenticated using (public.is_member());
create policy "members read" on public.absences    for select to authenticated using (public.is_member());
create policy "members read" on public.decisions   for select to authenticated using (public.is_member());
create policy "members read" on public.settings    for select to authenticated using (public.is_member());

-- departments + people: admins
create policy "admins write" on public.departments for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "admins write" on public.people for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- projects
create policy "leads add" on public.projects for insert to authenticated
  with check (public.my_role() in ('admin','lead'));
create policy "admins or own lead edit" on public.projects for update to authenticated
  using (public.my_role() = 'admin' or (public.my_role() = 'lead' and (owner_id = public.my_person_id() or owner_id is null)))
  with check (public.my_role() in ('admin','lead'));
create policy "admins delete" on public.projects for delete to authenticated
  using (public.my_role() = 'admin');

-- actions
create policy "members add" on public.actions for insert to authenticated
  with check (public.my_role() in ('admin','lead','member'));
create policy "owners, leads, admins edit" on public.actions for update to authenticated
  using (
    public.my_role() = 'admin'
    or (public.my_role() in ('lead','member') and (owner_id = public.my_person_id() or owner_id is null))
    or (public.my_role() = 'lead' and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = public.my_person_id()))
  )
  with check (public.my_role() in ('admin','lead','member'));
create policy "leads, admins delete" on public.actions for delete to authenticated
  using (
    public.my_role() = 'admin'
    or (public.my_role() = 'lead' and exists (select 1 from public.projects p where p.id = project_id and p.owner_id = public.my_person_id()))
  );

-- updates (project notes)
create policy "members post" on public.updates for insert to authenticated
  with check (public.my_role() in ('admin','lead','member') and by_id = public.my_person_id());
create policy "admins delete" on public.updates for delete to authenticated
  using (public.my_role() = 'admin');

-- milestones, settings: leads and admins
create policy "leads write" on public.milestones for all to authenticated
  using (public.my_role() in ('admin','lead')) with check (public.my_role() in ('admin','lead'));
create policy "leads write" on public.settings for all to authenticated
  using (public.my_role() in ('admin','lead')) with check (public.my_role() in ('admin','lead'));

-- decisions: leads add, admins remove
create policy "leads add" on public.decisions for insert to authenticated
  with check (public.my_role() in ('admin','lead'));
create policy "admins delete" on public.decisions for delete to authenticated
  using (public.my_role() = 'admin');

-- time off: your own, or anyone's if you're an admin
create policy "own or admin" on public.absences for all to authenticated
  using (public.my_role() = 'admin' or (public.my_role() <> 'viewer' and person_id = public.my_person_id()))
  with check (public.my_role() = 'admin' or (public.my_role() <> 'viewer' and person_id = public.my_person_id()));

-- ---------- live updates ----------
alter publication supabase_realtime add table
  public.departments, public.people, public.projects, public.actions, public.updates,
  public.milestones, public.absences, public.decisions, public.settings;

-- ---------- starting data ----------

insert into public.departments (id, name, external, sort_order) values
  ('leadership',       'Leadership',           false, 1),
  ('solutions-factory','Solutions Factory',    false, 2),
  ('gemstone',         'Gemstone & systems',   false, 3),
  ('fulfilment',       'Fulfilment',           false, 4),
  ('testing-ops',      'Testing & operations', false, 5),
  ('sales-excellence', 'Sales Excellence',     false, 6),
  ('marketing',        'Marketing',            false, 7),
  ('naviga',           'Naviga',               true, 20),
  ('ekcs',             'EKCS',                 true, 21);

insert into public.people (id, name, email, dept, role) values
  ('tom',      'Tom Evans',        'YOUR EMAIL', 'solutions-factory', 'admin'),   -- <- YOUR EMAIL: replace with your work email
  ('morgan',   'Morgan',           null, 'leadership',        'admin'),
  ('james',    'James',            null, 'solutions-factory', 'lead'),
  ('lawrence', 'Lawrence',         null, 'solutions-factory', 'lead'),
  ('helen',    'Helen',            null, 'solutions-factory', 'member'),
  ('jade',     'Jade',             null, 'solutions-factory', 'member'),
  ('ryan',     'Ryan',             null, 'solutions-factory', 'member'),
  ('dave',     'Dave Turner',      null, 'gemstone',          'lead'),
  ('sarah',    'Sarah Jarvis',     null, 'fulfilment',        'lead'),
  ('gill',     'Gill Culshaw',     null, 'testing-ops',       'lead'),
  ('nat',      'Nat T',            null, 'sales-excellence',  'member'),
  ('joe',      'Joe C',            null, 'sales-excellence',  'member'),
  ('natalie',  'Natalie Coughlan', null, 'marketing',         'lead');

insert into public.projects (id, title, stream, stage, status, owner_id, suggested_lead, summary, blockers, link, sort_order, stage_log) values
  ('segmentation', 'Audience segmentation', 'Audience & data', 1, 'ok', null, 'James',
   'Get the 20 most common SMB segments from Morgan''s paper working in Permutive, test and learn on Facebook and display, and make them selectable in Gemstone. This powers the other two projects, and has to prove Permutive''s value before the contract ends around August 2027.',
   'Permutive logins and training dates still outstanding', null, 1,
   '[{"stage":1,"at":"2026-11-19T15:00:00Z"}]'),
  ('lens-insight', 'Lens & insight', 'Sales tools', 1, 'ok', 'tom', 'Tom',
   'Show customers what''s working, using campaign results and the segments, presented through Lens (public) and Intelligence (internal). Lens becomes the question-led "artificial salesperson" that builds a bespoke campaign.',
   null, 'https://lens.localeyes.co.uk', 2,
   '[{"stage":1,"at":"2026-11-19T15:00:00Z"}]'),
  ('packaging-pricing', 'Packaging & pricing', 'Products & pricing', 0, 'ok', null, 'Lawrence',
   'Package the segments into solutions sales can pick without guessing at targeting, price them on value and ROI rather than product, and move the best of them onto 3-month subscriptions to lift retention.',
   null, null, 3,
   '[{"stage":0,"at":"2026-11-19T15:00:00Z"}]'),
  ('video-enhancement', 'Video enhancement', 'Gemstone', 2, 'risk', 'dave', null,
   'A relatively minor video enhancement. An issue with Naviga, combined with release schedules and Dave''s availability, could push it towards the end of November.',
   'Naviga issue and release schedule; Dave''s availability', null, 4,
   '[{"stage":2,"at":"2026-11-19T15:00:00Z"}]');

update public.projects set due = '2026-11-30' where id = 'video-enhancement';

insert into public.actions (id, project_id, text, state, owner_id, suggested_lead, waiting_on, sort_order) values
  ('s1','segmentation','Get Permutive logins and training dates','doing',null,'Stuart / Morgan',null,1),
  ('s2','segmentation','Snapshot what''s being used in Permutive today','todo',null,'James',null,2),
  ('s3','segmentation','Check the paper''s 20 SMB segments and add what''s missing','todo',null,'James & Lawrence',null,3),
  ('s4','segmentation','Plan a test-and-learn on Facebook for the segments','todo',null,'James',null,4),
  ('s5','segmentation','Make the segments selectable in Gemstone for sales','todo',null,'James & Lawrence',null,5),
  ('s6','segmentation','Get site registrations (e.g. Sheffield What''s On) into the DMP','todo',null,null,null,6),
  ('s7','segmentation','Set a keep-or-replace decision date for Permutive, well before August','todo',null,'Stuart / Morgan',null,7),
  ('s8','segmentation','Delivery plan: timelines and resources','todo',null,'Whole group',null,8),
  ('l1','lens-insight','Get the Claude AIDA ad prototype from Morgan','todo','tom',null,null,1),
  ('l2','lens-insight','Build the AIDA ad review in Lens (wireframe toggle, ''Your way'' / ''In your words'' A/B)','todo','tom',null,null,2),
  ('l3','lens-insight','Design the question-led "artificial salesperson" journey','todo','tom',null,null,3),
  ('l4','lens-insight','Present segments, packages and pricing ROI-first in Lens','todo','tom',null,null,4),
  ('l5','lens-insight','Note on web vs app: do formats carry over, how audience data is used','todo','tom',null,null,5),
  ('l6','lens-insight','EKCS: first AI signal, do ad corrections predict churn?','todo',null,'Whole group',null,6),
  ('l7','lens-insight','Email lead warm-up with Catherine and Natalie','todo',null,'James',null,7),
  ('l8','lens-insight','Delivery plan: timelines and resources','todo',null,'Whole group',null,8),
  ('k1','packaging-pricing','Model how the segments package together','todo',null,'Lawrence',null,1),
  ('k2','packaging-pricing','Define how each package is set up in Gemstone','todo',null,'Lawrence',null,2),
  ('k3','packaging-pricing','Pull Gemstone data: display sold one-off vs month on month','todo',null,null,null,3),
  ('k4','packaging-pricing','Introduce Enhanced tiers and strip targeting from Essential','todo',null,'Stuart / Morgan',null,4),
  ('k5','packaging-pricing','Move the best packages onto a 3-month minimum','todo',null,'Stuart / Morgan',null,5),
  ('k6','packaging-pricing','Value-led pricing logic, e.g. why £100 of SEO vs £100 of PPC','todo',null,'Lawrence',null,6),
  ('v1','video-enhancement','Naviga fix for the video issue','waiting','dave',null,'naviga',1);

insert into public.milestones (label, date, kind) values
  ('Diana starts', '2026-11-23', 'milestone'),
  ('Craig leaves', '2026-12-31', 'milestone'),
  ('Permutive contract ends (approx.)', '2027-08-31', 'milestone');

insert into public.settings (key, value) values
  ('assumptions', '{"weeks":{}}'),
  ('review', '{}');
