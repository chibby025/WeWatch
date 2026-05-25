// backend/internal/handlers/posts.go
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// canViewContentRating returns whether a viewer with the given settings is allowed to see a post
// with the given content rating. G/PG/Educational/Religious are always visible.
func canViewContentRating(rating string, s models.UserSettings) bool {
	switch rating {
	case "13+":
		return s.CanSee13Plus
	case "16+":
		return s.CanSee16Plus
	case "18+":
		return s.CanSee18Plus
	case "Mature":
		return s.CanSeeMature
	default: // G, PG, Educational, Religious, or unknown
		return true
	}
}

// CreatePostRequest represents the request body for creating a post
type CreatePostRequest struct {
	Description    string   `json:"description"`
	TextContent    *string  `json:"text_content"`
	RoomID         *uint    `json:"room_id"`
	MediaType      string   `json:"media_type" binding:"omitempty,oneof=video image gif"`
	PostType       string   `json:"post_type" binding:"required,oneof=recording upload text"`
	Duration       *int     `json:"duration"`
	Resolution     string   `json:"resolution"`
	ContentRating  string   `json:"content_rating" binding:"omitempty,oneof=G PG Educational Religious 13+ 16+ 18+ Mature"`
	IsPaid         bool     `json:"is_paid"`
	Price          *float64 `json:"price"`
	IsPublic       bool     `json:"is_public"`
	AllowDownloads bool     `json:"allow_downloads"`
}

// UpdatePostRequest represents the request body for updating a post
type UpdatePostRequest struct {
	Description    *string  `json:"description"`
	IsPublic       *bool    `json:"is_public"`
	IsPaid         *bool    `json:"is_paid"`
	Price          *float64 `json:"price"`
	AllowDownloads *bool    `json:"allow_downloads"`
	ContentRating  *string  `json:"content_rating" binding:"omitempty,oneof=G PG Educational Religious 13+ 16+ 18+ Mature"`
}

// PostFeedResponse wraps a Post with per-viewer computed access fields.
// HasAccess: viewer owns or has purchased the post.
// IsOwner: viewer is the post creator.
// CanDownload: viewer is allowed to download (paid=purchased/owner, free=allow_downloads or owner).
// ShowOverlay: viewer should see a blur/click-through overlay (18+/Mature posts for users who haven't opted out).
type PostFeedResponse struct {
	models.Post
	HasAccess   bool `json:"has_access"`
	IsOwner     bool `json:"is_owner"`
	CanDownload bool `json:"can_download"`
	ShowOverlay bool `json:"show_overlay"`
}

func buildPostResponse(post models.Post, currentUserID uint, purchasedIDs map[uint]bool, viewerShowMature bool) PostFeedResponse {
	isOwner := currentUserID > 0 && post.UserID == currentUserID
	hasAccess := isOwner
	if !isOwner && purchasedIDs != nil {
		hasAccess = purchasedIDs[post.ID]
	}
	canDownload := false
	if post.IsPaid {
		canDownload = hasAccess
	} else {
		canDownload = isOwner || post.AllowDownloads
	}
	showOverlay := !isOwner && !viewerShowMature && (post.ContentRating == "18+" || post.ContentRating == "Mature")
	return PostFeedResponse{Post: post, HasAccess: hasAccess, IsOwner: isOwner, CanDownload: canDownload, ShowOverlay: showOverlay}
}

