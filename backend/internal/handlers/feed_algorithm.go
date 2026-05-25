// WeWatch/backend/internal/handlers/feed_algorithm.go
// Scores and re-ranks the entire eligible post pool, then the caller paginates in Go.
//
// Scoring formula:
//   recencyScore  = 10000 / (hours_old + 1)            — dominant signal, halves every ~2× in age
//   engBoost      = joined-room ×1.4 | big-room ×1.2 | KYC-author ×1.15
//   engBonus      = min(rawEngagement × engBoost, recencyScore × 0.30)  — capped at 30% of recency
//   affinity      = content-affinity multiplier per viewer preference (primary ×2.0, adjacent ×1.5/1.2)
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

// affinityBoost returns a content-rating affinity multiplier for a viewer with the given
// primary preference. Primary match = ×2.0, adjacent high = ×1.5, adjacent low = ×1.2, neutral = ×1.0.
func affinityBoost(viewerPref, postRating string) float64 {
	affinityMap := map[string]map[string]float64{
		"G":           {"G": 2.0, "PG": 1.5, "Educational": 1.2},
		"PG":          {"PG": 2.0, "G": 1.5, "Educational": 1.2, "13+": 1.2},
		"Educational": {"Educational": 2.0, "G": 1.5, "PG": 1.2, "Religious": 1.2},
		"Religious":   {"Religious": 2.0, "Educational": 1.5, "G": 1.2},
		"13+":         {"13+": 2.0, "PG": 1.5, "16+": 1.2, "G": 1.2},
		"16+":         {"16+": 2.0, "13+": 1.5, "18+": 1.2, "PG": 1.2},
		"18+":         {"18+": 2.0, "Mature": 1.5, "16+": 1.2, "13+": 1.2},
		"Mature":      {"Mature": 2.0, "18+": 1.5, "16+": 1.2},
	}
	if prefs, ok := affinityMap[viewerPref]; ok {
		if b, ok := prefs[postRating]; ok {
			return b
		}
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
