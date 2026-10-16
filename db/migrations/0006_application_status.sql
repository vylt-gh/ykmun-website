-- Add application review status.
--
-- Every row starts at 'pending' and moves to 'accepted' or 'rejected' as staff
-- work through the queue. Without this every applicant looks identical and
-- there's no way to filter 'not yet reviewed' or see how far along the batch
-- is. One small migration, one select element, no other schema changes.
--
-- This column is edited by staff in the admin panel; the browser never sends
-- it, so it sits entirely outside COLUMNS_FIELDS/DETAIL_FIELDS in apply.js.

alter table public.applications
    add column if not exists status text not null default 'pending';

alter table public.applications
    drop constraint if exists applications_status_check;

alter table public.applications
    add constraint applications_status_check
    check (status in ('pending', 'accepted', 'rejected'));

create index if not exists applications_status_idx
    on public.applications (status);

comment on column public.applications.status is
    'Review status: pending | accepted | rejected. Set by staff in the admin panel.';