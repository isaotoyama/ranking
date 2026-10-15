-- Apply as the Neon owner/migration role AFTER Drizzle migrations.
-- Runtime DATABASE_URL should use a separate `ranking_app` role with no DDL privileges.

CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only; create a correction/adjustment record instead', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS results_immutable ON results;
CREATE TRIGGER results_immutable BEFORE UPDATE OR DELETE ON results
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS result_adjustments_immutable ON result_adjustments;
CREATE TRIGGER result_adjustments_immutable BEFORE UPDATE OR DELETE ON result_adjustments
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

DROP TRIGGER IF EXISTS webhook_events_immutable ON webhook_events;
CREATE TRIGGER webhook_events_immutable BEFORE UPDATE OR DELETE ON webhook_events
FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Defense-in-depth: a result must belong to the stated competition/round/player and
-- the submitting user must be an authorized scorer/admin/owner for that organization.
CREATE OR REPLACE FUNCTION validate_result_insert() RETURNS trigger AS $$
DECLARE
  org_id uuid;
  org_owner uuid;
  comp_metric metric_type;
BEGIN
  SELECT c.organization_id, o.owner_user_id, c.metric INTO org_id, org_owner, comp_metric
  FROM competitions c JOIN organizations o ON o.id = c.organization_id
  WHERE c.id = NEW.competition_id;

  IF org_id IS NULL THEN RAISE EXCEPTION 'competition not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM rounds r WHERE r.id = NEW.round_id AND r.competition_id = NEW.competition_id) THEN
    RAISE EXCEPTION 'round does not belong to competition';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM competition_participants p WHERE p.competition_id = NEW.competition_id AND p.player_id = NEW.player_id) THEN
    RAISE EXCEPTION 'player is not registered for competition';
  END IF;
  IF NEW.status = 'valid'::result_status AND NEW.raw_value IS NULL THEN
    RAISE EXCEPTION 'valid result requires raw_value';
  END IF;
  IF NEW.status = 'valid'::result_status AND comp_metric = 'time'::metric_type AND NEW.raw_value < 0 THEN
    RAISE EXCEPTION 'time cannot be negative';
  END IF;
  IF NEW.status = 'valid'::result_status AND comp_metric = 'position'::metric_type
     AND (NEW.raw_value < 1 OR NEW.raw_value <> trunc(NEW.raw_value)) THEN
    RAISE EXCEPTION 'position must be a positive integer';
  END IF;
  IF NEW.attempt_number < 1 THEN RAISE EXCEPTION 'attempt_number must be positive'; END IF;

  IF NEW.submitted_by_user_id <> org_owner AND NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = org_id AND m.user_id = NEW.submitted_by_user_id
      AND m.role IN ('owner'::org_role, 'admin'::org_role, 'scorer'::org_role)
  ) THEN
    RAISE EXCEPTION 'user is not authorized to submit results';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS results_validate_insert ON results;
CREATE TRIGGER results_validate_insert BEFORE INSERT ON results
FOR EACH ROW EXECUTE FUNCTION validate_result_insert();

-- Adjustments are corrections to evidence, so require admin/owner authority at SQL level.
CREATE OR REPLACE FUNCTION validate_result_adjustment_insert() RETURNS trigger AS $$
DECLARE
  org_id uuid;
  org_owner uuid;
BEGIN
  SELECT c.organization_id, o.owner_user_id INTO org_id, org_owner
  FROM results r
  JOIN competitions c ON c.id = r.competition_id
  JOIN organizations o ON o.id = c.organization_id
  WHERE r.id = NEW.result_id;

  IF org_id IS NULL THEN RAISE EXCEPTION 'result not found'; END IF;
  IF NEW.created_by_user_id <> org_owner AND NOT EXISTS (
    SELECT 1 FROM organization_members m
    WHERE m.organization_id = org_id AND m.user_id = NEW.created_by_user_id
      AND m.role IN ('owner'::org_role, 'admin'::org_role)
  ) THEN
    RAISE EXCEPTION 'user is not authorized to adjust results';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS result_adjustments_validate_insert ON result_adjustments;
CREATE TRIGGER result_adjustments_validate_insert BEFORE INSERT ON result_adjustments
FOR EACH ROW EXECUTE FUNCTION validate_result_adjustment_insert();

-- Structural checks that complement application validation.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'round_number_positive') THEN
    ALTER TABLE rounds ADD CONSTRAINT round_number_positive CHECK (round_number > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'round_weight_positive') THEN
    ALTER TABLE rounds ADD CONSTRAINT round_weight_positive CHECK (weight > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ranking_rank_positive') THEN
    ALTER TABLE ranking_entries ADD CONSTRAINT ranking_rank_positive CHECK (rank > 0);
  END IF;
END $$;

-- Recommended least-privilege runtime role. Create the role/password separately as owner:
--   CREATE ROLE ranking_app LOGIN PASSWORD '<strong-generated-password>';
-- Then execute these grants (or adapt the role name) as owner:
--
-- REVOKE ALL ON SCHEMA public FROM ranking_app;
-- GRANT USAGE ON SCHEMA public TO ranking_app;
-- GRANT CONNECT ON DATABASE neondb TO ranking_app;
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO ranking_app;
-- GRANT INSERT, UPDATE ON users, players, organizations, organization_members, series, seasons,
--   competitions, rounds, competition_participants, ranking_definitions, ranking_runs,
--   api_keys, api_usage_monthly, api_usage_daily, subscriptions TO ranking_app;
-- GRANT INSERT ON results, result_adjustments, ranking_entries, webhook_events, audit_logs TO ranking_app;
--
-- Do NOT grant CREATE on schema, TRUNCATE, table ownership, or migration privileges to ranking_app.
-- Do NOT use broad ALTER DEFAULT PRIVILEGES for writes; new tables should fail closed until explicitly granted.
-- DATABASE_URL => ranking_app. DATABASE_MIGRATION_URL => owner/migration role, never exposed to the running app.