// CreatePost handles POST /api/posts
func CreatePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var req CreatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	log.Printf("🎯 [CreatePost] Starting - UserID: %d, ReqRoomID: %v", userID, req.RoomID)

	// Validate price requirements
	if req.IsPaid {
		if req.Price == nil || *req.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Price is required for paid posts"})
			return
		}
	}

	// Recording cap: free users limited to 10 recordings; premium users unlimited
	if req.PostType == "recording" {
		var user models.User
		if err := DB.Select("is_premium, premium_expires_at").First(&user, userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify user"})
			return
		}
		isPremium := user.IsPremium && (user.PremiumExpiresAt == nil || user.PremiumExpiresAt.After(time.Now()))
		if !isPremium {
			var count int64
			DB.Model(&models.Post{}).
				Where("user_id = ? AND post_type = ? AND deleted_at IS NULL", userID, "recording").
				Count(&count)
			if count >= 10 {
				c.JSON(http.StatusForbidden, gin.H{
					"error":       "Recording limit reached",
					"code":        "recording_limit",
					"limit":       10,
					"count":       count,
					"upgrade_msg": "Free accounts are limited to 10 recordings. Delete an old recording to make space, or upgrade to Premium for unlimited recordings.",
				})
				return
			}
		}
	}

	// ✅ Determine which room to post to
	var roomID *uint = req.RoomID
	
	log.Printf("🔍 [CreatePost] Initial roomID from request: %v", roomID)
	
	// If no room specified, use user's main room
	if roomID == nil {
		var user models.User
		if err := DB.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "User not found"})
			return
		}
		
		log.Printf("🔍 [CreatePost] User %d - MainRoomID: %v, ReqRoomID: %v", userID, user.MainRoomID, req.RoomID)
		
		// Use main room if it exists
		if user.MainRoomID != nil {
			roomID = user.MainRoomID
			log.Printf("✅ [CreatePost] Auto-assigning main room %d to post", *roomID)
		} else {
			log.Printf("⚠️ [CreatePost] No main room found for user %d", userID)
		}
	} else {
		log.Printf("ℹ️ [CreatePost] RoomID already specified in request: %v", *roomID)
	}
	
	// ✅ If posting to a room, verify user is the room host
	if roomID != nil {
		var room models.Room
		if err := DB.First(&room, *roomID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		
		if room.HostID != userID {
			log.Printf("⛔ [CreatePost] User %d attempted to post to room %d (not host)", userID, *roomID)
			c.JSON(http.StatusForbidden, gin.H{"error": "Only room hosts can post to room feeds"})
			return
		}
	}

	// Create post
	contentRating := req.ContentRating
	if contentRating == "" {
		contentRating = "G" // Default to G rating if not specified
	}
	
	post := models.Post{
		UserID:         userID,
		RoomID:         roomID,
		Description:    req.Description,
		TextContent:    req.TextContent,
		MediaType:      req.MediaType,
		PostType:       req.PostType,
		Duration:       req.Duration,
		Resolution:     req.Resolution,
		ContentRating:  contentRating,
		IsPaid:         req.IsPaid,
		Price:          req.Price,
		IsPublic:       req.IsPublic,
		AllowDownloads: req.AllowDownloads,
	}

	if err := DB.Create(&post).Error; err != nil {
		log.Printf("❌ [CreatePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to create post",
			"debug": err.Error(), // temporary: remove after diagnosing production error
		})
		return
	}

	// Reload post with associations
	if err := DB.Preload("User").Preload("Room").First(&post, post.ID).Error; err != nil {
		log.Printf("⚠️ [CreatePost] Failed to reload post associations: %v", err)
	}

	log.Printf("✅ [CreatePost] Post %d created by user %d (%s)", post.ID, userID, post.User.Username)

	// ✅ Broadcast notification to all rooms where user is the host
	go broadcastRoomPostNotificationToAllHostRooms(post, userID)

	c.JSON(http.StatusCreated, gin.H{"post": post})
}

// UploadPostMedia handles POST /api/posts/:id/upload
// Uploads video/image/gif to BunnyCDN and updates post record
func UploadPostMedia(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Get post and verify ownership
	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if post.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to upload to this post"})
		return
	}

	// Get uploaded file
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
		return
	}
	defer file.Close()

	// Validate file type
	contentType := header.Header.Get("Content-Type")
	if !isValidMediaType(contentType, post.MediaType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("Invalid file type for %s", post.MediaType)})
		return
	}

	// Upload to BunnyCDN
	cdnURL, err := utils.UploadMultipartFileToBunnyCDN(file, header)
	if err != nil {
		log.Printf("❌ [UploadPostMedia] BunnyCDN upload failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to upload media"})
		return
	}

	// Generate thumbnail URL (for videos and images)
	thumbnailURL := utils.GenerateThumbnailURL(cdnURL, 320, 240)

	// Update post with media URLs
	post.VideoURL = cdnURL
	post.ThumbnailURL = thumbnailURL
	if err := DB.Save(&post).Error; err != nil {
		log.Printf("❌ [UploadPostMedia] Database update failed: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
		return
	}

	log.Printf("✅ [UploadPostMedia] Media uploaded for post %d: %s", post.ID, cdnURL)

	// Broadcast to discover feed for all connected users (public posts only).
	if post.IsPublic {
		go func(p models.Post) {
			wsHub := GetWebSocketManager()
			if wsHub == nil {
				return
			}
			notification := map[string]interface{}{
				"type": "discover_post_created",
				"data": map[string]interface{}{
					"post_id":        p.ID,
					"author_id":      p.UserID,
					"thumbnail":      p.ThumbnailURL,
					"media_type":     p.MediaType,
					"content_rating": p.ContentRating,
				},
				"timestamp": time.Now().Unix(),
			}
			notificationJSON, err := json.Marshal(notification)
			if err != nil {
				return
			}
			wsHub.BroadcastToLobby(OutgoingMessage{Data: notificationJSON, IsBinary: false})
		}(post)
	}

	c.JSON(http.StatusOK, gin.H{
		"video_url":     post.VideoURL,
		"thumbnail_url": post.ThumbnailURL,
	})
}

