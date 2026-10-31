CREATE TABLE IF NOT EXISTS students (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  category TEXT,
  domicile_state TEXT,
  annual_family_income NUMERIC(12, 2),
  qualification_level TEXT,
  qualification_marks NUMERIC(5, 2),
  course_level TEXT,
  course_name TEXT,
  course_year INTEGER,
  entrance_exam_rank INTEGER,
  institution_name TEXT,
  has_disability BOOLEAN,
  is_orphan BOOLEAN,
  parent_occupation TEXT,
  receives_other_scholarship BOOLEAN,
  father_name TEXT,
  mother_name TEXT,
  mobile_number TEXT,
  district TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Apply these when upgrading an existing students table; IF NOT EXISTS keeps this safe to rerun.
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS domicile_state TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS annual_family_income NUMERIC(12, 2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS qualification_level TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS qualification_marks NUMERIC(5, 2);
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_level TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS course_year INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS entrance_exam_rank INTEGER;
ALTER TABLE students ADD COLUMN IF NOT EXISTS institution_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS has_disability BOOLEAN;
ALTER TABLE students ADD COLUMN IF NOT EXISTS is_orphan BOOLEAN;
ALTER TABLE students ADD COLUMN IF NOT EXISTS parent_occupation TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS receives_other_scholarship BOOLEAN;
ALTER TABLE students ADD COLUMN IF NOT EXISTS father_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS mother_name TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS mobile_number TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS district TEXT;

-- Student document files and their file names are not stored in Neon.
-- They stay in the student's local Scholar Assist Chrome extension storage.
