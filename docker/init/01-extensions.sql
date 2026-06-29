-- Runs automatically the first time the Postgres data volume is initialized.
-- Ensures the pgvector extension is available before migrations run.
CREATE EXTENSION IF NOT EXISTS vector;
