-- SANDBOX ADMIN SQL EDITOR ONLY. Run after 01_INSTALL_VECTOR_PROJECTION.sql succeeds.
SELECT myway_sync_private.refresh_cloud_vector_snapshot_v37d2c6e();
SELECT indexed_labels,source_labels,last_success_at FROM myway_sync_private.vector_sync_status WHERE singleton;
SELECT embedding_model,count(*) AS indexed FROM public.myway_cloud_vector_snapshot
 GROUP BY embedding_model ORDER BY indexed DESC;
