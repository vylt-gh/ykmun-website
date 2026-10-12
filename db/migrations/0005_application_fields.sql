-- Application fields per the final agreed list.
--
-- Adds the identity and preference fields, and replaces the single `committee`
-- column with three ordered preferences.
--
-- SCOPE NOTE — what is deliberately NOT here:
--   * Doğum tarihi (date of birth) — no operational purpose. It verifies nobody,
--     affects no allocation, and adds a field that can only be filled wrong.
--   * Referans (reference) — an academic convention; MUN delegates are students
--     being placed, not candidates for a programme.
--   * Ödüller ve deneyim — dropped to keep the form frictionless. Additive if
--     the committee team decides they actually read it during allocation.
--
-- CONSENT: TC Kimlik No is special-category personal data under KVKK Art. 6, so
-- it cannot ride on the same basis as an email address. It requires explicit
-- written consent (açık rıza). consent_at / consent_version record *when* and
-- *against which text* that consent was given, which is what you would have to
-- show if it were ever questioned. Both are written by the browser on submit,
-- never by an applicant-supplied value.

alter table public.applications
    add column if not exists tc_number     text,
    add column if not exists committee_1   text,
    add column if not exists committee_2   text,
    add column if not exists committee_3   text,
    add column if not exists motivation    text,
    add column if not exists consent_at    timestamptz,
    add column if not exists consent_version text;

comment on column public.applications.tc_number is
    'National ID number. Special-category data under KVKK Art. 6: collectable only with explicit written consent (consent_at / consent_version), only for the pre-conference participation document, and delete once that purpose is fulfilled (KVKK Art. 12).';

comment on column public.applications.committee_1 is
    'Applicant''s first committee preference, in their order. These are preferences, never assignments — see committee_2 and committee_3.';

comment on column public.applications.consent_at is
    'When the applicant ticked the KVKK consent box. Null means no recorded consent, which should be treated as a data-protection problem rather than a formatting one.';

comment on column public.applications.consent_version is
    'Version of kvkk.html in force at the moment of consent. Bump this whenever the notice text changes, so old consent is never read as consent to new terms.';

-- Existing single preference becomes preference #1 rather than being dropped.
update public.applications
set committee_1 = committee
where committee is not null
  and committee <> '';

alter table public.applications
    drop column if exists committee;

-- No uniqueness constraint on the preference columns, and that is deliberate:
-- most applicants will pick from the same short committee list, so any unique
-- index across those columns would reject almost every submission. "Don't list
-- the same committee twice in one row" is a form-level check, not a constraint.

create index if not exists applications_consent_idx
    on public.applications (consent_at)
    where consent_at is not null;