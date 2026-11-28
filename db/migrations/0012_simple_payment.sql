-- Simplify payment_state to binary unpaid / paid.
--
-- Replaces the 6-value enum ('unpaid', 'partial', 'paid_card',
-- 'paid_transfer', 'paid_cash', 'waived') with ('unpaid', 'paid') so the
-- admin panel can use a simple Paid checkbox.

alter table public.applications
    drop constraint if exists applications_payment_state_check;

update public.applications
set payment_state = case
    when payment_state in ('paid', 'paid_card', 'paid_transfer', 'paid_cash', 'waived') then 'paid'
    else 'unpaid'
end;

alter table public.applications
    add constraint applications_payment_state_check
    check (payment_state in ('unpaid', 'paid'));

comment on column public.applications.payment_state is
    'unpaid | paid. Toggled by staff via the Paid checkbox in the admin panel.';
