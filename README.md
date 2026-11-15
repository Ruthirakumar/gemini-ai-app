# AI Homework Buddy

A homework helper for UK primary school children (Years 3–4), built with Next.js 16, Google Gemini and Supabase.

| Area | Route | What it does | Needs Supabase |
| --- | --- | --- | --- |
| Photo checker | `/` | Upload a photo or PDF of completed homework; Gemini marks it and explains mistakes | No |
| Homework Library | `/library` | Parents upload weekly homework, review the extracted questions, publish | Yes |
| Practise | `/learn` | Children pick Year/Week (or a topic from the shared Practice library), check answers as they go, hand in, retake sections, see score history | Yes |
| Ask | `/chat` | Original Gemini chat | No |

## How it fits together

- **Accounts:** a parent signs in (Supabase Auth, email + password) and adds child profiles. Children practise under the parent's login by choosing their profile.
- **Answer keys stay on the server.** `questions.marking_criteria` is not readable by signed-in users at all (column privileges). Only server routes read it, using the service-role key, after checking ownership. Practice-question answers are encrypted into tokens.
- **Scores are calculated in server code**, never taken from Gemini or the browser. The browser can write only answer text, never marks or scores.
- **Marking:** blank → *unanswered*; exact/equivalent matches → *correct* without AI; everything else is marked by Gemini, then checked by server rules (mark clamping, numeric cross-checks). Statuses: correct, incorrect, partially_correct, unanswered, needs_review.
- **Submitting twice is safe:** the attempt is claimed atomically; results are upserted one row per question.

## 1. Supabase setup (one-off, free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: run each migration in [`supabase/migrations/`](supabase/migrations/), **in order**, once each (all are safe to re-run):
   1. `20261114000000_homework_library.sql`: tables, RLS, column privileges, content-save function, private `worksheets` bucket
   2. `20261115000000_check_as_you_go.sql`: check-as-you-go (tries, first-try scoring)
   3. `20261116000000_retakes_and_shared_library.sql`: section retakes, score history, admins and the shared library

   *(Or with the Supabase CLI: `supabase link` then `supabase db push`.)*
3. **Authentication → Sign In / Providers → Email**: keep Email enabled.
   - For quick local testing you can turn **Confirm email** off. Leave it on for real use.
4. **Authentication → URL Configuration**: set **Site URL** to your app URL (e.g. `http://localhost:3000` locally, your Vercel URL in production) and add both to **Redirect URLs**.
5. **Project Settings → API**: copy the Project URL, the `anon`/publishable key and the `service_role`/secret key into your environment (below).

### Admins (shared practice library)

Admins can add practice sets (by year and topic) that **every family's children** can use. To make an account an admin, sign up with it once, then run in the SQL Editor:

```sql
insert into public.app_admins (user_id)
select id from auth.users where email = 'you@example.com'
on conflict do nothing;
```

Remove an admin with `delete from public.app_admins where user_id = (select id from auth.users where email = '...');`. Admins see a **Shared library** tab under Library.

## 2. Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Where it's used | Secret? |
| --- | --- | --- |
| `GEMINI_API_KEY` | Server: all Gemini calls | **Yes** |
| `GEMINI_MODEL` | Server: chat, marking, practice | No |
| `GEMINI_HOMEWORK_MODEL` *(optional)* | Server: reading worksheets (photo checker + extraction). Defaults to `GEMINI_MODEL` | No |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser + server | No (public by design) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser + server (sign-in, file upload) | No (public by design; RLS protects data) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only: answer keys, marking results | **Yes – never prefix with `NEXT_PUBLIC_`** |
| `PRACTICE_TOKEN_SECRET` *(optional)* | Server: encrypts practice answers | **Yes** |

Without the Supabase variables, the photo checker and chat still work; library pages show a "not set up yet" notice.

## 3. Run locally

```bash
npm install
npm run dev          # http://localhost:3000
```

Checks:

```bash
npx tsc --noEmit     # types
npm run lint         # ESLint
npm test             # unit tests (marking, scoring, answer matching, file validation, tokens)
npm run build        # production build
```

### Manual test script

1. Go to **Library → Sign in → Create an account**.
2. **Upload homework**: choose a PDF/photo, Year 4, Week 8, *English and Maths* → *Upload and extract*. A 13-page PDF takes 1–3 minutes.
3. On the review screen: check questions flagged **Needs review** (click *I've checked it*), fix anything wrong, use **Show original** to compare. **Publish** is blocked until nothing is flagged and every question has an answer.
4. Go to **Practise → add a child (Year 4)** → Week 8 → **Start**. Answer some questions, refresh the page (progress is kept), then **Review & hand in**.
5. On results: check the score, filters and explanations; press **Practice a Similar Question** on a wrong answer, use **Get a hint**, answer it.
6. Back on **Practise**, the homework shows your best score and previous attempts; **Practise again** starts a fresh attempt.

## 4. Deploy to Vercel

1. Push the repo to GitHub and **Import** it in Vercel (framework: Next.js; defaults are fine).
2. **Settings → Environment Variables**: add every variable from the table above (Production + Preview). Mark the secret ones as *Sensitive*.
3. Use Node.js **22 or later** (Settings → General → Node.js Version); `@supabase/supabase-js` is dropping Node 20.
4. Deploy, then in Supabase **Authentication → URL Configuration** add the Vercel URL to Site URL / Redirect URLs.
5. Function duration: extraction and marking routes ask for up to 300 s (`maxDuration`). This works on Vercel Hobby with Fluid Compute (the default for new projects); otherwise Hobby is capped lower and long PDFs may time out.

Upload size notes: library files go **directly from the browser to Supabase Storage** (up to 20 MB), so Vercel's 4.5 MB request-body limit doesn't apply. The photo checker on `/` posts files through a Vercel function, so on Vercel it is limited to ~4.5 MB per request.

## Project layout

```
supabase/migrations/          SQL schema, RLS, storage bucket
src/proxy.ts                  Refreshes the Supabase session cookie
src/lib/gemini.ts             The single Gemini client + bounded retry
src/lib/supabase/             Browser, per-request server and service-role clients
src/lib/homework/             Photo checker: prompts, validation, file checks, answer matching, practice tokens
src/lib/library/              Library types (Zod), Gemini extraction, data access
src/lib/learn/                Student types, marking engine, data access
src/app/api/homework/         Photo checker + practice tutor endpoints
src/app/api/library/          Library CRUD, extraction, content save, signed file URLs
src/app/api/learn/            Attempts: start/resume, save answers, submit & mark, similar questions
src/app/api/students/         Child profiles
src/components/               UI (homework/, library/, learn/, auth/, ui/)
```