// GetDiscoverFeed handles GET /api/posts
// Returns paginated randomized feed of public posts
func GetDiscoverFeed(c *gin.Context) {
	// Pagination parameters
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))
	searchQuery := c.Query("search")
	
	if limit > 100 {
		limit = 100 // Max 100 posts per request
	}

	// Get current user ID (may be 0 if not authenticated)
	currentUserID := c.GetUint("user_id")

	var posts []models.Post
	query := DB.Where("posts.is_public = ? AND posts.deleted_at IS NULL", true).
		Preload("User").
		Preload("Room"). // ✅ Preload room association for recordings
		Order("posts.created_at DESC"). // Newest first (chronological feed)
		Limit(limit).
		Offset(offset)
	
	// 🔍 Search filter (title, description, or username)
	if searchQuery != "" {
		searchPattern := "%" + searchQuery + "%"
		query = query.Joins("LEFT JOIN users ON posts.user_id = users.id").
			Where("posts.description ILIKE ? OR users.username ILIKE ?",
				searchPattern, searchPattern)
		log.Printf("🔍 [GetDiscoverFeed] Searching for: '%s'", searchQuery)
	}
	
	log.Printf("📊 [GetDiscoverFeed] Fetching posts - limit: %d, offset: %d, search: '%s'", limit, offset, searchQuery)

	if err := query.Find(&posts).Error; err != nil {
		log.Printf("❌ [GetDiscoverFeed] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}

	// ✅ Filter posts based on user privacy settings.
	// Batch fetch settings for all unique authors in this page to avoid an N+1 query
	// per post (previously this loop ran len(posts) sequential SELECTs).
	authorIDSet := make(map[uint]struct{}, len(posts))
	for _, p := range posts {
		authorIDSet[p.UserID] = struct{}{}
	}
	authorIDs := make([]uint, 0, len(authorIDSet))
	for id := range authorIDSet {
		authorIDs = append(authorIDs, id)
	}
	settingsByUser := make(map[uint]models.UserSettings, len(authorIDs))
	if len(authorIDs) > 0 {
		var batchSettings []models.UserSettings
		if err := DB.Where("user_id IN ?", authorIDs).Find(&batchSettings).Error; err == nil {
			for _, s := range batchSettings {
				settingsByUser[s.UserID] = s
			}
		}
	}

	var filteredPosts []models.Post
	for _, post := range posts {
		// No settings row = default to "public" (allow post).
		if authorSettings, ok := settingsByUser[post.UserID]; ok {
			switch authorSettings.WhoCanSeePosts {
			case "only_me":
				if post.UserID != currentUserID {
					continue
				}
			case "friends":
				if post.UserID != currentUserID {
					var friendship models.Friendship
					err := DB.Where(
						"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
						currentUserID, post.UserID, post.UserID, currentUserID, "accepted",
					).First(&friendship).Error
					if err != nil {
						continue
					}
				}
			// "public" - show to everyone (no filtering)
			}
		}

		filteredPosts = append(filteredPosts, post)
	}

	// Debug log for posts without user data
	for _, post := range filteredPosts {
		log.Printf("🔍 [GetDiscoverFeed] Post %d - UserID: %d, User.ID: %d, User.Username: '%s', User.MainRoomID: %v, PostRoomID: %v, HasUser: %v",
			post.ID, post.UserID, post.User.ID, post.User.Username, post.User.MainRoomID, post.RoomID, post.User.ID != 0)
		
		if post.User.ID == 0 || post.User.Username == "" {
			log.Printf("⚠️ [GetDiscoverFeed] Post %d missing user data - UserID: %d, User.ID: %d, User.Username: '%s', User.MainRoomID: %v, PostRoomID: %v",
				post.ID, post.UserID, post.User.ID, post.User.Username, post.User.MainRoomID, post.RoomID)
		}
	}

	// Load viewer settings once — covers both age flags and overlay preference.
	// Zero-value settings (all flags false) is the correct conservative default for
	// unauthenticated users or users who haven't provided a DOB yet.
	var viewerSettings models.UserSettings
	if currentUserID > 0 {
		DB.Where("user_id = ?", currentUserID).First(&viewerSettings)

		// Lazy yearly recompute: if the flags were computed in a previous calendar year
		// (e.g. the user turned 13/16/18 since last year), refresh them from DOB.
		// This is the only path that reads date_of_birth at feed-load time, and it fires
		// at most once per year per user.
		if viewerSettings.AgeFlagsYear != time.Now().Year() {
			var viewerUser models.User
			if err := DB.Select("id, date_of_birth").First(&viewerUser, currentUserID).Error; err == nil {
				saveAgeFlagsForUser(DB, currentUserID, viewerUser.GetAge())
				// Reload so the filter below uses fresh values.
				DB.Where("user_id = ?", currentUserID).First(&viewerSettings)
			}
		}
	}

	// Filter posts by content rating using pre-computed age flags.
	ratingFiltered := make([]models.Post, 0, len(filteredPosts))
	for _, p := range filteredPosts {
		if canViewContentRating(p.ContentRating, viewerSettings) {
			ratingFiltered = append(ratingFiltered, p)
		}
	}
	filteredPosts = ratingFiltered

	// Re-rank using the feed algorithm (scored within this page; batched DB lookups, no N+1).
	filteredPosts = ScoreAndSortPosts(DB, filteredPosts, currentUserID, viewerSettings.PrimaryRating)

	viewerShowMature := viewerSettings.ShowMatureContent

	// Batch-check which posts the current user has purchased (one query for the whole page).
	purchasedIDs := make(map[uint]bool)
	if currentUserID > 0 && len(filteredPosts) > 0 {
		postIDs := make([]uint, 0, len(filteredPosts))
		for _, p := range filteredPosts {
			postIDs = append(postIDs, p.ID)
		}
		var purchases []models.PostPurchase
		DB.Where("user_id = ? AND post_id IN ? AND status = ?", currentUserID, postIDs, "completed").
			Select("post_id").Find(&purchases)
		for _, purchase := range purchases {
			purchasedIDs[purchase.PostID] = true
		}
	}

	responsePosts := make([]PostFeedResponse, len(filteredPosts))
	for i, p := range filteredPosts {
		responsePosts[i] = buildPostResponse(p, currentUserID, purchasedIDs, viewerShowMature)
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  responsePosts,
		"limit":  limit,
		"offset": offset,
	})
}

