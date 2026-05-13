
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
		Preload("User"). // This loads the user including main_room_id
		Preload("Room"). // ✅ Preload room association for recordings
		Order("posts.created_at DESC"). // Newest first (chronological feed)
		Limit(limit).
		Offset(offset)
	
	// 🔍 Search filter (title, description, or username)
	if searchQuery != "" {
		searchPattern := "%" + searchQuery + "%"
		query = query.Joins("LEFT JOIN users ON posts.user_id = users.id").
			Where("posts.title ILIKE ? OR posts.description ILIKE ? OR users.username ILIKE ?",
				searchPattern, searchPattern, searchPattern)
		log.Printf("🔍 [GetDiscoverFeed] Searching for: '%s'", searchQuery)
	}
	
	log.Printf("📊 [GetDiscoverFeed] Fetching posts - limit: %d, offset: %d, search: '%s'", limit, offset, searchQuery)

	if err := query.Find(&posts).Error; err != nil {
		log.Printf("❌ [GetDiscoverFeed] Database error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch posts"})
		return
	}

	// ✅ Filter posts based on user privacy settings
	var filteredPosts []models.Post
	for _, post := range posts {
		// Get post author's privacy settings
		var authorSettings models.UserSettings
		err := DB.Where("user_id = ?", post.UserID).First(&authorSettings).Error
		
		// If no settings found, default to "public" (allow post)
		if err == nil {
			switch authorSettings.WhoCanSeePosts {
			case "only_me":
				// Only show to post author
				if post.UserID != currentUserID {
					continue // Skip this post
				}
			case "friends":
				// Only show to friends
				if post.UserID != currentUserID {
					// Check if current user is friends with post author
					var friendship models.Friendship
					err := DB.Where(
						"((requester_id = ? AND recipient_id = ?) OR (requester_id = ? AND recipient_id = ?)) AND status = ?",
						currentUserID, post.UserID, post.UserID, currentUserID, "accepted",
					).First(&friendship).Error
					
					if err != nil {
						continue // Not friends, skip this post
					}
				}
			// "public" - show to everyone (no filtering)
			}
		}
		
		// Post passed privacy check
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

	c.JSON(http.StatusOK, gin.H{
		"posts":  filteredPosts,
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
		Preload("User"). // Make sure user data includes main_room_id
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
		Preload("User"). // Ensure user data includes main_room_id
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
