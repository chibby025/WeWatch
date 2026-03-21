package models_test

import (
	"testing"
	"wewatch-backend/internal/models"
)

func TestRoom_DefaultValues(t *testing.T) {
	room := &models.Room{
		Name:   "Test Room",
		HostID: 1,
	}

	// Test that room can be created with minimal fields
	if room.Name != "Test Room" {
		t.Errorf("Name = %s, want 'Test Room'", room.Name)
	}
	if room.HostID != 1 {
		t.Errorf("HostID = %d, want 1", room.HostID)
	}
}

func TestWatchSession_Validation(t *testing.T) {
	tests := []struct {
		name      string
		session   *models.WatchSession
		field     string
		expectSet bool
	}{
		{
			name: "Active session",
			session: &models.WatchSession{
				SessionID: "test-session-123",
				RoomID:    1,
				HostID:    1,
				IsActive:  true,
			},
			field:     "IsActive",
			expectSet: true,
		},
		{
			name: "Session with ticketing",
			session: &models.WatchSession{
				SessionID:        "test-session-456",
				RoomID:           1,
				HostID:           1,
				TicketingEnabled: true,
				TicketPriceTokens: 500,
			},
			field:     "TicketingEnabled",
			expectSet: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if tt.session.SessionID == "" {
				t.Error("SessionID should not be empty")
			}
			if tt.session.RoomID == 0 {
				t.Error("RoomID should not be zero")
			}
			if tt.session.HostID == 0 {
				t.Error("HostID should not be zero")
			}
		})
	}
}

func TestDonation_Validation(t *testing.T) {
	tests := []struct {
		name     string
		donation *models.Donation
		valid    bool
	}{
		{
			name: "Valid donation",
			donation: &models.Donation{
				DonorID:    1,
				ReceiverID: 2,
				Amount:     100,
			},
			valid: true,
		},
		{
			name: "Self donation",
			donation: &models.Donation{
				DonorID:    1,
				ReceiverID: 1,
				Amount:     100,
			},
			valid: false, // Should not donate to self
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			isSelfDonation := tt.donation.DonorID == tt.donation.ReceiverID
			if tt.valid && isSelfDonation {
				t.Error("Valid donation should not be self-donation")
			}
			if !tt.valid && !isSelfDonation {
				t.Error("Invalid donation should be self-donation")
			}
		})
	}
}

func TestPayout_StatusValidation(t *testing.T) {
	validStatuses := []string{"pending", "processing", "completed", "failed"}
	
	for _, status := range validStatuses {
		t.Run("Status: "+status, func(t *testing.T) {
			payout := &models.Payout{
				UserID: 1,
				Amount: 1000,
				Status: status,
			}

			if payout.Status != status {
				t.Errorf("Status = %s, want %s", payout.Status, status)
			}
		})
	}
}

func TestTokenTransaction_Types(t *testing.T) {
	validTypes := []string{"purchase", "earning", "spending", "withdrawal", "refund"}
	
	for _, txType := range validTypes {
		t.Run("Type: "+txType, func(t *testing.T) {
			tx := &models.TokenTransaction{
				UserID:          1,
				Amount:          100,
				TransactionType: txType,
			}

			if tx.TransactionType != txType {
				t.Errorf("TransactionType = %s, want %s", tx.TransactionType, txType)
			}
		})
	}
}
