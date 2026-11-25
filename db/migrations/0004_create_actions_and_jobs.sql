CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL REFERENCES projects(id),

    name TEXT NOT NULL,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    project_id UUID NOT NULL REFERENCES projects(id),
    ticket_id UUID NOT NULL REFERENCES tickets(id),

    
    proposed_by_agent_id UUID NOT NULL
    REFERENCES agents(id),

    idempotency_key TEXT NOT NULL,

    action_type TEXT NOT NULL,
    payload JSONB NOT NULL,

    preview JSONB NOT NULL,
    execution_class TEXT NOT NULL
        CHECK (
        execution_class IN (
            'internal',
            'provider_idempotent',
            'requires_reconciliation'
            )
        ),

    effect_class TEXT NOT NULL
        CHECK (
            effect_class IN (
                'reversible',
                'compensatable',
                'irreversible'
            )
        ),

    payload_hash TEXT NOT NULL,
    base_version INTEGER NOT NULL CHECK (base_version > 0),

    state TEXT NOT NULL DEFAULT 'proposed'
        CHECK (
            state IN (
                'proposed',
                'approved',
                'executing',
                'succeeded',
                'failed',
                'rejected',
                'expired',
                'outcome_unknown',
                'needs_review',
                'compensating',
                'compensated'
            )
        ),

    expires_at TIMESTAMPTZ NOT NULL,
    approved_at TIMESTAMPTZ,
    
    result JSONB,
    result_version INTEGER
        CHECK (result_version > 0),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


CREATE UNIQUE INDEX actions_idempotency_key_idx
ON actions (
    project_id,
    proposed_by_agent_id,
    idempotency_key
);  

CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    action_id UUID NOT NULL UNIQUE
        REFERENCES actions(id),

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (
            status IN (
                'pending',
                'running',
                'completed',
                'dead_letter'
            )
        ),

    available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    attempts INTEGER NOT NULL DEFAULT 0
        CHECK (attempts >= 0),

    max_attempts INTEGER NOT NULL DEFAULT 5
        CHECK (max_attempts > 0),

    lease_token UUID,
    lease_expires_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE action_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

    action_id UUID NOT NULL
        REFERENCES actions(id),

    event_type TEXT NOT NULL,

    from_state TEXT,
    to_state TEXT,

    actor_type TEXT CHECK (
        actor_type IN ('person', 'policy', 'agent', 'system')
    ),
    actor_id TEXT,

    details JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX action_events_action_id_id_idx
ON action_events (action_id, id);

-- Allow project-scoped foreign keys.
CREATE UNIQUE INDEX agents_project_id_id_idx
ON agents (project_id, id);

CREATE UNIQUE INDEX tickets_project_id_id_idx
ON tickets (project_id, id);

-- An action's agent must belong to its project.
ALTER TABLE actions
ADD CONSTRAINT actions_agent_project_fkey
FOREIGN KEY (project_id, proposed_by_agent_id)
REFERENCES agents (project_id, id);

-- An action's ticket must belong to its project.
ALTER TABLE actions
ADD CONSTRAINT actions_ticket_project_fkey
FOREIGN KEY (project_id, ticket_id)
REFERENCES tickets (project_id, id);


-- Prevent updates and deletes of action history.
CREATE FUNCTION prevent_action_event_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION
        'action_events is append-only';
END;
$$;

CREATE TRIGGER action_events_append_only
BEFORE UPDATE OR DELETE ON action_events
FOR EACH ROW
EXECUTE FUNCTION prevent_action_event_changes();
