ALTER TABLE tickets
ADD COLUMN status TEXT NOT NULL DEFAULT 'open';

ALTER TABLE tickets
ADD CONSTRAINT tickets_status_check
CHECK (status IN ('open', 'in_progress', 'closed'));
