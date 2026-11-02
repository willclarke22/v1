-- MANUAL ADMIN ONLY / myway_sandbox. Review 00_PREFLIGHT first.
-- Refresh both approved event families (validated D2C and parent-confirmed explicit D2A).
-- NO scheduled job or embedding generation.
SELECT myway_sync_private.refresh_cloud_difficulties_v37d2c7a();
SELECT count(*) AS approved_events,count(*) FILTER(WHERE embedding IS NOT NULL) AS indexed_events,
 count(DISTINCT topic_id) AS historical_topics
FROM public.myway_cloud_difficulty_snapshot;
-- If 5 events are present, use the 7A Workbench's explicit "Prepare manual vector SQL" action.
-- Review the generated vector-only SQL and execute it manually in this isolated SQL Editor.
