// backend/cmd/cleanup_completed_ad_media.go
// CLEANUP SCRIPT: Deletes media files from completed ad campaigns
// Run with: go run cmd/cleanup_completed_ad_media.go
// 
// This script removes ad creative files (images/videos) from campaigns that:
// - Have status 'completed' or 'rejected'
// - Are older than 90 days past end_date
//
// Rationale: Most advertisers don't reuse the same creative for new campaigns.
// Keeping files for 90 days allows for analytics review and dispute resolution.

package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"wewatch-backend/internal/models"
)

func main() {
	log.Println("🧹 ===== AD CAMPAIGN MEDIA CLEANUP SCRIPT =====")
	log.Println("⚠️  This will DELETE media from completed/rejected campaigns older than 90 days")
	
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

	// Find completed/rejected campaigns older than 90 days
	cutoffDate := time.Now().AddDate(0, 0, -90) // 90 days ago
	
	var campaigns []models.AdCampaign
	query := db.
		Where("status IN (?)", []string{"completed", "rejected"}).
		Where("end_date < ?", cutoffDate).
		Where("media_url IS NOT NULL AND media_url != ''").
		Find(&campaigns)
	
	if query.Error != nil {
		log.Fatalf("❌ Failed to query campaigns: %v", query.Error)
	}

	totalCount := len(campaigns)
	log.Printf("🔍 Found %d campaigns with media ready for cleanup", totalCount)

	if totalCount == 0 {
		log.Println("✨ No campaign media to clean up!")
		return
	}

	// Show preview
	log.Println("\n📋 Preview of campaigns to clean:")
	for i, campaign := range campaigns {
		if i >= 10 {
			log.Printf("   ... and %d more campaigns", totalCount-10)
			break
		}
		log.Printf("   %d. %s (ID: %d, Status: %s, Ended: %s)", 
			i+1, campaign.CampaignName, campaign.ID, campaign.Status, 
			campaign.EndDate.Format("2006-01-02"))
	}

	// Confirmation prompt
	fmt.Print("\n⚠️  Proceed with media deletion? Type 'YES' to confirm: ")
	var confirmation string
	fmt.Scanln(&confirmation)
	
	if confirmation != "YES" {
		log.Println("❌ Cleanup cancelled by user")
		return
	}

	log.Println("\n🗑️  Starting cleanup...")
	
	successCount := 0
	fileErrors := 0
	dbErrors := 0
	totalSize := int64(0)
	skippedCount := 0

	for i, campaign := range campaigns {
		log.Printf("\n🗑️  [%d/%d] Processing: %s (ID: %d)", 
			i+1, totalCount, campaign.CampaignName, campaign.ID)
		
		filesDeleted := false
		
		// Delete main media file
		if campaign.MediaURL != "" {
			mediaPath := strings.TrimPrefix(campaign.MediaURL, "/")
			
			if _, err := os.Stat(mediaPath); err == nil {
				fileInfo, _ := os.Stat(mediaPath)
				fileSize := fileInfo.Size()
				
				if err := os.Remove(mediaPath); err != nil {
					log.Printf("   ❌ Failed to delete media: %v", err)
					fileErrors++
				} else {
					log.Printf("   ✅ Deleted media: %s (%.2f MB)", 
						filepath.Base(mediaPath), float64(fileSize)/(1024*1024))
					totalSize += fileSize
					filesDeleted = true
				}
			} else {
				log.Printf("   ⚠️  Media file not found: %s", mediaPath)
				skippedCount++
			}
		}
		
		// Delete thumbnail file
		if campaign.ThumbnailURL != "" {
			thumbPath := strings.TrimPrefix(campaign.ThumbnailURL, "/")
			
			if _, err := os.Stat(thumbPath); err == nil {
				if err := os.Remove(thumbPath); err == nil {
					log.Printf("   ✅ Deleted thumbnail: %s", filepath.Base(thumbPath))
					filesDeleted = true
				}
			}
		}
		
		// Update database - clear URLs but keep campaign record for analytics
		if filesDeleted {
			updates := map[string]interface{}{
				"media_url":     "",
				"thumbnail_url": "",
			}
			
			if err := db.Model(&campaign).Updates(updates).Error; err != nil {
				log.Printf("   ❌ Failed to update DB record: %v", err)
				dbErrors++
			} else {
				log.Printf("   ✅ Cleared media URLs in database")
				successCount++
			}
		}
	}

	// Summary
	log.Println("\n" + strings.Repeat("=", 60))
	log.Println("📊 CLEANUP SUMMARY")
	log.Println(strings.Repeat("=", 60))
	log.Printf("✅ Successfully cleaned: %d campaigns", successCount)
	log.Printf("⚠️  Files already gone: %d", skippedCount)
	log.Printf("❌ File deletion errors: %d", fileErrors)
	log.Printf("❌ Database update errors: %d", dbErrors)
	log.Printf("💾 Total space freed: %.2f MB", float64(totalSize)/(1024*1024))
	log.Println(strings.Repeat("=", 60))
	
	if successCount > 0 {
		log.Println("✨ Cleanup completed successfully!")
		log.Println("📝 Note: Campaign records remain in database for analytics and reporting")
	} else {
		log.Println("⚠️  No media was cleaned up")
	}
}
