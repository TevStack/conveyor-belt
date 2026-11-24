# Conveyor Belt

Where every Solution Factory initiative is up to, who has the next step, and what's holding it up.
Built for Local Eyes on Next.js (App Router, JavaScript), Supabase and Vercel.

## Views

- **This week**: the review screen. Initiatives with next steps, what's changed since the last review, decisions, launching soon.
- **Roadmap**: rolling 8–12 week Gantt with stage history, sketched future stages, target launches, time off and supplier releases. Planning assumptions build from actual stage durations.
- **The belt**: initiatives as crates on the conveyor, who's carrying what, open actions.
- **Lanes**: To do / Doing / Done per initiative, with deadlines.
- **People** and **Nudges** (admins): people, departments, roles, and a preview of the digest and Chat cards.

## Roles

| | Viewer | Member | Lead | Admin |
|---|---|---|---|---|
| See everything | ✓ | ✓ | ✓ | ✓ |
| Move, date, hand off own actions; add actions; own time off | | ✓ | ✓ | ✓ |
| Edit own initiatives and their actions; milestones; decisions; planning assumptions | | | ✓ | ✓ |
| People, departments, everything else | | | | ✓ |

Enforced in Supabase with row-level security (`supabase/migrations/0001_conveyor_belt.sql`).

## Setup

1. **Supabase**: open the SQL editor, paste `supabase/migrations/0001_conveyor_belt.sql`, replace `YOUR EMAIL` with your work email, run it.
2. **Supabase → Authentication → Sign In / Providers → Email**: turn **Confirm email** off, so setting a password doesn't send an email.
3. **Supabase → Authentication → URL configuration**: set Site URL to the Vercel URL and add `https://<vercel-url>/auth/callback` to Redirect URLs.
4. **Google sign-in** (at launch, after IT approval): Authentication → Providers → Google with an OAuth client from Google Cloud, then set `NEXT_PUBLIC_GOOGLE_SIGNIN=on` in Vercel.
4. **Environment variables** (Vercel and `.env.local`): see `.env.example`.

```bash
npm install
npm run dev
```

## Access

During testing people sign in with their work email and a password they choose on first visit ("First time here? Set up my password"). Only people on the **People** list (matched by email) get in. Add someone on the People tab with their work email first.

Forgotten password: delete their user in Supabase → Authentication → Users, then they set up a new password. Their People row re-links automatically.

## Code map

- `app/page.js`: signs in, links you to your People row, renders the belt
- `app/login`: Google and emailed-link sign-in
- `lib/belt/engine.js`: the views and interactions (ported from the prototype)
- `lib/belt/data.js`: Supabase reads, writes and realtime
- `lib/belt/markup.js`: page structure
- `supabase/migrations`: schema, permissions, starting data

## Next

- Send nudges: Monday digest email and Google Chat cards (Vercel cron + a Chat webhook)
- Move views from the ported engine into React components as they change
