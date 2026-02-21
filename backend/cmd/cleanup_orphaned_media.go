// backend/cmd/cleanup_orphaned_media.go
// ONE-TIME CLEANUP SCRIPT: Deletes all temporary media from ended sessions
// Run with: go run cmd/cleanup_orphaned_media.go

package main

import (
	"fmt"
	"log"
	"os"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

func main() {
	log.Println("🧹 ===== ORPHANED MEDIA CLEANUP SCRIPT =====")
	log.Println("⚠️  This will DELETE all temporary media from ENDED watch sessions")
	
	// Connect to database
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=your_password dbname=wewatch_db port=5432 sslmode=disable"
		log.Println("⚠️  DATABASE_URL not set, using default localhost connection")
	}
	
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}
	log.Println("✅ Connected to database")

	// Find all temporary media items belonging to ENDED sessions
	var orphanedMedia []models.TemporaryMediaItem
	
	query := db.
		Joins("JOIN watch_sessions ON watch_sessions.session_id = temporary_media_items.session_id").
		Where("watch_sessions.ended_at IS NOT NULL").
		Find(&orphanedMedia)
	
	if query.Error != nil {
		log.Fatalf("❌ Failed to query orphaned media: %v", query.Error)
	}

	totalCount := len(orphanedMedia)
	log.Printf("🔍 Found %d orphaned media items from ended sessions", totalCount)

	if totalCount == 0 {
		log.Println("✨ No orphaned media found! System is already clean.")
		return
	}

	// Show preview of what will be deleted
	log.Println("\n📋 Preview of items to be deleted:")
	for i, item := range orphanedMedia {
		if i >= 10 {
			log.Printf("   ... and %d more items", totalCount-10)
			break
		}
		log.Printf("   %d. %s (Session: %s, Size: %d bytes)", 
			i+1, item.FileName, item.SessionID, item.FileSize)
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
	totalSize := int64(0)

	for i, item := range orphanedMedia {
		log.Printf("🗑️  [%d/%d] Processing: %s", i+1, totalCount, item.FileName)
		
		// Delete file from disk
		if err := os.Remove(item.FilePath); err != nil {
			if os.IsNotExist(err) {
				log.Printf("   ⚠️  File already deleted: %s", item.FilePath)
			} else {
				log.Printf("   ❌ Failed to delete file: %v", err)
				fileDeleteErrors++
				continue
			}
		} else {
			log.Printf("   ✅ Deleted file: %s", item.FilePath)
		}
		
		// Delete thumbnail if exists
		thumbnailPath := item.FilePath + ".jpg"
		if err := os.Remove(thumbnailPath); err == nil {
			log.Printf("   ✅ Deleted thumbnail: %s", thumbnailPath)
		}
		
		// Delete database record
		if err := db.Delete(&item).Error; err != nil {
			log.Printf("   ❌ Failed to delete DB record: %v", err)
			dbDeleteErrors++
		} else {
			log.Printf("   ✅ Deleted DB record (ID: %d)", item.ID)
			successCount++
			totalSize += item.FileSize
		}
	}

	// Summary
	log.Println("\n" + strings.Repeat("=", 60))
	log.Println("📊 CLEANUP SUMMARY")
	log.Println(strings.Repeat("=", 60))
	log.Printf("✅ Successfully deleted: %d items", successCount)
	log.Printf("💾 Disk space freed: %.2f MB", float64(totalSize)/(1024*1024))
	log.Printf("⚠️  File deletion errors: %d", fileDeleteErrors)
	log.Printf("⚠️  DB deletion errors: %d", dbDeleteErrors)
	log.Println(strings.Repeat("=", 60))
	
	if successCount == totalCount {
		log.Println("✨ Cleanup completed successfully! System is now clean.")
	} else {
		log.Println("⚠️  Cleanup completed with some errors. Check logs above.")
	}
}
