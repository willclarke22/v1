-- Run ONLY in the ORIGINAL Supabase dashboard. READ-ONLY; does not export learner data.
-- Aggregate counts only; use this to estimate how many centroids are reusable.
SELECT
  count(*) AS topic_count,
  count(*) FILTER (WHERE CASE WHEN jsonb_typeof(topic_label_embedding_centroid)='array'
       THEN jsonb_array_length(topic_label_embedding_centroid)=384
       AND nullif(btrim(topic_label_embedding_model),'') IS NOT NULL ELSE false END) AS valid_label_384,
  count(*) FILTER (WHERE CASE WHEN jsonb_typeof(topic_message_embedding_centroid)='array'
       THEN jsonb_array_length(topic_message_embedding_centroid)=384
       AND nullif(btrim(topic_message_embedding_model),'') IS NOT NULL ELSE false END) AS valid_message_384,
  count(*) FILTER (WHERE topic_label_embedding_centroid IS NOT NULL) AS label_centroid_present,
  count(*) FILTER (WHERE topic_message_embedding_centroid IS NOT NULL) AS message_centroid_present
FROM public.topic_state;
SELECT topic_label_embedding_model AS model, count(*) AS topic_count
FROM public.topic_state WHERE topic_label_embedding_model IS NOT NULL
GROUP BY topic_label_embedding_model ORDER BY topic_count DESC;
