-- Check posts with Railway backend URLs vs Bunny CDN URLs
-- Run this on Railway database to see the issue

SELECT 
    id,
    user_id,
    title,
    media_type,
    CASE 
        WHEN video_url LIKE 'https://LetsWatchOut.b-cdn.net%' THEN 'Bunny CDN'
        WHEN video_url LIKE 'https://letswatchout-production.up.railway.app%' THEN 'Railway Backend'
        WHEN video_url LIKE '/uploads/%' THEN 'Local Path'
        ELSE 'Unknown'
    END AS url_type,
    video_url,
    thumbnail_url,
    created_at
FROM posts
ORDER BY created_at DESC
LIMIT 20;

-- Count posts by URL type
SELECT 
    CASE 
        WHEN video_url LIKE 'https://LetsWatchOut.b-cdn.net%' THEN 'Bunny CDN'
        WHEN video_url LIKE 'https://letswatchout-production.up.railway.app%' THEN 'Railway Backend'
        WHEN video_url LIKE '/uploads/%' THEN 'Local Path'
        ELSE 'Unknown'
    END AS url_type,
    COUNT(*) as count
FROM posts
GROUP BY url_type
ORDER BY count DESC;