// GetPost handles GET /api/posts/:id
func GetPost(c *gin.Context) {
	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	var post models.Post
	if err := DB.Preload("User").Preload("Room").First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check if post is public or user is owner
	userID := c.GetUint("user_id")
	if !post.IsPublic && post.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Post is private"})
		return
	}

	// Check purchase for paid posts
	purchasedIDs := make(map[uint]bool)
	if userID > 0 && post.IsPaid && post.UserID != userID {
		var purchase models.PostPurchase
		if err := DB.Where("post_id = ? AND user_id = ? AND status = ?", post.ID, userID, "completed").
			First(&purchase).Error; err == nil {
			purchasedIDs[post.ID] = true
		}
	}

	var viewerSettings models.UserSettings
	if userID > 0 {
		DB.Where("user_id = ?", userID).First(&viewerSettings)
		// Age-flag check: if viewer can't see this rating at all, treat as not found.
		if !canViewContentRating(post.ContentRating, viewerSettings) {
			c.JSON(http.StatusForbidden, gin.H{"error": "Post not available for your age group"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"post": buildPostResponse(post, userID, purchasedIDs, viewerSettings.ShowMatureContent)})
}

// UpdatePost handles PUT /api/posts/:id
func UpdatePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify ownership
	if post.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to update this post"})
		return
	}

	var req UpdatePostRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Update fields
	if req.Description != nil {
		post.Description = *req.Description
	}
	if req.IsPublic != nil {
		post.IsPublic = *req.IsPublic
	}
	if req.IsPaid != nil {
		post.IsPaid = *req.IsPaid
	}
	if req.Price != nil {
		post.Price = req.Price
	}
	if req.AllowDownloads != nil {
		post.AllowDownloads = *req.AllowDownloads
	}
	if req.ContentRating != nil {
		post.ContentRating = *req.ContentRating
	}

	// Validate price requirements
	if post.IsPaid && (post.Price == nil || *post.Price <= 0) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Price is required for paid posts"})
		return
	}

	if err := DB.Save(&post).Error; err != nil {
		log.Printf("❌ [UpdatePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update post"})
		return
	}

	DB.Preload("User").First(&post, post.ID)

	log.Printf("✅ [UpdatePost] Post %d updated by user %d", post.ID, userID)
	c.JSON(http.StatusOK, gin.H{"post": post})
}

// DeletePost handles DELETE /api/posts/:id (soft delete)
func DeletePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Get current user to check for super admin privileges
	var currentUser models.User
	if err := DB.First(&currentUser, userID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to verify user"})
		return
	}

	// Verify ownership OR super admin privileges
	if post.UserID != userID && !currentUser.IsSuperAdmin() {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to delete this post"})
		return
	}

	// Soft delete
	if err := DB.Delete(&post).Error; err != nil {
		log.Printf("❌ [DeletePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete post"})
		return
	}

	// ✅ Delete media from BunnyCDN (async to not block response)
	go func() {
		if post.VideoURL != "" && (strings.HasPrefix(post.VideoURL, "http://") || strings.HasPrefix(post.VideoURL, "https://")) {
			if err := utils.DeleteFromBunnyCDN(post.VideoURL); err != nil {
				log.Printf("⚠️  [DeletePost] Failed to delete video from BunnyCDN: %v", err)
			}
		}
		if post.ThumbnailURL != "" && (strings.HasPrefix(post.ThumbnailURL, "http://") || strings.HasPrefix(post.ThumbnailURL, "https://")) {
			if err := utils.DeleteFromBunnyCDN(post.ThumbnailURL); err != nil {
				log.Printf("⚠️  [DeletePost] Failed to delete thumbnail from BunnyCDN: %v", err)
			}
		}
	}()

	log.Printf("✅ [DeletePost] Post %d deleted by user %d", post.ID, userID)
	c.JSON(http.StatusOK, gin.H{"message": "Post deleted successfully"})
}

// LikePost handles POST /api/posts/:id/like
func LikePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Check if post exists
	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Check if already liked
	var existingLike models.PostLike
	if err := DB.Where("post_id = ? AND user_id = ?", postID, userID).First(&existingLike).Error; err == nil {
		c.JSON(http.StatusOK, gin.H{"message": "Already liked"})
		return
	}

	// Create like
	like := models.PostLike{
		PostID: uint(postID),
		UserID: userID,
	}

	if err := DB.Create(&like).Error; err != nil {
		log.Printf("❌ [LikePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to like post"})
		return
	}

	// Increment likes count
	DB.Model(&post).UpdateColumn("likes_count", gorm.Expr("likes_count + ?", 1))

	// Notify post author
	if post.UserID != userID {
		postAuthorID := post.UserID
		postIDNotif := post.ID
		postDesc := post.Description
		likerID := userID
		go func() {
			var liker models.User
			if err := DB.Select("username").First(&liker, likerID).Error; err == nil {
				desc := postDesc
				if len(desc) > 60 {
					desc = desc[:60] + "…"
				}
				CreateNotification(postAuthorID, "post_like", "@"+liker.Username+" liked your post", desc, "post", postIDNotif)
			}
		}()
	}

	log.Printf("✅ [LikePost] User %d liked post %d", userID, postID)
	c.JSON(http.StatusOK, gin.H{"message": "Post liked successfully"})
}

