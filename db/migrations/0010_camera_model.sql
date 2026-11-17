-- Camera model for press team applications.
--
-- Adds the `camera_model` column to public.applications. Collected on the
-- application form when applying to the press team so the press heads know
-- what equipment applicants use. Null for delegates and admin team applicants.

alter table public.applications
    add column if not exists camera_model text;

comment on column public.applications.camera_model is
    'Camera model or equipment used by press team applicants. Collected only for press team applications; null for delegates and admin.';

-- ---------------------------------------------------------------------------
-- AFTER RUNNING THIS
-- ---------------------------------------------------------------------------
--
-- Verify the column was added:
--
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public'
--     and table_name = 'applications'
--     and column_name = 'camera_model';
--
-- Until this migration has been run in Supabase, submitting a press application
-- that includes a camera model will fail with 42703 (column does not exist).
