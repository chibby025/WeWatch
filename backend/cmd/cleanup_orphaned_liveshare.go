// backend/cmd/cleanup_orphaned_liveshare.go
// CLEANUP SCRIPT: Deletes orphaned LiveShare media from ended sessions
// Run with: cd backend && go run cmd/cleanup_orphaned_liveshare.go

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type LiveShareMediaQueueItem struct {
	ID        uint   `gorm:"primaryKey"`
	SessionID uint   `gorm:"not null"`
	MediaURL  string `gorm:"not null"`
	FileName  string
}

func (LiveShareMediaQueueItem) TableName() string {
	return "liveshare_media_queue"
}

func main() {
	log.Println("🧹 ===== ORPHANED LIVESHARE MEDIA CLEANUP =====")
	log.Println("⚠️  This will DELETE all LiveShare media from ENDED watch sessions")
	
	// Connect to database
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=Chibby dbname=wewatch_db port=5432 sslmode=disable"
		log.Println("⚠️  DATABASE_URL not set, using default localhost connection")
	}
	
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	log.Println("✅ Connected to database")

	// Find all media items belonging to ENDED sessions
	var orphanedMedia []LiveShareMediaQueueItem
	
	query := db.Table("liveshare_media_queue").
		Select("liveshare_media_queue.*").
		Joins("INNER JOIN watch_sessions ON watch_sessions.id = liveshare_media_queue.session_id").
		Where("watch_sessions.ended_at IS NOT NULL").
		Find(&orphanedMedia)
	
	if query.Error != nil {
		log.Fatalf("❌ Failed to query orphaned media: %v", query.Error)
	}

	totalCount := len(orphanedMedia)
	log.Printf("🔍 Found %d orphaned LiveShare media items from ended sessions", totalCount)

	if totalCount == 0 {
		log.Println("✨ No orphaned media found! System is already clean.")
		return
	}

	// Calculate total size
	var totalSize int64
	for _, item := range orphanedMedia {
		filePath := filepath.Join(".", item.MediaURL)
		if info, err := os.Stat(filePath); err == nil {
			totalSize += info.Size()
		}
	}
	log.Printf("💾 Total size: %.2f MB", float64(totalSize)/(1024*1024))

	// Show preview of what will be deleted
	log.Println("\n📋 Preview of items to be deleted:")
	for i, item := range orphanedMedia {
		if i >= 10 {
			log.Printf("   ... and %d more items", totalCount-10)
			break
		}
		log.Printf("   %d. %s (Session ID: %d)", i+1, item.FileName, item.SessionID)
	}

	// Confirmation prompt
	fmt.Print("\n⚠️  Proceed with deletion? Type 'YES' to confirm: ")
	var confirmation string
	fmt.Scanln(&confirmation)
	
	if confirmation != "YES" {
		log.Println("❌ Cleanup cancelled by user")
		return
	}

	log.Println("\n🗑️  Starting cleanup...")
	
	successCount := 0
	fileDeleteErrors := 0
	dbDeleteErrors := 0
	freedSpace := int64(0)

	for i, item := range orphanedMedia {
		log.Printf("🗑️  [%d/%d] Processing: %s", i+1, totalCount, item.FileName)
		
		// Delete file from disk
		filePath := filepath.Join(".", item.MediaURL) // MediaURL is like "/uploads/liveshare/file.png"
		if info, err := os.Stat(filePath); err == nil {
			fileSize := info.Size()
			if err := os.Remove(filePath); err != nil {
				log.Printf("   ❌ Failed to delete file: %v", err)
				fileDeleteErrors++
			} else {
				log.Printf("   ✅ Deleted file: %s (%.2f KB)", filePath, float64(fileSize)/1024)
				freedSpace += fileSize
			}
		} else if os.IsNotExist(err) {
			log.Printf("   ⚠️  File already deleted: %s", filePath)
		} else {
			log.Printf("   ⚠️  Error checking file: %v", err)
			fileDeleteErrors++
		}
		
		// Delete database record
		if err := db.Delete(&LiveShareMediaQueueItem{}, item.ID).Error; err != nil {
			log.Printf("   ❌ Failed to delete DB record: %v", err)
			dbDeleteErrors++
		} else {
			log.Printf("   ✅ Deleted DB record: ID=%d", item.ID)
			successCount++
		}
	}

	log.Println("\n==================================================")
	log.Printf("✅ Cleanup complete!")
	log.Printf("📊 Successfully cleaned: %d items", successCount)
	log.Printf("💾 Space freed: %.2f MB", float64(freedSpace)/(1024*1024))
	if fileDeleteErrors > 0 {
		log.Printf("⚠️  File deletion errors: %d", fileDeleteErrors)
	}
	if dbDeleteErrors > 0 {
		log.Printf("⚠️  Database deletion errors: %d", dbDeleteErrors)
	}
}
