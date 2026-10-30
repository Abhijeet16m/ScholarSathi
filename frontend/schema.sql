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

-- File contents are stored outside public/; Neon holds private file metadata.
CREATE TABLE IF NOT EXISTS student_documents (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL CHECK (document_type IN (
    'aadhaar_card', 'apaar_id', 'marksheet_10', 'marksheet_12',
    'income_certificate', 'domicile_certificate', 'institution_certificate',
    'category_certificate', 'bank_passbook'
  )),
  original_name TEXT NOT NULL,
  storage_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS student_documents_student_id_idx ON student_documents(student_id);
