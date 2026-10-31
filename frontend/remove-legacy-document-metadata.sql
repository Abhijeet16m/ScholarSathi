-- Optional one-time cleanup for the earlier server version, which stored document metadata in Neon.
-- Review/back up the rows first. This drops only document metadata; it does not touch student accounts.
DROP TABLE IF EXISTS student_documents;
