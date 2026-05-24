// WeWatch/backend/internal/handlers/feed_algorithm.go
// Scores and re-ranks posts within a fetched page.
// Formula: (tip_count*5 + comments_count*2 + likes_count*1) / (hours_old + 2)^1.5
// Boosts applied on top of base score:
//   joined room ×1.4 | room ≥10 members ×1.2 | content rating match ×1.2 | KYC author ×1.15
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

// ScoreAndSortPosts re-ranks a slice of posts in-place using the WeWatch feed algorithm.
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
		decay := math.Pow(hoursOld+2, 1.5)
		base := (float64(p.TipCount)*5 + float64(p.CommentsCount)*2 + float64(p.LikesCount)) / decay

		boost := 1.0
		if p.RoomID != nil {
			if joinedRooms[*p.RoomID] {
				boost *= 1.4
			}
			if roomMemberCounts[*p.RoomID] >= 10 {
				boost *= 1.2
			}
		}
		if primaryRating != "" && p.ContentRating == primaryRating {
			boost *= 1.2
		}
		if kycVerified[p.UserID] {
			boost *= 1.15
		}

		scored[i] = scoredPost{post: p, score: base * boost}
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
