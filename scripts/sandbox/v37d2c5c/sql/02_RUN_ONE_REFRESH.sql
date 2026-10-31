-- V3.7D.2C.5C / SANDBOX ONLY / MUTATES CLOUD SNAPSHOT TABLES.
-- Perform once in the SQL Editor after reviewing 01; DOES NOT touch topic_state.
-- Does not require Cron extension. Failures rollback the entire refresh.
SELECT myway_sync_private.refresh_cloud_snapshot();
SELECT last_success_at,last_topic_count,last_relationship_count
FROM myway_sync_private.owner_binding WHERE singleton=true;
