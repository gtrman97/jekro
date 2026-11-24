
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id),
    title TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1
        CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
