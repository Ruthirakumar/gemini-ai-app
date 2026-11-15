-- Section retakes, score history and a shared (admin-managed) practice library.
--
-- Run once in the Supabase SQL editor after the two earlier migrations.
-- Safe to re-run. Existing homework, attempts and answers are kept.
--
-- To make someone an admin (after they have signed up once):
--   insert into public.app_admins (user_id)
--   select id from auth.users where email = 'admin@example.com'
--   on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Admins
-- ---------------------------------------------------------------------------

create table if not exists public.app_admins (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

drop policy if exists app_admins_self_select on public.app_admins;
create policy app_admins_self_select on public.app_admins
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.app_admins from anon, authenticated;
grant select on public.app_admins to authenticated;

-- True when the signed-in user is an admin. SECURITY DEFINER so policies can
-- call it without exposing the admin list.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared practice sets: visibility + topic (shared sets have no week)
-- ---------------------------------------------------------------------------

alter table public.homework_sets
  add column if not exists visibility text not null default 'private',
  add column if not exists topic text;

alter table public.homework_sets drop constraint if exists homework_sets_visibility_check;
alter table public.homework_sets add constraint homework_sets_visibility_check
  check (visibility in ('private', 'shared'));

alter table public.homework_sets drop constraint if exists homework_sets_topic_check;
alter table public.homework_sets add constraint homework_sets_topic_check
  check (topic is null or char_length(btrim(topic)) between 1 and 100);

alter table public.homework_sets alter column week_number drop not null;

alter table public.homework_sets drop constraint if exists homework_sets_week_required;
alter table public.homework_sets add constraint homework_sets_week_required
  check (visibility = 'shared' or week_number is not null);

alter table public.homework_sets drop constraint if exists homework_sets_topic_required;
alter table public.homework_sets add constraint homework_sets_topic_required
  check (visibility = 'private' or topic is not null);

create index if not exists homework_sets_shared_idx
  on public.homework_sets (visibility, status, school_year, topic);

-- Who can see / change a set:
--   private: only its owner (parent)
--   shared:  everyone signed in once published; admins always, and only admins can change it
drop policy if exists homework_sets_owner_all on public.homework_sets;
drop policy if exists homework_sets_select on public.homework_sets;
drop policy if exists homework_sets_insert on public.homework_sets;
drop policy if exists homework_sets_update on public.homework_sets;
drop policy if exists homework_sets_delete on public.homework_sets;

create policy homework_sets_select on public.homework_sets
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (visibility = 'shared' and (status = 'published' or (select public.is_admin())))
  );

create policy homework_sets_insert on public.homework_sets
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (visibility = 'private' or (select public.is_admin()))
  );

create policy homework_sets_update on public.homework_sets
  for update to authenticated
  using (
    (visibility = 'private' and created_by = (select auth.uid()))
    or (visibility = 'shared' and (select public.is_admin()))
  )
  with check (
    (visibility = 'private' and created_by = (select auth.uid()))
    or (visibility = 'shared' and (select public.is_admin()))
  );

create policy homework_sets_delete on public.homework_sets
  for delete to authenticated
  using (
    (visibility = 'private' and created_by = (select auth.uid()))
    or (visibility = 'shared' and (select public.is_admin()))
  );

-- Sections and questions follow their set's visibility (the subquery is itself
-- filtered by the homework_sets policies above).
drop policy if exists homework_sections_owner_select on public.homework_sections;
drop policy if exists homework_sections_select on public.homework_sections;
create policy homework_sections_select on public.homework_sections
  for select to authenticated
  using (exists (select 1 from public.homework_sets s where s.id = homework_set_id));

drop policy if exists questions_owner_select on public.questions;
drop policy if exists questions_select on public.questions;
create policy questions_select on public.questions
  for select to authenticated
  using (exists (select 1 from public.homework_sections sec where sec.id = section_id));

-- ---------------------------------------------------------------------------
-- Section retakes: an attempt can cover the whole set or one section
-- ---------------------------------------------------------------------------

alter table public.homework_attempts
  add column if not exists section_id uuid references public.homework_sections (id) on delete cascade;
create index if not exists homework_attempts_section_idx on public.homework_attempts (section_id);

-- One unfinished attempt per student, per set, per scope (whole set or a section).
drop index if exists public.homework_attempts_one_open_idx;
create unique index if not exists homework_attempts_one_open_scope_idx
  on public.homework_attempts (student_id, homework_set_id, coalesce(section_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where status in ('in_progress', 'submitted');

drop policy if exists homework_attempts_owner_insert on public.homework_attempts;
create policy homework_attempts_owner_insert on public.homework_attempts
  for insert to authenticated
  with check (
    status = 'in_progress'
    and exists (select 1 from public.students st
                where st.id = student_id and st.parent_id = (select auth.uid()))
    -- visible (own or shared) and published
    and exists (select 1 from public.homework_sets s
                where s.id = homework_set_id and s.status = 'published')
    and (section_id is null or exists (
          select 1 from public.homework_sections sec
          where sec.id = section_id and sec.homework_set_id = homework_attempts.homework_set_id))
  );

grant insert (student_id, homework_set_id, section_id) on public.homework_attempts to authenticated;

-- ---------------------------------------------------------------------------
-- Atomic content save: admins may also edit shared sets
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
  if not exists (
    select 1 from public.homework_sets
    where id = p_set_id
      and ((visibility = 'private' and created_by = p_owner)
           or (visibility = 'shared' and exists (select 1 from public.app_admins a where a.user_id = p_owner)))
  ) then
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
      v_section_id := null;
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
