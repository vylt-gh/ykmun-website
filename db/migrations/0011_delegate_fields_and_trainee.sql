-- Delegate profile fields, trainee application type, and trainee questions.
--
-- Adds:
--   * birth_date, gender, school_grade, experience, notes (for delegate
--     applications)
--   * trainee_q1, trainee_q2, trainee_q3 (scenario answers for trainee
--     applications)
--   * 'trainee' to the applications_application_type_check constraint

alter table public.applications
    add column if not exists birth_date   date,
    add column if not exists gender       text,
    add column if not exists school_grade text,
    add column if not exists experience   text,
    add column if not exists notes        text,
    add column if not exists trainee_q1   text,
    add column if not exists trainee_q2   text,
    add column if not exists trainee_q3   text;

alter table public.applications
    drop constraint if exists applications_application_type_check;

alter table public.applications
    add constraint applications_application_type_check
    check (application_type in ('delegate', 'admin', 'press', 'trainee'));

comment on column public.applications.birth_date is
    'Applicant date of birth (collected for delegate applications).';

comment on column public.applications.gender is
    'Applicant gender (collected for delegate applications).';

comment on column public.applications.school_grade is
    'Applicant school and grade/class (collected for delegate applications).';

comment on column public.applications.experience is
    'Applicant prior MUN experience (collected for delegate applications).';

comment on column public.applications.notes is
    'Additional notes the applicant chose to include (collected for delegate applications).';

comment on column public.applications.trainee_q1 is
    'Trainee application scenario 1 response.';

comment on column public.applications.trainee_q2 is
    'Trainee application scenario 2 response.';

comment on column public.applications.trainee_q3 is
    'Trainee application scenario 3 response.';

comment on column public.applications.application_type is
    'What the person applied for: delegate, admin, press, or trainee. Written by the form; staff do not edit it.';
