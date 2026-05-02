// backend/internal/handlers/posts.go
package handlers

import (
	"encoding/json"
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

// CreatePostRequest represents the request body for creating a post
type CreatePostRequest struct {
	Title         string   `json:"title" binding:"required,max=255"`
	Description   string   `json:"description"`
	RoomID        *uint    `json:"room_id"`
	MediaType     string   `json:"media_type" binding:"required,oneof=video image gif"`
	PostType      string   `json:"post_type" binding:"required,oneof=recording upload"`
	Duration      *int     `json:"duration"`
	Resolution    string   `json:"resolution"`
	IsPaid        bool     `json:"is_paid"`
	Price         *float64 `json:"price"`
	IsPublic      bool     `json:"is_public"`
}

// UpdatePostRequest represents the request body for updating a post
type UpdatePostRequest struct {
	Title       *string `json:"title" binding:"omitempty,max=255"`
	Description *string `json:"description"`
	IsPublic    *bool   `json:"is_public"`
	IsPaid      *bool   `json:"is_paid"`
	Price       *float64 `json:"price"`
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

	// Validate price requirements
	if req.IsPaid {
		if req.Price == nil || *req.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Price is required for paid posts"})
			return
		}
	}

	// ✅ If posting to a room, verify user is the room host
	if req.RoomID != nil {
		var room models.Room
		if err := DB.First(&room, *req.RoomID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Room not found"})
			return
		}
		
		if room.HostID != userID {
			log.Printf("⛔ [CreatePost] User %d attempted to post to room %d (not host)", userID, *req.RoomID)
			c.JSON(http.StatusForbidden, gin.H{"error": "Only room hosts can post to room feeds"})
			return
		}
	}

	// Create post
	post := models.Post{
		UserID:      userID,
		RoomID:      req.RoomID,
		Title:       req.Title,
		Description: req.Description,
		MediaType:   req.MediaType,
		PostType:    req.PostType,
		Duration:    req.Duration,
		Resolution:  req.Resolution,
		IsPaid:      req.IsPaid,
		Price:       req.Price,
		IsPublic:    req.IsPublic,
	}

	if err := DB.Create(&post).Error; err != nil {
		log.Printf("❌ [CreatePost] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create post"})
		return
	}

	// Load user association
	DB.Preload("User").First(&post, post.ID)

	// ✅ If posted to room, broadcast notification to all room members
	if req.RoomID != nil {
		go broadcastRoomPostNotification(post, *req.RoomID, userID)
	}

	log.Printf("✅ [CreatePost] Post %d created by user %d (room_id: %v)", post.ID, userID, req.RoomID)
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
	
	if limit > 100 {
		limit = 100 // Max 100 posts per request
	}

	var posts []models.Post
	query := DB.Where("is_public = ? AND deleted_at IS NULL", true).
		Preload("User").
		Order("RANDOM()"). // Randomized feed
		Limit(limit).
		Offset(offset)

	if err := query.Find(&posts).Error; err != nil {
		log.Printf("❌ [GetDiscoverFeed] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"posts":  posts,
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

	c.JSON(http.StatusOK, gin.H{"post": post})
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
	if req.Title != nil {
		post.Title = *req.Title
	}
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

	// Optionally: Delete from BunnyCDN (async job recommended)
	// go utils.DeleteFromBunnyCDN(post.VideoURL)

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

	// Fetch comments with user data, ordered by newest first
	var comments []models.PostComment
	if err := DB.Where("post_id = ?", postID).
		Preload("User").
		Order("created_at DESC").
		Find(&comments).Error; err != nil {
		log.Printf("❌ [GetPostComments] Failed to fetch comments: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch comments"})
		return
	}

	log.Printf("✅ [GetPostComments] Fetched %d comments for post %d", len(comments), postID)
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

	// Increment comments count
	DB.Model(&post).UpdateColumn("comments_count", gorm.Expr("comments_count + ?", 1))

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

	// Build query - only public posts for room context
	query := DB.Where("room_id = ? AND is_public = ?", roomID, true)

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
func broadcastRoomPostNotification(post models.Post, roomID uint, authorID uint) {
	// Get all room members
	var members []models.UserRoom
	if err := DB.Where("room_id = ?", roomID).Find(&members).Error; err != nil {
		log.Printf("❌ [BroadcastRoomPost] Failed to fetch room members: %v", err)
		return
	}
	
	if len(members) == 0 {
		return
	}
	
	// Get author info
	var author models.User
	if err := DB.First(&author, authorID).Error; err != nil {
		log.Printf("❌ [BroadcastRoomPost] Failed to fetch author: %v", err)
		return
	}
	
	// Build notification message
	notification := map[string]interface{}{
		"type":      "room_post_created",
		"room_id":   roomID,
		"post_id":   post.ID,
		"author_id": authorID,
		"author_username": author.Username,
		"title":     post.Title,
		"thumbnail": post.ThumbnailURL,
		"media_type": post.MediaType,
		"timestamp": time.Now().Unix(),
	}
	
	notificationJSON, err := json.Marshal(notification)
	if err != nil {
		log.Printf("❌ [BroadcastRoomPost] Failed to marshal notification: %v", err)
		return
	}
	
	// Get WebSocket hub
	hub := GetWebSocketManager()
	if hub == nil {
		log.Printf("⚠️ [BroadcastRoomPost] WebSocket hub not available")
		return
	}
	
	// Batch broadcast in chunks of 1000 users
	batchSize := 1000
	memberIDs := make([]uint, len(members))
	for i, member := range members {
		memberIDs[i] = member.UserID
	}
	
	for i := 0; i < len(memberIDs); i += batchSize {
		end := i + batchSize
		if end > len(memberIDs) {
			end = len(memberIDs)
		}
		batch := memberIDs[i:end]
		
		// Broadcast to this batch
		hub.BroadcastToUsers(batch, OutgoingMessage{
			Data:     notificationJSON,
			IsBinary: false,
		})
		
		log.Printf("✅ [BroadcastRoomPost] Sent notification to batch of %d users (batch %d/%d)", 
			len(batch), (i/batchSize)+1, (len(memberIDs)+batchSize-1)/batchSize)
	}
	
	log.Printf("✅ [BroadcastRoomPost] Post %d notification sent to %d room members", post.ID, len(memberIDs))
}
