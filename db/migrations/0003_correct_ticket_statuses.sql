-- Replace the old status constraint.
ALTER TABLE tickets
DROP CONSTRAINT tickets_status_check;

-- Match the four ticket statuses defined in @jekro/shared.
ALTER TABLE tickets
ADD CONSTRAINT tickets_status_check
CHECK (
    status IN (
        'open',
        'in_progress',
        'in_review',
        'done'
    )
);
