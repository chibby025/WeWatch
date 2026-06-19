-- ============================================================
-- demo_media_library INSERT SQL (auto-generated from BunnyCDN)
-- Run AFTER: ALTER TABLE demo_media_library ADD COLUMN IF NOT EXISTS poster_url TEXT;
--
-- Files marked [NEEDS TRANSCODE] will be playable after running:
--   POST /api/admin/demo-media/transcode
-- which downloads, converts to .mp4, re-uploads, and updates the URL.
-- ============================================================

INSERT INTO demo_media_library (url, title, watch_types, sort_order, is_active, created_at) VALUES

-- ── ANIME (watch_type: video) ─────────────────────────────────────────────
-- JJK episodes (.mp4 — browser compatible, play immediately)
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_48_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 48', '{"video"}', 1, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_49_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 49', '{"video"}', 2, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_50_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 50', '{"video"}', 3, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_51_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 51', '{"video"}', 4, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_52_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 52', '{"video"}', 5, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_54_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 54', '{"video"}', 6, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_55_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 55', '{"video"}', 7, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_56_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 56', '{"video"}', 8, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_57_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 57', '{"video"}', 9, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_58_1080p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 58', '{"video"}', 10, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/AnimePahe_Jujutsu_Kaisen_-_59_720p_SubsPlease.mp4',
 'Jujutsu Kaisen — Episode 59', '{"video"}', 11, true, NOW()),

-- DBZ episodes (.rmvb — inserted now, URL updated after POST /api/admin/demo-media/transcode)
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/162%20-%20Goku%20vs%20Cell.rmvb',
 'Dragon Ball Z — Goku vs Cell', '{"video"}', 12, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/163%20-%20Cell%27s%20Bag%20Of%20Tricks.rmvb',
 'Dragon Ball Z — Cell''s Bag Of Tricks', '{"video"}', 13, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/164%20-%20No%20More%20Rules.rmvb',
 'Dragon Ball Z — No More Rules', '{"video"}', 14, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/165%20-%20The%20Fight%20Is%20Over.rmvb',
 'Dragon Ball Z — The Fight Is Over', '{"video"}', 15, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/166%20-%20Faith%20In%20A%20Boy.rmvb',
 'Dragon Ball Z — Faith In A Boy', '{"video"}', 16, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/167%20-%20Gohan%27s%20Desperate%20Plea.rmvb',
 'Dragon Ball Z — Gohan''s Desperate Plea', '{"video"}', 17, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/168%20-%20Android%20Explosion.rmvb',
 'Dragon Ball Z — Android Explosion', '{"video"}', 18, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/169%20-%20Children%20Of%20Cell%20Attack.rmvb',
 'Dragon Ball Z — Children Of Cell Attack', '{"video"}', 19, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/170%20-%20The%20Unleashing.rmvb',
 'Dragon Ball Z — The Unleashing', '{"video"}', 20, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/171%20-%20The%20Unstoppable%20Gohan.rmvb',
 'Dragon Ball Z — The Unstoppable Gohan', '{"video"}', 21, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/172%20-%20Cell%27s%20Mighty%20Break%20Down.rmvb',
 'Dragon Ball Z — Cell''s Mighty Break Down', '{"video"}', 22, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/173%20-%20A%20Hero%27s%20Farewell.rmvb',
 'Dragon Ball Z — A Hero''s Farewell', '{"video"}', 23, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Anime/174%20-%20Cell%20Returns!.rmvb',
 'Dragon Ball Z — Cell Returns!', '{"video"}', 24, true, NOW()),

-- ── CARTOON (watch_type: classroom) ──────────────────────────────────────
-- Justice League .m4v — browser compatible (Chrome/Safari treat m4v as mp4)
('https://LetsWatchOut.b-cdn.net/demo_media_library/Cartoon/Justice%20League%20Unlimited%20-%20S01%20E02%20-%20For%20the%20Man%20Who%20Has%20Everything%20(720p).m4v',
 'Justice League Unlimited — For the Man Who Has Everything', '{"classroom"}', 1, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Cartoon/Justice%20League%20Unlimited%20-%20S01%20E03%20-%20Kid%20Stuff%20(720p).m4v',
 'Justice League Unlimited — Kid Stuff', '{"classroom"}', 2, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Cartoon/Justice%20League%20Unlimited%20-%20S01%20E05%20-%20This%20Little%20Piggy%20(720p).m4v',
 'Justice League Unlimited — This Little Piggy', '{"classroom"}', 3, true, NOW()),

-- Aladdin .avi — [NEEDS TRANSCODE], inserted now, URL updated after transcoding
('https://LetsWatchOut.b-cdn.net/demo_media_library/Cartoon/1994%20-%20Aladdin.avi',
 'Aladdin (1994)', '{"classroom"}', 4, true, NOW()),

-- ── MOVIES (watch_type: cinema) ───────────────────────────────────────────
('https://LetsWatchOut.b-cdn.net/demo_media_library/Movies/Cuando%20Seas%20Mia%20_%20Diego%20%26%20Paloma.mp4',
 'Cuando Seas Mia', '{"cinema"}', 1, true, NOW()),

-- ── SERIES (watch_type: 3d_cinema) ───────────────────────────────────────
('https://LetsWatchOut.b-cdn.net/demo_media_library/Series/Gods%20of%20the%20Arena1.mp4',
 'Spartacus: Gods of the Arena — Part 1', '{"3d_cinema"}', 1, true, NOW()),
('https://LetsWatchOut.b-cdn.net/demo_media_library/Series/Gods%20of%20the%20Arena2.mp4',
 'Spartacus: Gods of the Arena — Part 2', '{"3d_cinema"}', 2, true, NOW()),

-- Legend of the Seeker .mkv — [NEEDS TRANSCODE]
('https://LetsWatchOut.b-cdn.net/demo_media_library/Series/Legend.of.the.Seeker.S01E03.Bounty.mkv',
 'Legend of the Seeker — S01E03: Bounty', '{"3d_cinema"}', 3, true, NOW()),

-- Love Death & Robots .mkv — [NEEDS TRANSCODE]
('https://LetsWatchOut.b-cdn.net/demo_media_library/Series/Love.Death.And.Robots.S01E01.720p.WEB.x264-GalaxyTV.mkv',
 'Love, Death & Robots — S01E01', '{"3d_cinema"}', 4, true, NOW());
