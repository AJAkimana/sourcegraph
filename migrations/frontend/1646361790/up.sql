ALTER TABLE batch_spec_resolution_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE batch_spec_workspace_execution_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE changeset_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE changesets ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE cm_action_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE cm_trigger_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE external_service_sync_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();
ALTER TABLE insights_query_runner_jobs ADD COLUMN IF NOT EXISTS queued_at timestamptz DEFAULT NOW();

-- LSIF upload records are not queued when created; they begin in an extra state called "uploading" and only
-- after the payload has been received in full do we mark the record ready for processing. We update this field
--- manually at that point.
ALTER TABLE lsif_uploads ADD COLUMN IF NOT EXISTS queued_at timestamptz;
