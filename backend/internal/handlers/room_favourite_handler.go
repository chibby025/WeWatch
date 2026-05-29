package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

// ToggleRoomFavouriteHandler handles POST /api/rooms/:id/favourite
// Adds the room to the user's favourites if not already there; removes it if it is.
// Returns { is_favourite: bool }.
func ToggleRoomFavouriteHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	roomID, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid room id"})
		return
	}

	var existing models.UserRoomFavourite
	err = DB.Where("user_id = ? AND room_id = ?", userID, roomID).First(&existing).Error
	if err == nil {
		// Already favourited — remove it
		DB.Delete(&existing)
		c.JSON(http.StatusOK, gin.H{"is_favourite": false})
		return
	}
	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database error"})
		return
	}

	// Not yet favourited — add it
	fav := models.UserRoomFavourite{UserID: userID, RoomID: uint(roomID)}
	if err := DB.Create(&fav).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not favourite room"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"is_favourite": true})
}

// GetFavouriteRoomsHandler handles GET /api/rooms/favourites
// Returns the list of rooms the current user has starred.
func GetFavouriteRoomsHandler(c *gin.Context) {
	userID := c.MustGet("user_id").(uint)

	var favs []models.UserRoomFavourite
	if err := DB.Where("user_id = ?", userID).Preload("Room").Find(&favs).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch favourites"})
		return
	}

	type RoomItem struct {
		RoomID   uint   `json:"room_id"`
		Name     string `json:"name"`
		ImageURL string `json:"image_url"`
		RoomType string `json:"room_type"`
		IsPublic bool   `json:"is_public"`
	}
	out := make([]RoomItem, 0, len(favs))
	for _, f := range favs {
		if f.Room == nil {
			continue
		}
		out = append(out, RoomItem{
			RoomID:   f.Room.ID,
			Name:     f.Room.Name,
			ImageURL: f.Room.ImageURL,
			RoomType: f.Room.RoomType,
			IsPublic: f.Room.IsPublic,
		})
	}
	c.JSON(http.StatusOK, gin.H{"rooms": out})
}
