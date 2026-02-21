// backend/cmd/check_orphaned_roomtv.go
// Checks for orphaned RoomTV videos (files with no DB records, expired content with files)
// Run with: go run cmd/check_orphaned_roomtv.go

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"
	"wewatch-backend/internal/models"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	log.Println("🔍 ===== ROOMTV ORPHANED VIDEO CHECK =====")

	// Connect to database
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=postgres password=Chibby dbname=wewatch_db port=5432 sslmode=disable"
	}

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("❌ Failed to connect to database: %v", err)
	}

	log.Println("✅ Connected to database")

	// 1. Check filesystem for video files
	uploadDir := "./backend/uploads/tv-content"
	var filesOnDisk []string
	var totalDiskSize int64

	if _, err := os.Stat(uploadDir); os.IsNotExist(err) {
		log.Printf("📁 Upload directory does not exist: %s", uploadDir)
		log.Println("✨ No video files found - system is clean!")
	} else {
		err = filepath.Walk(uploadDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}
			if !info.IsDir() {
				filesOnDisk = append(filesOnDisk, filepath.Base(path))
				totalDiskSize += info.Size()
				log.Printf("  📄 Found file: %s (%.2f MB)", filepath.Base(path), float64(info.Size())/1024/1024)
			}
			return nil
		})
		if err != nil {
			log.Fatalf("❌ Failed to scan upload directory: %v", err)
		}

		log.Printf("📊 Total files on disk: %d (%.2f MB)", len(filesOnDisk), float64(totalDiskSize)/1024/1024)
	}

	// 2. Check database for active content
	var activeContent []models.RoomTVContent
	now := time.Now()

	db.Where("is_uploaded = ? AND ends_at > ?", true, now).Find(&activeContent)
	log.Printf("📊 Active RoomTV content in DB: %d", len(activeContent))

	for _, content := range activeContent {
		remainingTime := content.EndsAt.Sub(now)
		log.Printf("  ✅ Active: ID=%d, Room=%d, Title=%s, Expires in %s",
			content.ID, content.RoomID, content.Title, remainingTime.Round(time.Minute))
	}

	// 3. Check database for expired content
	var expiredContent []models.RoomTVContent
	db.Where("is_uploaded = ? AND ends_at <= ?", true, now).Find(&expiredContent)
	log.Printf("📊 Expired RoomTV content in DB: %d", len(expiredContent))

	orphanedFilesCount := 0
	for _, content := range expiredContent {
		expiredFor := now.Sub(content.EndsAt)
		log.Printf("  ⏰ Expired: ID=%d, Room=%d, Title=%s, Expired %s ago",
			content.ID, content.RoomID, content.Title, expiredFor.Round(time.Minute))

		// Check if file still exists
		if content.FilePath != "" {
			if _, err := os.Stat(content.FilePath); err == nil {
				orphanedFilesCount++
				fileInfo, _ := os.Stat(content.FilePath)
				log.Printf("    ⚠️  ORPHANED FILE FOUND: %s (%.2f MB)",
					content.FilePath, float64(fileInfo.Size())/1024/1024)
			}
		}
	}

	// 4. Check for files without DB records
	filesWithoutRecords := 0
	for _, filename := range filesOnDisk {
		var count int64
		db.Model(&models.RoomTVContent{}).Where("content_url LIKE ?", "%"+filename+"%").Count(&count)
		if count == 0 {
			filesWithoutRecords++
			log.Printf("  ⚠️  FILE WITHOUT DB RECORD: %s", filename)
		}
	}

	// 5. Summary
	log.Println("\n📋 ===== SUMMARY =====")
	log.Printf("Files on disk: %d (%.2f MB)", len(filesOnDisk), float64(totalDiskSize)/1024/1024)
	log.Printf("Active content in DB: %d", len(activeContent))
	log.Printf("Expired content in DB: %d", len(expiredContent))
	log.Printf("Orphaned files (expired with files): %d", orphanedFilesCount)
	log.Printf("Files without DB records: %d", filesWithoutRecords)

	if orphanedFilesCount > 0 || filesWithoutRecords > 0 {
		log.Println("\n⚠️  CLEANUP NEEDED! Run cleanup script to remove orphaned files.")
	} else {
		log.Println("\n✨ System is clean! No orphaned videos found.")
	}

	// 6. Check for the deletion bug
	log.Println("\n🐛 ===== BUG CHECK =====")
	var allContent []models.RoomTVContent
	db.Where("is_uploaded = ?", true).Order("created_at DESC").Limit(10).Find(&allContent)

	for _, content := range allContent {
		status := "EXPIRED"
		if content.EndsAt.After(now) {
			status = "ACTIVE"
		}

		videoDuration := "N/A"
		if content.VideoDuration != nil {
			videoDuration = fmt.Sprintf("%d seconds", *content.VideoDuration)
		}

		displayDuration := content.EndsAt.Sub(content.StartsAt)

		log.Printf("Content ID=%d [%s]:", content.ID, status)
		log.Printf("  Video Duration: %s", videoDuration)
		log.Printf("  Display Duration: %s", displayDuration.Round(time.Minute))
		log.Printf("  Created: %s", content.CreatedAt.Format("2006-01-02 15:04:05"))
		log.Printf("  Expires: %s", content.EndsAt.Format("2006-01-02 15:04:05"))

		// Check if file exists
		if content.FilePath != "" {
			if _, err := os.Stat(content.FilePath); os.IsNotExist(err) {
				log.Printf("  ⚠️  FILE MISSING (may have been deleted by bug)")
			} else {
				log.Printf("  ✅ File exists")
			}
		}
	}

	log.Println("\n✅ Check complete!")
}
