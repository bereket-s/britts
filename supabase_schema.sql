-- ============================================================
-- StudyMate AI — Supabase Database Schema
-- ============================================================
-- HOW TO USE:
--   1. Open your Supabase project dashboard
--   2. Go to SQL Editor → New query
--   3. Paste this entire file and click Run
-- ============================================================

-- Courses table
create table if not exists courses (
  id              text primary key,
  name            text not null,
  icon            text default '📚',
  description     text,
  has_notes       boolean default false,
  exams_count     integer default 0,
  documents_count integer default 0,
  created_at      timestamptz default now()
);

-- Documents table
create table if not exists documents (
  id          text primary key,
  course_id   text references courses(id) on delete cascade,
  name        text not null,
  mime_type   text,
  size        bigint default 0,
  url         text,
  uploaded_at timestamptz default now()
);

-- Notes table (one per course)
create table if not exists notes (
  id           text primary key,
  course_id    text references courses(id) on delete cascade unique,
  content      text,
  generated_at timestamptz default now()
);

-- Exams table
create table if not exists exams (
  id               text primary key,
  course_id        text references courses(id) on delete cascade,
  title            text,
  duration_minutes integer default 90,
  total_marks      integer default 60,
  course_name      text,
  data             jsonb,
  generated_at     timestamptz default now()
);

-- Results table
create table if not exists results (
  id           text primary key,
  exam_id      text references exams(id) on delete cascade,
  course_id    text references courses(id) on delete cascade,
  answers      jsonb default '{}',
  mcq_correct  integer default 0,
  mcq_total    integer default 0,
  time_taken   integer default 0,
  completed_at timestamptz default now()
);

-- ============================================================
-- Disable RLS (Row Level Security) on all tables
-- Required so the anon key can read/write without auth policies
-- ============================================================
alter table courses  disable row level security;
alter table documents disable row level security;
alter table notes    disable row level security;
alter table exams    disable row level security;
alter table results  disable row level security;

-- ============================================================
-- Storage bucket for uploaded course documents
-- ============================================================
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- Storage policy (drop first to avoid conflict on re-run)
drop policy if exists "Public document access" on storage.objects;
create policy "Public document access"
  on storage.objects for all
  using ( bucket_id = 'documents' );
