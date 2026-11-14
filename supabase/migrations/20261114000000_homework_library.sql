-- AI Homework Buddy: homework library, student practice and marking.
--
-- Account model: a parent signs in (Supabase Auth). The parent owns the
-- homework library and one or more child profiles (public.students).
-- A child practises using the parent's session, so:
--   * RLS scopes every row to the signed-in parent.
--   * Answer keys (questions.marking_criteria) are NOT readable by signed-in
--     users at all; only the server (service role) reads them.
--   * Scores and marking results can only be written by the server.
--
-- Run this whole file once in the Supabase SQL editor (or `supabase db push`).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.students (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  school_year  integer not null check (school_year between 1 and 13),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists students_parent_idx on public.students (parent_id);

create table if not exists public.homework_sets (
  id                 uuid primary key default gen_random_uuid(),
  school_year        integer not null check (school_year between 1 and 13),
  week_number        integer not null check (week_number between 1 and 52),
  title              text not null check (char_length(btrim(title)) between 1 and 200),
  subject            text not null check (subject in ('English', 'Maths', 'Both')),
  homework_date      date,
  original_file_path text,
  original_file_type text,
  original_file_name text,
  status             text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  extraction_status  text not null default 'pending'
                     check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_error   text,
  created_by         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists homework_sets_owner_year_week_idx
  on public.homework_sets (created_by, school_year, week_number);
create index if not exists homework_sets_status_idx on public.homework_sets (status);

create table if not exists public.homework_sections (
  id              uuid primary key default gen_random_uuid(),
  homework_set_id uuid not null references public.homework_sets (id) on delete cascade,
  subject         text not null check (subject in ('English', 'Maths')),
  section_title   text not null check (char_length(btrim(section_title)) between 1 and 200),
  instructions    text,
  display_order   integer not null default 0
);
create index if not exists homework_sections_set_idx
  on public.homework_sections (homework_set_id, display_order);

create table if not exists public.questions (
  id               uuid primary key default gen_random_uuid(),
  section_id       uuid not null references public.homework_sections (id) on delete cascade,
  question_number  text not null check (char_length(question_number) between 1 and 20),
  question_text    text not null check (char_length(question_text) between 1 and 4000),
  question_type    text not null
                   check (question_type in ('short_text', 'long_text', 'number', 'multiple_choice', 'not_digital')),
  question_data    jsonb not null default '{}'::jsonb,
  -- Answer key. Never readable by signed-in users (see grants below).
  marking_criteria jsonb not null default '{}'::jsonb,
  marks            integer not null default 1 check (marks between 0 and 20),
  display_order    integer not null default 0,
  needs_review     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists questions_section_idx on public.questions (section_id, display_order);

create table if not exists public.homework_attempts (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  homework_set_id uuid not null references public.homework_sets (id) on delete cascade,
  status          text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'completed')),
  score           integer,
  total_marks     integer not null default 0,
  percentage      numeric(5, 2),
  progress        jsonb not null default '{}'::jsonb,
  started_at      timestamptz not null default now(),
  submitted_at    timestamptz,
  completed_at    timestamptz,
  updated_at      timestamptz not null default now()
);
create index if not exists homework_attempts_student_idx
  on public.homework_attempts (student_id, homework_set_id);
-- At most one unfinished attempt per student per homework (prevents duplicates).
create unique index if not exists homework_attempts_one_open_idx
  on public.homework_attempts (student_id, homework_set_id)
  where status in ('in_progress', 'submitted');

create table if not exists public.student_answers (
  id             uuid primary key default gen_random_uuid(),
  attempt_id     uuid not null references public.homework_attempts (id) on delete cascade,
  question_id    uuid not null references public.questions (id) on delete cascade,
  student_answer text check (student_answer is null or char_length(student_answer) <= 2000),
  marking_status text check (marking_status in ('correct', 'incorrect', 'partially_correct', 'unanswered', 'needs_review')),
  awarded_marks  integer,
  correct_answer text,
  feedback       text,
  explanation    text,
  working_steps  jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- One row per question per attempt: re-saving or re-marking never duplicates.
  constraint student_answers_attempt_question_key unique (attempt_id, question_id)
);
create index if not exists student_answers_question_idx on public.student_answers (question_id);

-- updated_at triggers
drop trigger if exists students_updated_at on public.students;
create trigger students_updated_at before update on public.students
  for each row execute function public.set_updated_at();
drop trigger if exists homework_sets_updated_at on public.homework_sets;
create trigger homework_sets_updated_at before update on public.homework_sets
  for each row execute function public.set_updated_at();
drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at before update on public.questions
  for each row execute function public.set_updated_at();
drop trigger if exists homework_attempts_updated_at on public.homework_attempts;
create trigger homework_attempts_updated_at before update on public.homework_attempts
  for each row execute function public.set_updated_at();
drop trigger if exists student_answers_updated_at on public.student_answers;
create trigger student_answers_updated_at before update on public.student_answers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.students          enable row level security;
alter table public.homework_sets     enable row level security;
alter table public.homework_sections enable row level security;
alter table public.questions         enable row level security;
alter table public.homework_attempts enable row level security;
alter table public.student_answers   enable row level security;

-- students: a parent manages only their own children.
drop policy if exists students_owner_all on public.students;
create policy students_owner_all on public.students
  for all to authenticated
  using (parent_id = (select auth.uid()))
  with check (parent_id = (select auth.uid()));

-- homework_sets: owner manages their own library.
drop policy if exists homework_sets_owner_all on public.homework_sets;
create policy homework_sets_owner_all on public.homework_sets
  for all to authenticated
  using (created_by = (select auth.uid()))
  with check (created_by = (select auth.uid()));

-- sections & questions: readable by the set owner (writes go through the server).
drop policy if exists homework_sections_owner_select on public.homework_sections;
create policy homework_sections_owner_select on public.homework_sections
  for select to authenticated
  using (exists (
    select 1 from public.homework_sets s
    where s.id = homework_set_id and s.created_by = (select auth.uid())
  ));

drop policy if exists questions_owner_select on public.questions;
create policy questions_owner_select on public.questions
  for select to authenticated
  using (exists (
    select 1 from public.homework_sections sec
    join public.homework_sets s on s.id = sec.homework_set_id
    where sec.id = section_id and s.created_by = (select auth.uid())
  ));

-- attempts: only for the parent's own children, only on their own published homework.
drop policy if exists homework_attempts_owner_select on public.homework_attempts;
create policy homework_attempts_owner_select on public.homework_attempts
  for select to authenticated
  using (exists (
    select 1 from public.students st
    where st.id = student_id and st.parent_id = (select auth.uid())
  ));

drop policy if exists homework_attempts_owner_insert on public.homework_attempts;
create policy homework_attempts_owner_insert on public.homework_attempts
  for insert to authenticated
  with check (
    status = 'in_progress'
    and exists (select 1 from public.students st
                where st.id = student_id and st.parent_id = (select auth.uid()))
    and exists (select 1 from public.homework_sets s
                where s.id = homework_set_id and s.status = 'published'
                  and s.created_by = (select auth.uid()))
  );

drop policy if exists homework_attempts_owner_update on public.homework_attempts;
create policy homework_attempts_owner_update on public.homework_attempts
  for update to authenticated
  using (
    status = 'in_progress'
    and exists (select 1 from public.students st
                where st.id = student_id and st.parent_id = (select auth.uid()))
  )
  with check (status = 'in_progress');

-- answers: readable for own attempts; writable only while the attempt is in progress.
drop policy if exists student_answers_owner_select on public.student_answers;
create policy student_answers_owner_select on public.student_answers
  for select to authenticated
  using (exists (
    select 1 from public.homework_attempts a
    join public.students st on st.id = a.student_id
    where a.id = attempt_id and st.parent_id = (select auth.uid())
  ));

drop policy if exists student_answers_owner_insert on public.student_answers;
create policy student_answers_owner_insert on public.student_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.homework_attempts a
    join public.students st on st.id = a.student_id
    join public.questions q on q.id = question_id
    join public.homework_sections sec on sec.id = q.section_id
    where a.id = attempt_id and a.status = 'in_progress'
      and st.parent_id = (select auth.uid())
      and sec.homework_set_id = a.homework_set_id
  ));

