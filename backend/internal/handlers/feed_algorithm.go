// WeWatch/backend/internal/handlers/feed_algorithm.go
// Scores and re-ranks the entire eligible post pool, then the caller paginates in Go.
//
// Content-rating FILTERING (both the age-eligibility gate and the user's own
// "what do you want to see" preference set) happens entirely upstream of this
// file, as SQL/Go-side pool filters in posts.go — see canViewContentRating/
// restrictedContentRatings and getPreferredContentRatings. By the time a post
// reaches ScoreAndSortPosts, it has already passed both, so affinityBoost
// below is deliberately NOT a content-eligibility mechanism — it never
// excludes anything, it only nudges order within an already-allowed pool.
//
// Scoring formula:
//   recencyScore  = 10000 / (hours_old + 1)            — dominant signal, halves every ~2× in age
//   engBoost      = joined-room ×1.4 | big-room ×1.2 | KYC-author ×1.15
//   engBonus      = min(rawEngagement × engBoost, recencyScore × 0.30)  — capped at 30% of recency
//   affinity      = ×1.15 if the post's rating matches the viewer's auto-derived
//                   "primary" (see below), else ×1.0 — a small secondary nudge, not the
//                   thing that determines whether a post appears at all
//   final score   = (recencyScore + engBonus) × affinity
//
// Property: engagement can shuffle posts within a similar-age band but cannot promote an
// old post above a post that is significantly newer (the 30% cap + steep recency slope ensures this).
package handlers

import (
	"math"
	"sort"
	"time"

	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

type scoredPost struct {
	post  models.Post
	score float64
}

// affinityFocusBoost is the small secondary nudge for a post whose rating
// exactly matches the viewer's auto-derived "primary" rating (UserSettings.
// PrimaryRating — the first rating a user selected in their multi-select
// content-rating preferences, see SetContentRatingPreferencesHandler). Kept
// deliberately small: real inclusion/exclusion is already decided upstream
// by the hard preference filter (posts.go), so among several ratings a user
// equally opted into, this only slightly favors whichever one they picked
// first — it is not a proxy for "does the user want this at all" anymore.
//
// This used to be a 3-tier adjacency map (exact/close/loose match, up to
// ×2.0) computed against a single "primary preference" that WAS the sole
// signal deciding relevance. Once a real hard filter exists upstream, that
// adjacency concept stops being meaningful: every post reaching this
// function already has a rating the viewer explicitly opted into, so a
// rating-vs-rating "closeness" score has nothing left to differentiate —
// it would return the same top tier for every surviving post. A flat,
// smaller binary nudge is what's actually left to compute.
const affinityFocusBoost = 1.15

// affinityBoost returns the small secondary ranking nudge described above.
// viewerPrimary may be "" (no preference set yet, or none selected) — always
// neutral in that case, same as an unauthenticated viewer.
func affinityBoost(viewerPrimary, postRating string) float64 {
	if viewerPrimary != "" && viewerPrimary == postRating {
		return affinityFocusBoost
	}
	return 1.0
}

// ScoreAndSortPosts re-ranks a slice of posts using the WeWatch feed algorithm.
// Call this on the ENTIRE eligible pool before paginating — not on a single page.
// All DB lookups are batched (no N+1). Safe to call with an empty slice.
func ScoreAndSortPosts(db *gorm.DB, posts []models.Post, viewerID uint, primaryRating string) []models.Post {
	if len(posts) <= 1 {
		return posts
	}

	// --- batch: viewer's joined rooms ---
	roomIDSet := make(map[uint]struct{}, len(posts))
	for _, p := range posts {
		if p.RoomID != nil {
			roomIDSet[*p.RoomID] = struct{}{}
		}
	}

	joinedRooms := make(map[uint]bool)
	roomMemberCounts := make(map[uint]int64)

	if len(roomIDSet) > 0 {
		roomIDs := make([]uint, 0, len(roomIDSet))
		for id := range roomIDSet {
			roomIDs = append(roomIDs, id)
		}

		if viewerID > 0 {
			type roomIDRow struct{ RoomID uint }
			var rows []roomIDRow
			db.Table("user_rooms").Select("room_id").
				Where("user_id = ? AND room_id IN ? AND deleted_at IS NULL AND status = 'active'", viewerID, roomIDs).
				Scan(&rows)
			for _, r := range rows {
				joinedRooms[r.RoomID] = true
			}
		}

		type countRow struct {
			RoomID uint
			Cnt    int64
		}
		var cntRows []countRow
		db.Table("user_rooms").Select("room_id, COUNT(*) as cnt").
			Where("room_id IN ? AND deleted_at IS NULL AND status = 'active'", roomIDs).
			Group("room_id").Scan(&cntRows)
		for _, r := range cntRows {
			roomMemberCounts[r.RoomID] = r.Cnt
		}
	}

	// --- batch: KYC status of post authors ---
	authorIDSet := make(map[uint]struct{}, len(posts))
	for _, p := range posts {
		authorIDSet[p.UserID] = struct{}{}
	}
	kycVerified := make(map[uint]bool, len(authorIDSet))
	{
		authorIDs := make([]uint, 0, len(authorIDSet))
		for id := range authorIDSet {
			authorIDs = append(authorIDs, id)
		}
		type kycRow struct {
			ID        uint
			KYCStatus string
		}
		var rows []kycRow
		db.Table("users").Select("id, kyc_status").Where("id IN ?", authorIDs).Scan(&rows)
		for _, r := range rows {
			kycVerified[r.ID] = r.KYCStatus == "approved"
		}
	}

	// --- score each post ---
	now := time.Now()
	scored := make([]scoredPost, len(posts))
	for i, p := range posts {
		hoursOld := now.Sub(p.CreatedAt).Hours()
		if hoursOld < 0 {
			hoursOld = 0
		}

		// Recency dominates: score is inversely proportional to age.
		// A 1-hour post scores ~5000; a 24-hour post ~400; a 7-day post ~6; a 30-day post ~1.4.
		recencyScore := 10000.0 / (hoursOld + 1)

		// Engagement boosts amplify the raw engagement signal for posts in rooms the viewer
		// has joined, popular rooms, or posts by KYC-verified authors.
		engBoost := 1.0
		if p.RoomID != nil {
			if joinedRooms[*p.RoomID] {
				engBoost *= 1.4
			}
			if roomMemberCounts[*p.RoomID] >= 10 {
				engBoost *= 1.2
			}
		}
		if kycVerified[p.UserID] {
			engBoost *= 1.15
		}

		rawEngagement := float64(p.TipCount*5 + p.CommentsCount*2 + p.LikesCount)
		// Cap engagement bonus at 30% of the recency score so viral old posts cannot
		// consistently beat significantly newer posts with zero engagement.
		engBonus := math.Min(rawEngagement*engBoost, recencyScore*0.30)

		// Content affinity scales the combined score so preferred ratings surface higher
		// while still respecting recency within each affinity tier.
		affinity := affinityBoost(primaryRating, p.ContentRating)

		scored[i] = scoredPost{post: p, score: (recencyScore + engBonus) * affinity}
	}

	sort.SliceStable(scored, func(i, j int) bool {
		return scored[i].score > scored[j].score
	})

	result := make([]models.Post, len(scored))
	for i, s := range scored {
		result[i] = s.post
	}
	return result
}
