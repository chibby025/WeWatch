// backend/cmd/delete_all_room_media.go
// CLEANUP SCRIPT: Deletes ALL permanent room media items and their files
// Run with: go run cmd/delete_all_room_media.go

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

func main() {
	log.Println("🧹 ===== ROOM MEDIA CLEANUP SCRIPT =====")
	log.Println("⚠️  This will DELETE ALL permanent media items from ALL rooms")
	log.Println("⚠️  This does NOT affect temporary session media")
	
	// Connect to database using same method as main server
	dsn := fmt.Sprintf("host=%s user=%s password=%s dbname=%s port=%s sslmode=disable",
		os.Getenv("DB_HOST"), os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"),
		os.Getenv("DB_NAME"), os.Getenv("DB_PORT"))
	
	if os.Getenv("DB_HOST") == "" {
		log.Println("⚠️  Environment variables not set, using defaults")
		dsn = "host=localhost user=postgres password=1234 dbname=wewatch_db port=5432 sslmode=disable"
	}
	
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	log.Println("✅ Connected to database")

	// Find ALL media items (permanent room media)
	var allMedia []models.MediaItem
	
	result := db.Find(&allMedia)
	if result.Error != nil {
		log.Fatalf("❌ Failed to query media items: %v", result.Error)
	}

	totalCount := len(allMedia)
	log.Printf("🔍 Found %d permanent media items across all rooms", totalCount)

	if totalCount == 0 {
		log.Println("✨ No media items found! System is already clean.")
		return
	}

	// Calculate total size
	var totalSize int64
	for _, item := range allMedia {
		totalSize += item.FileSize
	}
	totalSizeMB := float64(totalSize) / (1024 * 1024)

	// Show preview of what will be deleted
	log.Println("\n📋 Preview of items to be deleted:")
	log.Printf("📊 Total Size: %.2f MB", totalSizeMB)
	
	// Group by room
	roomCounts := make(map[uint]int)
	for _, item := range allMedia {
		roomCounts[item.RoomID]++
	}
	
	log.Printf("📊 Media items per room:")
	for roomID, count := range roomCounts {
		log.Printf("   Room %d: %d items", roomID, count)
	}
	
	log.Println("\n🎬 Sample items:")
	for i, item := range allMedia {
		if i >= 10 {
			log.Printf("   ... and %d more items", totalCount-10)
			break
		}
		sizeMB := float64(item.FileSize) / (1024 * 1024)
		log.Printf("   %d. %s (Room: %d, Size: %.2f MB)", 
			i+1, item.FileName, item.RoomID, sizeMB)
	}

	// Confirmation prompt
	fmt.Printf("\n⚠️  This will delete %d media items (%.2f MB total)\n", totalCount, totalSizeMB)
	fmt.Print("⚠️  Type 'DELETE ALL' to confirm: ")
	var confirmation string
	fmt.Scanln(&confirmation)
	
	if confirmation != "DELETE" {
		log.Println("❌ Cleanup cancelled by user")
		return
	}

	log.Println("\n🗑️  Starting cleanup...")
	
	successCount := 0
	fileDeleteErrors := 0
	dbDeleteErrors := 0
	freedSpace := int64(0)

	for i, item := range allMedia {
		log.Printf("🗑️  [%d/%d] Processing: %s (Room %d)", i+1, totalCount, item.FileName, item.RoomID)
		
		// Delete main file from disk
		if item.FilePath != "" {
			if err := os.Remove(item.FilePath); err != nil {
				if os.IsNotExist(err) {
					log.Printf("   ⚠️  File already deleted: %s", item.FilePath)
				} else {
					log.Printf("   ❌ Failed to delete file: %v", err)
					fileDeleteErrors++
				}
			} else {
				log.Printf("   ✅ Deleted file: %s", item.FilePath)
				freedSpace += item.FileSize
			}
		}
		
		// Delete poster if exists
		if item.PosterURL != "" {
			// Convert URL to file path
			posterPath := filepath.Join(".", item.PosterURL)
			if err := os.Remove(posterPath); err != nil {
				if !os.IsNotExist(err) {
					log.Printf("   ⚠️  Failed to delete poster: %v", err)
				}
			} else {
				log.Printf("   ✅ Deleted poster: %s", posterPath)
			}
		}
		
		// Delete preview GIF if exists
		if item.PreviewURL != "" {
			previewPath := filepath.Join(".", item.PreviewURL)
			if err := os.Remove(previewPath); err != nil {
				if !os.IsNotExist(err) {
					log.Printf("   ⚠️  Failed to delete preview: %v", err)
				}
			} else {
				log.Printf("   ✅ Deleted preview: %s", previewPath)
			}
		}
		
		// Delete database record
		if err := db.Delete(&item).Error; err != nil {
			log.Printf("   ❌ Failed to delete DB record: %v", err)
			dbDeleteErrors++
		} else {
			log.Printf("   ✅ Deleted from database")
			successCount++
		}
	}

	freedSpaceMB := float64(freedSpace) / (1024 * 1024)
	
	log.Println("\n✨ ===== CLEANUP COMPLETE =====")
	log.Printf("✅ Successfully deleted: %d/%d items", successCount, totalCount)
	log.Printf("💾 Freed disk space: %.2f MB", freedSpaceMB)
	
	if fileDeleteErrors > 0 {
		log.Printf("⚠️  File deletion errors: %d", fileDeleteErrors)
	}
	if dbDeleteErrors > 0 {
		log.Printf("⚠️  Database deletion errors: %d", dbDeleteErrors)
	}
	
	if successCount == totalCount {
		log.Println("🎉 All media items deleted successfully!")
	}
}
