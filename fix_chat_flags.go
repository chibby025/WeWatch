package main

import (
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// Database connection
	dsn := "host=localhost user=postgres password=Chibby dbname=wewatch_db port=5432 sslmode=disable"
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Check current state
	type Result struct {
		ID                 uint
		SenderID           uint
		RecipientID        uint
		DeletedBySender    bool
		DeletedByRecipient bool
		Message            string
	}

	var results []Result
	db.Raw(`
		SELECT id, sender_id, recipient_id, deleted_by_sender, deleted_by_recipient, LEFT(message, 50) as message
		FROM lobby_chats 
		WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7)
		ORDER BY created_at
	`).Scan(&results)

	fmt.Println("\n=== BEFORE FIX ===")
	for _, r := range results {
		fmt.Printf("ID=%d Sender=%d Recipient=%d DeletedBySender=%v DeletedByRecipient=%v Message=%s\n",
			r.ID, r.SenderID, r.RecipientID, r.DeletedBySender, r.DeletedByRecipient, r.Message)
	}

	// Fix the deletion flags
	result := db.Exec(`
		UPDATE lobby_chats 
		SET deleted_by_sender = false, deleted_by_recipient = false
		WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7)
	`)

	if result.Error != nil {
		log.Fatal("Failed to update:", result.Error)
	}

	fmt.Printf("\n=== UPDATED %d ROWS ===\n", result.RowsAffected)

	// Check after fix
	db.Raw(`
		SELECT id, sender_id, recipient_id, deleted_by_sender, deleted_by_recipient, LEFT(message, 50) as message
		FROM lobby_chats 
		WHERE (sender_id = 7 AND recipient_id = 8) OR (sender_id = 8 AND recipient_id = 7)
		ORDER BY created_at
	`).Scan(&results)

	fmt.Println("\n=== AFTER FIX ===")
	for _, r := range results {
		fmt.Printf("ID=%d Sender=%d Recipient=%d DeletedBySender=%v DeletedByRecipient=%v Message=%s\n",
			r.ID, r.SenderID, r.RecipientID, r.DeletedBySender, r.DeletedByRecipient, r.Message)
	}

	// Check table schema
	type ColumnInfo struct {
		ColumnName    string
		DataType      string
		ColumnDefault *string
		IsNullable    string
	}

	var columns []ColumnInfo
	db.Raw(`
		SELECT column_name, data_type, column_default, is_nullable
		FROM information_schema.columns
		WHERE table_name = 'lobby_chats' 
			AND column_name IN ('deleted_by_sender', 'deleted_by_recipient')
		ORDER BY ordinal_position
	`).Scan(&columns)

	fmt.Println("\n=== TABLE SCHEMA ===")
	for _, col := range columns {
		defaultVal := "NULL"
		if col.ColumnDefault != nil {
			defaultVal = *col.ColumnDefault
		}
		fmt.Printf("%s: %s, Default=%s, Nullable=%s\n",
			col.ColumnName, col.DataType, defaultVal, col.IsNullable)
	}
}
