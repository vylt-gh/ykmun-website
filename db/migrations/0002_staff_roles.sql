-- YKMUN staff accounts and two-tier admin access.
--
-- Adds:
--   1. private.staff            — who is staff, and at which level
--   2. private.staff_role()     — SECURITY DEFINER helper the policies call
--   3. read policies for viewers/editors on public.applications
--   4. write policies for editors only
--
-- ---------------------------------------------------------------------------
-- ACCESS MODEL
-- ---------------------------------------------------------------------------
--
--   viewer  read applications        (cannot insert, update or delete)
--   editor  read + update + delete   (the full set of entry edits)
--
-- The two levels are additive: an editor can do everything a viewer can.
--
-- ---------------------------------------------------------------------------
-- WHY A private SCHEMA
-- ---------------------------------------------------------------------------
--
-- Roles live in `private`, which PostgREST does not expose by default. A table
-- in `public` is reachable at /rest/v1/<table> with the publishable key that
-- ships in this site's page source, so anyone could read it and, far worse,
-- write to it. Keeping authorization data off the Data API removes that surface
-- entirely: the only way to reach `private.staff` is through the helper
-- function below, which answers only about the calling user.
--
-- ---------------------------------------------------------------------------
-- WHY A SECURITY DEFINER FUNCTION
-- ---------------------------------------------------------------------------
--
-- A policy on `applications` has to ask "is this caller staff, and at what
-- level?". That question is answered by reading `private.staff`. If the policy
-- read the table directly it would re-enter RLS while resolving itself, and
-- Postgres raises 42P17 "infinite recursion detected in policy for relation".
--
-- SECURITY DEFINER sidesteps that: the function runs as its owner (postgres,
-- which has BYPASSRLS), so the inner read never re-triggers the policy.
--
-- Two properties make that safe, and both are required:
--
--   set search_path = ''   Without a pinned search_path, a caller can create
--                          their own object with an unqualified name and have
--                          it resolved inside the function body, running with
--                          the definer's privileges. This is a documented
--                          privilege-escalation vector. Every name below is
--                          schema-qualified instead.
--
--   revoke execute ... from public
--                          CREATE FUNCTION grants EXECUTE to PUBLIC by default.
--                          A function left in an exposed schema is callable as
--                          POST /rest/v1/rpc/<name> by anyone, which would turn
--                          this helper into a role-lookup endpoint for arbitrary
--                          users. It takes no arguments and reads auth.uid()
--                          internally, so it can only ever answer about the
--                          caller, but it is still revoked from PUBLIC and
--                          granted narrowly to authenticated only.

begin;

-- ---------------------------------------------------------------------------
-- 1. The staff table
-- ---------------------------------------------------------------------------

create schema if not exists private;

-- Deliberately no RLS on this table: it is unreachable through the Data API
-- because `private` is not an exposed schema. Enabling RLS here would mean
-- adding policies that only the SECURITY DEFINER function consults, which is
-- the recursion this table exists to avoid.

create table if not exists private.staff (
    user_id     uuid        primary key references auth.users (id) on delete cascade,
    -- 'viewer' = read-only. 'editor' = read + modify entries.
    role        text        not null check (role in ('viewer', 'editor')),
    created_at  timestamptz not null default now(),
    -- Who granted this. Useful when a MUN team has to audit who could see what.
    granted_by  uuid        references auth.users (id) on delete set null
);

comment on table private.staff is
    'Site administrators. viewer = read-only, editor = can modify entries. Not exposed via the Data API.';

create index if not exists staff_role_idx on private.staff (role);

-- ---------------------------------------------------------------------------
-- 2. The role helper
-- ---------------------------------------------------------------------------

create or replace function private.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
    select s.role
    from private.staff as s
    where s.user_id = (select auth.uid());
$$;

comment on function private.staff_role() is
    'Role of the calling user: viewer, editor, or NULL if not staff. Reads auth.uid() internally, so it answers only about the caller.';

revoke all on function private.staff_role() from public;
grant usage on schema private to authenticated;
grant execute on function private.staff_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Table grants
-- ---------------------------------------------------------------------------
--
-- New tables in public are created with select/insert/update/delete already
-- granted to anon and authenticated. Enabling RLS does NOT take those grants
-- back — it only adds a row filter. So the grants are revoked explicitly and
-- re-granted to match what each role is actually supposed to do. Without this,
-- a future policy typo could hand out more than intended.

revoke all on table public.applications from anon, authenticated;

-- Signed-out visitors submit applications and nothing else.
grant insert on table public.applications to anon;

-- Signed-in staff read and, if an editor, modify. Note this grants the
-- operation to the whole `authenticated` role; the policies below are what
-- decide which signed-in users actually pass. Grants and policies are two
-- separate gates and both are needed.
grant select, update, delete on table public.applications to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Read policies — both levels
-- ---------------------------------------------------------------------------

create policy "staff read applications"
    on public.applications
    for select
    to authenticated
    using ((select private.staff_role()) is not null);

-- ---------------------------------------------------------------------------
-- 5. Write policies — editors only
-- ---------------------------------------------------------------------------
--
-- `using` gates which existing rows may be touched; `with check` validates the
-- row as it will look afterwards. Both are present on the update policy so an
-- editor cannot rewrite a row into a shape that would escape a later check.

create policy "editors update applications"
    on public.applications
    for update
    to authenticated
    using ((select private.staff_role()) = 'editor')
    with check ((select private.staff_role()) = 'editor');

create policy "editors delete applications"
    on public.applications
    for delete
    to authenticated
    using ((select private.staff_role()) = 'editor');

-- Note there is NO authenticated insert policy. Public submissions go through
-- the anon grant above; staff edit existing entries rather than creating them.
-- Add one here only if the admin panel needs to file an application by hand.

commit;

-- ---------------------------------------------------------------------------
-- GRANTING THE FIRST ROLES
-- ---------------------------------------------------------------------------
--
-- There is deliberately no self-service signup path into this table. Roles are
-- granted by hand, from the dashboard or the SQL editor, both of which connect
-- with privileges that bypass RLS:
--
--   1. Create the user:  Authentication -> Users -> "Add user"
--      Set a password, or leave it and use a magic link. Note their user id.
--
--   2. Grant the role:
--
--          insert into private.staff (user_id, role, granted_by)
--          values ('<their-user-id>', 'viewer', '<your-user-id>');
--
--      Use 'editor' for the higher level.
--
-- Do NOT build a signup form that writes to this table. The frontend toggle
-- for open signups is not a control: anyone can POST to /auth/v1/signup
-- directly. If signups should be closed, close them in
-- Authentication -> Providers -> "Enable email signups".
--
-- ---------------------------------------------------------------------------
-- TESTING BEFORE YOU RELY ON THIS
-- ---------------------------------------------------------------------------
--
-- The dashboard's table view and any secret-key script bypass RLS, so neither
-- proves a policy works. Test the way a stranger would, using the publishable
-- key from the site's own page source:
--
--   -- a signed-out visitor may submit
--   curl -X POST "$URL/rest/v1/applications" \
--        -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
--        -d '{"email":"test@example.com"}'
--
--   -- a signed-out visitor may NOT read anyone else's application
--   curl "$URL/rest/v1/applications?select=*" -H "apikey: $PUBLISHABLE_KEY"
--   -- expect: [] or a permission error. Rows coming back is a finding.
--
-- Then repeat both as a viewer user and as an editor user:
--   viewer:   select works, update and delete are rejected
--   editor:   select, update and delete all work
--   nologo:   an auth user with no private.staff row gets nothing
--
-- Reading rows through the dashboard stays the intended way to review
-- applications day to day.
