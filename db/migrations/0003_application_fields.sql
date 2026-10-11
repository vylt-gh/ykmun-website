-- YKMUN application fields.
--
-- Promotes the fields staff actually work in from `details` jsonb to real
-- columns, so the Supabase table editor gives one click-to-edit cell per field
-- instead of a single JSON blob per applicant.
--
-- Only fields that get sorted, filtered or edited by staff belong here. Adding
-- a field is not free: it needs a migration, whereas anything still in
-- `details` is a one-line edit in apply.js. Promote on promotion, not on
-- collection.
--
-- SECURITY: unchanged. RLS governs rows, not columns, so these inherit the
-- existing insert-only policy for anon/authenticated — and the deliberate
-- absence of any select policy still holds. Nothing here widens what the
-- publishable key in the page source can do.

alter table public.applications
    add column if not exists full_name text,
    add column if not exists phone     text,
    add column if not exists committee text;

-- Backend-only. Never sent by the browser; set by staff as fees are collected.
alter table public.applications
    add column if not exists payment_state text not null default 'unpaid';

comment on column public.applications.committee is
    'The committee the applicant asked for. This is their preference, not their assignment — if staff start assigning here, record the preference separately first, since overwriting it loses the basis for allocation.';

comment on column public.applications.payment_state is
    'unpaid | partial | paid_card | paid_transfer | paid_cash | waived. A waived row must keep a reason: "paid" alone cannot distinguish a fee that was collected from one that was forgiven, which is the whole point of offering waivers.';

-- Guard against typos, not against legitimate states. This column is edited by
-- hand in a spreadsheet, so "paied" is otherwise indistinguishable from "paid".
alter table public.applications
    drop constraint if exists applications_payment_state_check;

alter table public.applications
    add constraint applications_payment_state_check
    check (payment_state in (
        'unpaid', 'partial', 'paid_card', 'paid_transfer', 'paid_cash', 'waived'
    ));

-- Backfill rows submitted before these columns existed, so existing applicants
-- do not render blank in the table editor.
--
-- The form no longer writes `details` — every field is a column now — so this
-- is a one-time rescue of rows already stored. The column is left in place
-- rather than dropped: it is NOT NULL DEFAULT '{}', so new inserts are
-- unaffected, and dropping it would throw away anything not covered above.
--
-- `committee` is safe to backfill here because it stays the applicant's stated
-- preference. Were it ever repurposed as "assigned committee", this statement
-- would silently mark every applicant who named a committee as already
-- accepted.
update public.applications
set full_name = coalesce(full_name, details->>'full_name'),
    phone     = coalesce(phone,     details->>'phone'),
    committee = coalesce(committee, details->>'committee')
where details is not null
  and details <> '{}'::jsonb;

create index if not exists applications_payment_state_idx
    on public.applications (payment_state);