drop policy if exists student_answers_owner_update on public.student_answers;
create policy student_answers_owner_update on public.student_answers
  for update to authenticated
  using (exists (
    select 1 from public.homework_attempts a
    join public.students st on st.id = a.student_id
    where a.id = attempt_id and a.status = 'in_progress'
      and st.parent_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.homework_attempts a
    join public.students st on st.id = a.student_id
    join public.questions q on q.id = question_id
    join public.homework_sections sec on sec.id = q.section_id
    where a.id = attempt_id and a.status = 'in_progress'
      and st.parent_id = (select auth.uid())
      and sec.homework_set_id = a.homework_set_id
  ));

-- ---------------------------------------------------------------------------
-- Column privileges (defence in depth on top of RLS)
-- ---------------------------------------------------------------------------

revoke all on public.students, public.homework_sets, public.homework_sections,
              public.questions, public.homework_attempts, public.student_answers
  from anon;

-- Questions: everything EXCEPT the answer key. Writes only via the server.
revoke all on public.questions from authenticated;
grant select (id, section_id, question_number, question_text, question_type, question_data,
              marks, display_order, needs_review, created_at, updated_at)
  on public.questions to authenticated;

revoke all on public.homework_sections from authenticated;
grant select on public.homework_sections to authenticated;

-- Attempts: the browser may start an attempt and save its position, never a score.
revoke all on public.homework_attempts from authenticated;
grant select on public.homework_attempts to authenticated;
grant insert (student_id, homework_set_id) on public.homework_attempts to authenticated;
grant update (progress) on public.homework_attempts to authenticated;

