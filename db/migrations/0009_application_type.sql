-- YKMUN application types.
--
-- One applications table, three kinds of applicant:
--
--   delegate  applying for a seat on a committee
--   admin     applying to the admin team, which runs the conference
--   press     applying to the press team, which covers it
--
-- Until now the only way in was the delegate form, and the kind of applicant
-- was implied by which committee names sat in committee_1 — which was never a
-- safe thing to read, because a delegate may put "Admin" in that column as a
-- preference. application_type says outright what the person applied for, so
-- the panel can label and search it, and so committee_1 keeps meaning one
-- thing only: a committee preference.
--
-- Rows written before this migration are delegate applications, which the
-- default below records. The column is written by the form and staff do not
-- edit it, so there is no panel control for it.
--
-- The delegation registration is a separate table (0008) and is not affected:
-- it is a group registering, not a person applying, and it has no committee
-- and no T.C. identity number.

alter table public.applications
    add column if not exists application_type text not null default 'delegate';

alter table public.applications
    drop constraint if exists applications_application_type_check;

alter table public.applications
    add constraint applications_application_type_check
    check (application_type in ('delegate', 'admin', 'press'));

comment on column public.applications.application_type is
    'What the person applied for: delegate (a committee seat), admin (the admin team) or press (the press team). Written by the form; staff do not edit it. Rows predating this migration are delegates.';

create index if not exists applications_application_type_idx
    on public.applications (application_type);

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS
-- ---------------------------------------------------------------------------
--
-- Check it the way a stranger would rather than through the dashboard, which
-- bypasses RLS and would pass either way:
--
--   -- a signed-out visitor may still submit, and the new column defaults
--   curl -X POST "$URL/rest/v1/applications" \
--        -H "apikey: $PUBLISHABLE_KEY" -H "Content-Type: application/json" \
--        -d '{"email":"test@example.com"}'
--
--   -- and the column is there
--   select application_type, count(*) from public.applications group by 1;
--   -- expect one row: delegate | <n>
--
-- Until this migration has been run, the admin and press forms will fail with
-- a 42703 (column does not exist) and the delegate form will fail with it
-- too, because the form always writes application_type.
