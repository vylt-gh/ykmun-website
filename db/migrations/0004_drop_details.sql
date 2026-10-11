-- Retire the `details` jsonb column.
--
-- It existed so the form could collect fields before the real field list was
-- decided: every field that had no column went in there as one blob. Migration
-- 0003 promoted the fields staff actually work in, and the form now writes every
-- field to its own column, so nothing sends `details` any more. The column is
-- left at its `not null default '{}'`, which is why new rows showed an empty
-- cell in the table editor rather than a gap.
--
-- PRECONDITION — run this first:
--
--   select count(*) from public.applications where details <> '{}'::jsonb;
--
-- If it returns 0, nothing is lost by dropping the column and this is safe.
-- If it returns anything else, do NOT run this: those are applications made
-- before 0003, and `school`, `grade_level`, `motivation` and `experience` exist
-- nowhere else. 0003 backfilled only full_name, phone and committee. Promote
-- whatever you still need out of the blob first, or keep the column.
--
-- Safe to re-run: dropping a missing column is a no-op only with IF EXISTS.

alter table public.applications
    drop column if exists details;
