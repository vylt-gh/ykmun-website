-- Delegation registration: one row per school or organisation applying as a
-- group.
--
-- The form behind this table is deliberately three questions long. It records
-- what kind of group this is, who we should write to, and how many delegates
-- are coming. Individual names are not collected: schools usually register
-- before their delegation is settled, so a roster taken today would be stale by
-- the conference anyway, and every delegate fills the normal application form
-- separately.
--
-- ---------------------------------------------------------------------------
-- WHY THERE IS NO consent_at / consent_version
-- ---------------------------------------------------------------------------
--
-- public.applications carries both because it collects a T.C. Identity Number,
-- which is special-category data under KVKK Art. 6: processing it needs explicit
-- consent, and consent is only provable if you record when it was given and
-- against which text.
--
-- This table collects a name, an email address and an institution. That is
-- ordinary data, processed to answer the person who sent it, and the lawful
-- basis is not consent. Recording a consent that was never the basis would
-- misstate the position rather than strengthen it. What KVKK does require here
-- is that the person is informed (aydınlatma), so the form links the notice
-- instead. Do not add a consent checkbox to match the other form; the data is
-- not the same, so the basis is not either.
--
-- ---------------------------------------------------------------------------

begin;

create table if not exists public.delegations (
    id           uuid        primary key default gen_random_uuid(),
    created_at   timestamptz not null default now(),

    -- 'School', 'University', 'Organisation', 'Other' as chosen on the form.
    -- Free text rather than an enum: adding a category should be a form edit,
    -- not a migration on a table with live rows.
    group_type   text        not null,
    organisation text        not null,
    contact_name text        not null,
    email        text        not null,

    -- What the group expects to bring. The upper bound is there to catch a
    -- typo in the hundreds, not to cap how many delegates a school may send.
    headcount    integer     not null check (headcount between 1 and 500),

    status       text        not null default 'pending'
                             check (status in ('pending', 'accepted', 'rejected'))
);

comment on table public.delegations is
    'Group registrations. Insert-only via the public API; reviewed in the admin panel.';

comment on column public.delegations.headcount is
    'Expected number of delegates. An estimate — delegates apply individually and are counted from applications.';

comment on column public.delegations.status is
    'Review status: pending | accepted | rejected. Set by staff in the admin panel.';

-- ---------------------------------------------------------------------------
-- Row Level Security — the same two-gate model as public.applications
-- ---------------------------------------------------------------------------
--
-- Grants and policies are separate gates and both are needed: a new table in
-- public arrives with select/insert/update/delete already granted, so the
-- grants are revoked and re-issued to match what each role may do.

alter table public.delegations enable row level security;

revoke all on table public.delegations from anon, authenticated;

-- Signed-out visitors may register a group, and nothing else.
grant insert on table public.delegations to anon;

-- Signed-in staff read; the policies below decide which of them may also write.
grant select, update, delete on table public.delegations to authenticated;

create policy "anyone may register a delegation"
    on public.delegations
    for insert
    to anon
    with check (true);

create policy "staff read delegations"
    on public.delegations
    for select
    to authenticated
    using ((select private.staff_role()) is not null);

create policy "editors update delegations"
    on public.delegations
    for update
    to authenticated
    using ((select private.staff_role()) = 'editor')
    with check ((select private.staff_role()) = 'editor');

create policy "editors delete delegations"
    on public.delegations
    for delete
    to authenticated
    using ((select private.staff_role()) = 'editor');

-- An accepted/rejected split is how staff work through the queue, and it is the
-- only filter the admin panel applies server-side.
create index if not exists delegations_status_idx
    on public.delegations (status);

commit;

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS
-- ---------------------------------------------------------------------------
--
-- The table is reachable through the Data API the moment this commits, so check
-- it the way a stranger would rather than through the dashboard (which bypasses
-- RLS and would pass either way):
--
--   -- a signed-out visitor may register a delegation
--   curl -X POST "$URL/rest/v1/delegations" \
--        -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
--        -d '{"group_type":"School","organisation":"Test Lisesi","contact_name":"Test","email":"test@example.com","headcount":8}'
--
--   -- and may NOT read any back
--   curl "$URL/rest/v1/delegations?select=*" -H "apikey: $PUBLISHABLE_KEY"
--   -- expect: [] or a permission error. Rows coming back is a finding.