// UnlikePost handles DELETE /api/posts/:id/unlike
func UnlikePost(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Find and delete like
	var like models.PostLike
	if err := DB.Where("post_id = ? AND user_id = ?", postID, userID).First(&like).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Like not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if err := DB.Delete(&like).Error; err != nil {
		log.Printf("❌ [UnlikePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unlike post"})
		return
	}

	// Decrement likes count
	var post models.Post
	DB.First(&post, postID)
	DB.Model(&post).UpdateColumn("likes_count", gorm.Expr("likes_count - ?", 1))

	log.Printf("✅ [UnlikePost] User %d unliked post %d", userID, postID)
	c.JSON(http.StatusOK, gin.H{"message": "Post unliked successfully"})
}

// TrackPostView handles POST /api/posts/:id/view
func TrackPostView(c *gin.Context) {
	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	userID := c.GetUint("user_id") // May be 0 for anonymous users
	ipAddress := c.ClientIP()

	// Check if post exists
	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Deduplication: One view per user per post per day
	if userID > 0 {
		var existingView models.PostView
		today := time.Now().Truncate(24 * time.Hour)
		if err := DB.Where("post_id = ? AND user_id = ? AND created_at >= ?", postID, userID, today).
			First(&existingView).Error; err == nil {
			// Already viewed today
			c.JSON(http.StatusOK, gin.H{"message": "View already recorded"})
			return
		}
	}

	// Create view record
	view := models.PostView{
		PostID:    uint(postID),
		IPAddress: ipAddress,
	}
	if userID > 0 {
		view.UserID = &userID
	}

	if err := DB.Create(&view).Error; err != nil {
		log.Printf("❌ [TrackPostView] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to track view"})
		return
	}

	// Increment view count
	DB.Model(&post).UpdateColumn("view_count", gorm.Expr("view_count + ?", 1))

	log.Printf("✅ [TrackPostView] View tracked for post %d (user: %d, ip: %s)", postID, userID, ipAddress)
	c.JSON(http.StatusOK, gin.H{"message": "View tracked successfully"})
}

// Helper: Validate content type matches media type
func isValidMediaType(contentType string, mediaType string) bool {
	contentType = strings.ToLower(contentType)
	
	switch mediaType {
	case models.MediaTypeVideo:
		return strings.HasPrefix(contentType, "video/")
	case models.MediaTypeImage:
		return strings.HasPrefix(contentType, "image/")
	case models.MediaTypeGIF:
		return strings.HasPrefix(contentType, "image/gif")
	default:
		return false
	}
}

// ============================================
// COMMENTS ENDPOINTS
// ============================================

// CreateCommentRequest represents the request body for creating a comment
type CreateCommentRequest struct {
	Content         string `json:"content" binding:"required,max=1000"`
	ParentCommentID *uint  `json:"parent_comment_id"`
}

