-- Check-as-you-go: children can check a question's answers, fix mistakes using
-- hints, and see the answer after 3 tries. The score uses the FIRST try.
--
-- Run once in the Supabase SQL editor after 20261114000000_homework_library.sql.
-- Safe to re-run. Adds columns only; existing data is unchanged.

alter table public.student_answers
  add column if not exists check_count integer not null default 0,
  add column if not exists first_status text
    check (first_status in ('correct', 'incorrect', 'partially_correct', 'needs_review')),
  add column if not exists first_marks integer,
  add column if not exists locked boolean not null default false,
  add column if not exists hint text,
  add column if not exists corrected boolean not null default false;

-- No grant changes needed: signed-in users can still only insert/update
-- attempt_id, question_id and student_answer (see the first migration), so
-- these new columns can only be written by the server.
