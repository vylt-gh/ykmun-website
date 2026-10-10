-- YKMUN application storage.
--
-- Schema is deliberately minimal: the fields to collect on the application
-- form have not been decided yet, so this holds only what any application needs
-- (a submission timestamp and an optional contact address) plus a payload for
-- the rest. See the note at the bottom before adding real columns.
--
-- SECURITY MODEL — read this before changing any policy below.
--
-- The site is static and the browser talks to Supabase directly using the
-- publishable key. That key is public by design and grants exactly what these
-- policies allow, so the policies ARE the security boundary.
--
-- The shape here is insert-only for anonymous visitors:
--   * anyone may submit an application
--   * NOBODY may read applications through the API, including other
--     applicants. There is no SELECT policy for anon or authenticated, so
--     PostgREST returns an empty array rather than rows.
--   * updates and deletes are not granted either.
--
-- Reading applications is done from the Supabase dashboard or the SQL editor,
-- which connect as a privileged role and bypass RLS. That is the intended path.
--
-- Do NOT add a permissive SELECT/UPDATE policy to make the UI work. A table
-- with RLS enabled but a `using (true)` policy is just as open as one with RLS
-- disabled; the badge in the dashboard only reports that the mechanism is on,
-- not that the policy means anything. If the form needs to read a row back,
-- the correct fix is a policy scoped to something the caller cannot forge.

create table if not exists public.applications (
    id          uuid        primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),

    -- Minimal contact field. Every real application will need one; whether it
    -- is an email, a phone number, or both is not yet decided.
    email       text,

    -- Everything else the form collects, as JSON. Deliberately open-ended so
    -- the table does not have to be migrated every time a field is added.
    -- Promote anything here to a real column once its shape is stable and it
    -- needs to be queried or indexed.
    details     jsonb       not null default '{}'::jsonb
);

comment on table public.applications is
    'MUN applications. Insert-only via the public API; read via the dashboard.';

-- Row Level Security. Without this the table is reachable by anyone holding
-- the publishable key, which ships in the page source.
alter table public.applications enable row level security;

-- Anonymous visitors may submit. No `with check` restriction beyond the column
-- constraints: tighten this once the form's fields are known.
create policy "anyone may submit an application"
    on public.applications
    for insert
    to anon, authenticated
    with check (true);

-- Intentionally NO select / update / delete policies for anon or authenticated.
-- Their absence is the protection; do not add them without reading the note
-- above.

-- ---------------------------------------------------------------------------
-- Before adding real columns
-- ---------------------------------------------------------------------------
--
-- 1. Decide the fields, then add them here and mirror them in the form.
-- 2. Drop `details` once real columns carry everything.
-- 3. Consider a unique index on `email` if each person may apply only once:
--      create unique index applications_email_key
--          on public.applications (lower(email));
--    Note that a unique index is also an enumeration oracle — a duplicate-key
--    error tells an anonymous caller whether an address has applied. That is
--    usually acceptable for a MUN signup; decide deliberately.
-- 4. Rate limiting: RLS cannot express "one submission per minute". If spam
--    becomes a problem, move inserts behind a Supabase Edge Function, which can
--    verify a captcha and is not reachable with the publishable key alone.