// GetPostComments handles GET /api/posts/:id/comments
func GetPostComments(c *gin.Context) {
	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Verify post exists
	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		log.Printf("❌ [GetPostComments] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Fetch top-level comments with nested replies
	var comments []models.PostComment
	if err := DB.Where("post_id = ? AND parent_comment_id IS NULL", postID).
		Preload("User").
		Preload("Replies", func(db *gorm.DB) *gorm.DB {
			return db.Where("deleted_at IS NULL").Order("created_at ASC")
		}).
		Preload("Replies.User").
		Order("created_at DESC").
		Find(&comments).Error; err != nil {
		log.Printf("❌ [GetPostComments] Failed to fetch comments: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	log.Printf("✅ [GetPostComments] Fetched %d top-level comments for post %d", len(comments), postID)
	c.JSON(http.StatusOK, gin.H{"comments": comments})
}

// CreatePostComment handles POST /api/posts/:id/comments
func CreatePostComment(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	// Verify post exists
	var post models.Post
	if err := DB.First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		log.Printf("❌ [CreatePostComment] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	var req CreateCommentRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// If parent comment specified, verify it exists and belongs to this post
	if req.ParentCommentID != nil {
		var parentComment models.PostComment
		if err := DB.First(&parentComment, *req.ParentCommentID).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment not found"})
			return
		}
		if parentComment.PostID != uint(postID) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Parent comment does not belong to this post"})
			return
		}
	}

	// Create comment
	comment := models.PostComment{
		PostID:          uint(postID),
		UserID:          userID,
		Content:         req.Content,
		ParentCommentID: req.ParentCommentID,
	}

	if err := DB.Create(&comment).Error; err != nil {
		log.Printf("❌ [CreatePostComment] Failed to create comment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create comment"})
		return
	}

	// Increment comments count only for top-level comments
	if req.ParentCommentID == nil {
		DB.Model(&post).UpdateColumn("comments_count", gorm.Expr("comments_count + ?", 1))
	}

	// Notify post author on top-level comment
	if req.ParentCommentID == nil && post.UserID != userID {
		postAuthorID := post.UserID
		commentContent := req.Content
		commenterID := userID
		postIDForNotif := post.ID
		go func() {
			var commenter models.User
			if err := DB.Select("username").First(&commenter, commenterID).Error; err == nil {
				body := commentContent
				if len(body) > 80 {
					body = body[:80] + "…"
				}
				CreateNotification(postAuthorID, "post_comment", "@"+commenter.Username+" commented on your post", body, "post", postIDForNotif)
			}
		}()
	}

	// Notify parent comment author when someone replies
	if req.ParentCommentID != nil {
		var parentComment models.PostComment
		if err := DB.First(&parentComment, *req.ParentCommentID).Error; err == nil && parentComment.UserID != userID {
			body := req.Content
			if len(body) > 80 {
				body = body[:80] + "…"
			}
			go CreateNotification(parentComment.UserID, "reply", "New reply to your comment", body, "post_comment", *req.ParentCommentID)
		}
	}

	// Preload user data for response
	DB.Preload("User").First(&comment, comment.ID)

	log.Printf("✅ [CreatePostComment] Comment created (ID: %d) on post %d by user %d", comment.ID, postID, userID)
	c.JSON(http.StatusCreated, gin.H{"comment": comment})
}

// DeletePostComment handles DELETE /api/posts/comments/:id
func DeletePostComment(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	commentID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	// Find comment
	var comment models.PostComment
	if err := DB.First(&comment, commentID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
			return
		}
		log.Printf("❌ [DeletePostComment] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Verify ownership
	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only delete your own comments"})
		return
	}

	postID := comment.PostID

	// Delete comment
	if err := DB.Delete(&comment).Error; err != nil {
		log.Printf("❌ [DeletePostComment] Failed to delete comment: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete comment"})
		return
	}

	// Decrement comments count
	DB.Model(&models.Post{}).Where("id = ?", postID).UpdateColumn("comments_count", gorm.Expr("GREATEST(comments_count - 1, 0)"))

	log.Printf("✅ [DeletePostComment] Comment %d deleted by user %d", commentID, userID)
	c.JSON(http.StatusOK, gin.H{"message": "Comment deleted successfully"})
}