-- Answers: the browser may save the answer text only, never marking results.
revoke all on public.student_answers from authenticated;
grant select on public.student_answers to authenticated;
grant insert (attempt_id, question_id, student_answer) on public.student_answers to authenticated;
grant update (attempt_id, question_id, student_answer) on public.student_answers to authenticated;

-- ---------------------------------------------------------------------------
-- Save reviewed homework content atomically (server / service role only)
-- ---------------------------------------------------------------------------

create or replace function public.save_homework_content(p_set_id uuid, p_owner uuid, p_sections jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_section     jsonb;
  v_sidx        bigint;
  v_section_id  uuid;
  v_question    jsonb;
  v_qidx        bigint;
  v_question_id uuid;
  v_keep_sections  uuid[] := '{}';
  v_keep_questions uuid[] := '{}';
begin
  if not exists (select 1 from public.homework_sets where id = p_set_id and created_by = p_owner) then
    raise exception 'homework set not found' using errcode = 'P0002';
  end if;
  if jsonb_typeof(p_sections) <> 'array' then
    raise exception 'sections must be an array' using errcode = '22023';
  end if;

  for v_section, v_sidx in
    select value, ordinality from jsonb_array_elements(p_sections) with ordinality
  loop
    v_section_id := nullif(v_section ->> 'id', '')::uuid;
    if v_section_id is not null and not exists (
      select 1 from public.homework_sections where id = v_section_id and homework_set_id = p_set_id
    ) then
      v_section_id := null; -- unknown id: treat as new
    end if;

    if v_section_id is null then
      insert into public.homework_sections (homework_set_id, subject, section_title, instructions, display_order)
      values (p_set_id, v_section ->> 'subject', v_section ->> 'sectionTitle',
              nullif(v_section ->> 'instructions', ''), v_sidx)
      returning id into v_section_id;
    else
      update public.homework_sections
         set subject = v_section ->> 'subject',
             section_title = v_section ->> 'sectionTitle',
             instructions = nullif(v_section ->> 'instructions', ''),
             display_order = v_sidx
       where id = v_section_id;
    end if;
    v_keep_sections := v_keep_sections || v_section_id;

    for v_question, v_qidx in
      select value, ordinality
      from jsonb_array_elements(coalesce(v_section -> 'questions', '[]'::jsonb)) with ordinality
    loop
      v_question_id := nullif(v_question ->> 'id', '')::uuid;
      if v_question_id is not null and not exists (
        select 1 from public.questions q
        join public.homework_sections s on s.id = q.section_id
        where q.id = v_question_id and s.homework_set_id = p_set_id
      ) then
        v_question_id := null;
      end if;

      if v_question_id is null then
        insert into public.questions (section_id, question_number, question_text, question_type,
                                      question_data, marking_criteria, marks, display_order, needs_review)
        values (v_section_id, v_question ->> 'questionNumber', v_question ->> 'questionText',
                v_question ->> 'questionType', coalesce(v_question -> 'questionData', '{}'::jsonb),
                coalesce(v_question -> 'markingCriteria', '{}'::jsonb),
                coalesce((v_question ->> 'marks')::integer, 1), v_qidx,
                coalesce((v_question ->> 'needsReview')::boolean, false))
        returning id into v_question_id;
      else
        update public.questions
           set section_id = v_section_id,
               question_number = v_question ->> 'questionNumber',
               question_text = v_question ->> 'questionText',
               question_type = v_question ->> 'questionType',
               question_data = coalesce(v_question -> 'questionData', '{}'::jsonb),
               marking_criteria = coalesce(v_question -> 'markingCriteria', '{}'::jsonb),
               marks = coalesce((v_question ->> 'marks')::integer, 1),
               display_order = v_qidx,
               needs_review = coalesce((v_question ->> 'needsReview')::boolean, false)
         where id = v_question_id;
      end if;
      v_keep_questions := v_keep_questions || v_question_id;
    end loop;
  end loop;

  delete from public.questions q
   using public.homework_sections s
   where q.section_id = s.id and s.homework_set_id = p_set_id
     and not (q.id = any (v_keep_questions));

  delete from public.homework_sections
   where homework_set_id = p_set_id and not (id = any (v_keep_sections));

  update public.homework_sets set updated_at = now() where id = p_set_id;
end;
$$;

revoke execute on function public.save_homework_content(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_homework_content(uuid, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Private storage bucket for original worksheets
-- Files live at "<auth user id>/<homework set id>/<file name>".
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('worksheets', 'worksheets', false, 20971520,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists worksheets_owner_insert on storage.objects;
create policy worksheets_owner_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists worksheets_owner_select on storage.objects;
create policy worksheets_owner_select on storage.objects
  for select to authenticated
  using (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists worksheets_owner_delete on storage.objects;
create policy worksheets_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'worksheets' and (storage.foldername(name))[1] = (select auth.uid())::text);
