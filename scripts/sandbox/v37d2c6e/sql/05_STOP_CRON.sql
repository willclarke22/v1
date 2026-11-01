-- SANDBOX ADMIN ONLY. Stops only the vector sync job; leaves V3.7D.2C.5C sync untouched.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname='myway_cloud_vectors_v37d2c6e';