// UpdatePostComment handles PUT /api/posts/:id/comments/:commentId
func UpdatePostComment(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	commentID, err := strconv.ParseUint(c.Param("commentId"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid comment ID"})
		return
	}

	var comment models.PostComment
	if err := DB.First(&comment, commentID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Comment not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if comment.PostID != uint(postID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Comment does not belong to this post"})
		return
	}

	if comment.UserID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "You can only edit your own comments"})
		return
	}

	var req struct {
		Content string `json:"content" binding:"required,max=1000"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	comment.Content = req.Content
	if err := DB.Save(&comment).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update comment"})
		return
	}

	DB.Preload("User").First(&comment, comment.ID)
	c.JSON(http.StatusOK, gin.H{"comment": comment})
}

// ============================================
// USER & ROOM POSTS ENDPOINTS
// ============================================

// GetUserPosts handles GET /api/users/:id/posts
func GetUserPosts(c *gin.Context) {
	userID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid user ID"})
		return
	}

	// Verify user exists
	var user models.User
	if err := DB.First(&user, userID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
			return
		}
		log.Printf("❌ [GetUserPosts] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 12
	}
	offset := (page - 1) * limit

	// Optional filter by media type
	mediaType := c.Query("media_type") // 'video', 'image', 'gif'

	// Build query
	query := DB.Where("user_id = ?", userID)
	
	// Only show public posts unless viewing own profile
	currentUserID := c.GetUint("user_id")
	if currentUserID != uint(userID) {
		query = query.Where("is_public = ?", true)
	}

	// Apply media type filter if provided
	if mediaType != "" && (mediaType == models.MediaTypeVideo || mediaType == models.MediaTypeImage || mediaType == models.MediaTypeGIF) {
		query = query.Where("media_type = ?", mediaType)
	}

	var posts []models.Post
	if err := query.
		Preload("User").
		Preload("Room").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error; err != nil {
		log.Printf("❌ [GetUserPosts] Failed to fetch posts: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}

	log.Printf("✅ [GetUserPosts] Fetched %d posts for user %d (page %d)", len(posts), userID, page)
	c.JSON(http.StatusOK, gin.H{"posts": posts})
}

// GetRoomPosts handles GET /api/rooms/:id/posts
func GetRoomPosts(c *gin.Context) {
	roomID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid room ID"})
		return
	}

	// Verify room exists
	var room models.Room
	if err := DB.First(&room, roomID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		log.Printf("❌ [GetRoomPosts] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Pagination
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "12"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 12
	}
	offset := (page - 1) * limit

	// Optional filter by media type
	mediaType := c.Query("media_type") // 'video', 'image', 'gif'

	// ✅ NEW LOGIC: Fetch posts where author (user_id) is the room's host
	// This supports "Room = Following" model where host posts appear in ALL their rooms
	query := DB.Where("user_id = ? AND is_public = ?", room.HostID, true)
	
	log.Printf("📡 [GetRoomPosts] Fetching posts for room %d (host_id: %d)", roomID, room.HostID)

	// Apply media type filter if provided
	if mediaType != "" && (mediaType == models.MediaTypeVideo || mediaType == models.MediaTypeImage || mediaType == models.MediaTypeGIF) {
		query = query.Where("media_type = ?", mediaType)
	}

	var posts []models.Post
	if err := query.
		Preload("User").
		Preload("Room").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error; err != nil {
		log.Printf("❌ [GetRoomPosts] Failed to fetch posts: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}

	log.Printf("✅ [GetRoomPosts] Fetched %d posts for room %d (page %d)", len(posts), roomID, page)
	c.JSON(http.StatusOK, gin.H{"posts": posts})
}

// ✅ broadcastRoomPostNotification sends WebSocket notification to all room members (batched)
// broadcastRoomPostNotificationToAllHostRooms efficiently broadcasts post notification to all rooms where user is the host
// Uses Hub.BroadcastToRoom which automatically distributes to all connected clients in each room
func broadcastRoomPostNotificationToAllHostRooms(post models.Post, authorID uint) {
	// Get author info
	var author models.User
	if err := DB.First(&author, authorID).Error; err != nil {
		log.Printf("❌ [BroadcastRoomPost] Failed to fetch author: %v", err)
		return
	}
	
	// Query all rooms where user is the host
	var hostRooms []models.Room
	if err := DB.Where("host_id = ?", authorID).Find(&hostRooms).Error; err != nil {
		log.Printf("❌ [BroadcastRoomPost] Failed to fetch host rooms: %v", err)
		return
	}
	
	if len(hostRooms) == 0 {
		log.Printf("ℹ️ [BroadcastRoomPost] No rooms found for host %d (%s)", authorID, author.Username)
		return
	}
	
	log.Printf("🎬 [BroadcastRoomPost] Post %d by %s - broadcasting to %d host rooms", post.ID, author.Username, len(hostRooms))
	
	// Get WebSocket hub
	hub := GetWebSocketManager()
	if hub == nil {
		log.Printf("⚠️ [BroadcastRoomPost] WebSocket hub not available")
		return
	}
	
	// Broadcast to each room and persist notifications for members
	for _, room := range hostRooms {
		// Build notification message (matches frontend expectations)
		notification := map[string]interface{}{
			"type":    "room_post_created",
			"room_id": room.ID,
			"data": map[string]interface{}{
				"post_id": post.ID,
				"author": map[string]interface{}{
					"id":       authorID,
					"username": author.Username,
				},
				"thumbnail":  post.ThumbnailURL,
				"media_type": post.MediaType,
			},
			"timestamp": time.Now().Unix(),
		}

		notificationJSON, err := json.Marshal(notification)
		if err != nil {
			log.Printf("❌ [BroadcastRoomPost] Failed to marshal notification for room %d: %v", room.ID, err)
			continue
		}

		// Broadcast to room - Hub handles distribution to all connected clients
		hub.BroadcastToRoom(room.ID, OutgoingMessage{
			Data:     notificationJSON,
			IsBinary: false,
		}, nil)

		// Persist a notification for each room member (so they see it on next login)
		var userRooms []models.UserRoom
		if err := DB.Where("room_id = ?", room.ID).Find(&userRooms).Error; err == nil {
			descPreview := post.Description
			if len(descPreview) > 60 {
				descPreview = descPreview[:60] + "…"
			}
			for _, ur := range userRooms {
				if ur.UserID != authorID { // skip the host
					go CreateNotification(
						ur.UserID,
						"room_post",
						author.Username+" posted in "+room.Name,
						descPreview,
						"post",
						post.ID,
					)
				}
			}
		}

		log.Printf("✅ [BroadcastRoomPost] Sent notification to room %d (%s)", room.ID, room.Name)
	}

	log.Printf("🎉 [BroadcastRoomPost] Post %d notification broadcast complete - reached %d rooms", post.ID, len(hostRooms))
}

// TipPost handles POST /api/posts/:id/tip
// 1 tip = 100 cents from tipper wallet → 95 to creator, 5 to platform_accounting
func TipPost(c *gin.Context) {
	tipperID := c.GetUint("user_id")
	if tipperID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	postID, err := strconv.ParseUint(c.Param("id"), 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid post ID"})
		return
	}

	var post models.Post
	if err := DB.Select("id, user_id").First(&post, postID).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusNotFound, gin.H{"error": "Post not found"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	if post.UserID == tipperID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Cannot tip your own post"})
		return
	}

	const tipCents = 100
	const creatorCents = 95
	const platformCents = 5

	tx := DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Check and deduct from tipper wallet
	var tipperWallet models.UserWallet
	if err := tx.Where("user_id = ?", tipperID).First(&tipperWallet).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"message": "ok"}) // silently fail — no wallet
		return
	}
	if tipperWallet.TokenBalance < tipCents {
		tx.Rollback()
		c.JSON(http.StatusOK, gin.H{"message": "ok"}) // silently fail — insufficient balance
		return
	}

	tipperWallet.TokenBalance -= tipCents
	if err := tx.Save(&tipperWallet).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to deduct balance"})
		return
	}

	// Credit creator wallet
	var creatorWallet models.UserWallet
	if err := tx.Where("user_id = ?", post.UserID).First(&creatorWallet).Error; err != nil {
		creatorWallet = models.UserWallet{
			UserID:         post.UserID,
			TokenBalance:   creatorCents,
			LifetimeEarned: creatorCents,
		}
		if err := tx.Create(&creatorWallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit creator"})
			return
		}
	} else {
		creatorWallet.TokenBalance += creatorCents
		creatorWallet.LifetimeEarned += creatorCents
		if err := tx.Save(&creatorWallet).Error; err != nil {
			tx.Rollback()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to credit creator"})
			return
		}
	}

	// Record tip audit row
	if err := tx.Exec(`INSERT INTO post_tips (tipper_id, post_id, amount_cents) VALUES (?, ?, ?)`,
		tipperID, postID, tipCents).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to record tip"})
		return
	}

	// Increment post tip_count
	if err := tx.Model(&models.Post{}).Where("id = ?", postID).
		UpdateColumn("tip_count", gorm.Expr("tip_count + 1")).Error; err != nil {
		tx.Rollback()
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update tip count"})
		return
	}

	// Accumulate platform cut in platform_accounting
	accounting, err := models.GetPlatformAccounting(tx)
	if err == nil {
		accounting.TokenDonationCommission += float64(platformCents) * 122.0 / 100.0
		accounting.LifetimeTokenDonationCommission += float64(platformCents) * 122.0 / 100.0
		tx.Save(accounting)
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("❌ [TipPost] Commit error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to complete tip"})
		return
	}

	log.Printf("🪙 [TipPost] User %d tipped post %d (%d cents, creator %d gets %d)", tipperID, postID, tipCents, post.UserID, creatorCents)
	c.JSON(http.StatusOK, gin.H{"message": "Tip sent", "tip_count_increment": 1})
}

// GetFollowingFeedHandler handles GET /api/posts/following
// Returns public posts from:
//   1. Users the current user directly follows (user_follows table)
//   2. Hosts of rooms the current user is an active member of (room membership)
// Results are deduplicated and returned in reverse-chronological order.
func GetFollowingFeedHandler(c *gin.Context) {
	currentUserID := c.MustGet("user_id").(uint)

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	// Source 1: users I directly follow
	var follows []models.UserFollow
	DB.Where("follower_id = ?", currentUserID).Find(&follows)

	authorIDSet := make(map[uint]struct{})
	for _, f := range follows {
		authorIDSet[f.FollowingID] = struct{}{}
	}

	// Source 2: hosts of active rooms I'm a member of
	var userRooms []models.UserRoom
	DB.Where("user_id = ? AND status = ?", currentUserID, "active").Find(&userRooms)
	if len(userRooms) > 0 {
		roomIDs := make([]uint, len(userRooms))
		for i, ur := range userRooms {
			roomIDs[i] = ur.RoomID
		}
		var rooms []models.Room
		DB.Select("id, host_id").Where("id IN ?", roomIDs).Find(&rooms)
		for _, r := range rooms {
			authorIDSet[r.HostID] = struct{}{}
		}
	}

	// Remove self from authors
	delete(authorIDSet, currentUserID)

	if len(authorIDSet) == 0 {
		c.JSON(http.StatusOK, gin.H{"posts": []interface{}{}, "total": 0, "page": page})
		return
	}

	authorIDs := make([]uint, 0, len(authorIDSet))
	for id := range authorIDSet {
		authorIDs = append(authorIDs, id)
	}

	var total int64
	DB.Model(&models.Post{}).
		Where("user_id IN ? AND is_public = ?", authorIDs, true).
		Count(&total)

	var posts []models.Post
	if err := DB.Where("user_id IN ? AND is_public = ?", authorIDs, true).
		Preload("User").
		Preload("Room").
		Order("created_at DESC").
		Limit(limit).
		Offset(offset).
		Find(&posts).Error; err != nil {
		log.Printf("❌ [GetFollowingFeed] DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch feed"})
		return
	}

	// Fetch viewer's purchased post IDs for access computation
	var purchases []models.PostPurchase
	DB.Where("buyer_id = ?", currentUserID).Find(&purchases)
	purchasedIDs := make(map[uint]bool, len(purchases))
	for _, p := range purchases {
		purchasedIDs[p.PostID] = true
	}

	// Fetch viewer content-rating settings
	var settings models.UserSettings
	DB.Where("user_id = ?", currentUserID).First(&settings)

	resp := make([]PostFeedResponse, 0, len(posts))
	for _, p := range posts {
		resp = append(resp, buildPostResponse(p, currentUserID, purchasedIDs, settings.ShowMatureContent))
	}

	log.Printf("✅ [GetFollowingFeed] user=%d page=%d posts=%d (authors=%d)", currentUserID, page, len(resp), len(authorIDs))
	c.JSON(http.StatusOK, gin.H{"posts": resp, "total": total, "page": page})
}
