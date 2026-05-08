// backend/internal/handlers/notification_settings_test.go
package handlers

import (
	"testing"
	"time"
	"wewatch-backend/internal/models"
	"wewatch-backend/internal/utils"
)

// TestNotificationSettings_DefaultValues verifies default notification settings
func TestNotificationSettings_DefaultValues(t *testing.T) {
	db := setupTestDB()

	// Create test user
	hashedPassword, _ := utils.HashPassword("password123")
	user := models.User{
		Username:     "testuser",
		Email:        "test@example.com",
		PasswordHash: hashedPassword,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Create default settings
	settings := models.UserSettings{
		UserID: user.ID,
		// Defaults should be true
	}
	if err := db.Create(&settings).Error; err != nil {
		t.Fatalf("Failed to create settings: %v", err)
	}

	// Retrieve and verify defaults
	var retrieved models.UserSettings
	if err := db.Where("user_id = ?", user.ID).First(&retrieved).Error; err != nil {
		t.Fatalf("Failed to retrieve settings: %v", err)
	}

	// Verify default values (all notifications enabled by default)
	if !retrieved.PushEnabled {
		t.Error("Expected PushEnabled to be true by default")
	}
	if !retrieved.FriendRequestsNotif {
		t.Error("Expected FriendRequestsNotif to be true by default")
	}
	if !retrieved.MessagesNotif {
		t.Error("Expected MessagesNotif to be true by default")
	}
	if !retrieved.CallsNotif {
		t.Error("Expected CallsNotif to be true by default")
	}
}

// TestNotificationSettings_PushEnabledMasterToggle verifies master toggle behavior
func TestNotificationSettings_PushEnabledMasterToggle(t *testing.T) {
	db := setupTestDB()

	// Create test user
	hashedPassword, _ := utils.HashPassword("password123")
	user := models.User{
		Username:     "testuser",
		Email:        "test@example.com",
		PasswordHash: hashedPassword,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Create settings with push disabled
	settings := models.UserSettings{
		UserID:              user.ID,
		PushEnabled:         false, // Master toggle OFF
		FriendRequestsNotif: true,  // Individual toggle ON
		MessagesNotif:       true,
		CallsNotif:          true,
	}
	if err := db.Create(&settings).Error; err != nil {
		t.Fatalf("Failed to create settings: %v", err)
	}

	// Simulate notification check
	var retrieved models.UserSettings
	if err := db.Where("user_id = ?", user.ID).First(&retrieved).Error; err != nil {
		t.Fatalf("Failed to retrieve settings: %v", err)
	}

	// Master toggle should block all notifications
	shouldNotify := retrieved.PushEnabled && retrieved.FriendRequestsNotif
	if shouldNotify {
		t.Error("Expected notifications to be blocked when PushEnabled is false")
	}
}

// TestNotificationSettings_IndividualToggles verifies individual notification toggles
func TestNotificationSettings_IndividualToggles(t *testing.T) {
	db := setupTestDB()

	testCases := []struct {
		name               string
		pushEnabled        bool
		friendRequestNotif bool
		messagesNotif      bool
		callsNotif         bool
		expectedFriend     bool
		expectedMessage    bool
		expectedCall       bool
	}{
		{
			name:               "All enabled",
			pushEnabled:        true,
			friendRequestNotif: true,
			messagesNotif:      true,
			callsNotif:         true,
			expectedFriend:     true,
			expectedMessage:    true,
			expectedCall:       true,
		},
		{
			name:               "Friend requests disabled",
			pushEnabled:        true,
			friendRequestNotif: false,
			messagesNotif:      true,
			callsNotif:         true,
			expectedFriend:     false,
			expectedMessage:    true,
			expectedCall:       true,
		},
		{
			name:               "Messages disabled",
			pushEnabled:        true,
			friendRequestNotif: true,
			messagesNotif:      false,
			callsNotif:         true,
			expectedFriend:     true,
			expectedMessage:    false,
			expectedCall:       true,
		},
		{
			name:               "Calls disabled",
			pushEnabled:        true,
			friendRequestNotif: true,
			messagesNotif:      true,
			callsNotif:         false,
			expectedFriend:     true,
			expectedMessage:    true,
			expectedCall:       false,
		},
		{
			name:               "Master toggle off",
			pushEnabled:        false,
			friendRequestNotif: true,
			messagesNotif:      true,
			callsNotif:         true,
			expectedFriend:     false,
			expectedMessage:    false,
			expectedCall:       false,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Create test user
			hashedPassword, _ := utils.HashPassword("password123")
			user := models.User{
				Username:     "user_" + tc.name,
				Email:        tc.name + "@example.com",
				PasswordHash: hashedPassword,
			}
			if err := db.Create(&user).Error; err != nil {
				t.Fatalf("Failed to create test user: %v", err)
			}

			// Create settings
			settings := models.UserSettings{
				UserID:              user.ID,
				PushEnabled:         tc.pushEnabled,
				FriendRequestsNotif: tc.friendRequestNotif,
				MessagesNotif:       tc.messagesNotif,
				CallsNotif:          tc.callsNotif,
			}
			if err := db.Create(&settings).Error; err != nil {
				t.Fatalf("Failed to create settings: %v", err)
			}

			// Retrieve settings
			var retrieved models.UserSettings
			if err := db.Where("user_id = ?", user.ID).First(&retrieved).Error; err != nil {
				t.Fatalf("Failed to retrieve settings: %v", err)
			}

			// Test friend request notification logic
			shouldNotifyFriend := retrieved.PushEnabled && retrieved.FriendRequestsNotif
			if shouldNotifyFriend != tc.expectedFriend {
				t.Errorf("Friend request notification: expected %v, got %v", tc.expectedFriend, shouldNotifyFriend)
			}

			// Test message notification logic
			shouldNotifyMessage := retrieved.PushEnabled && retrieved.MessagesNotif
			if shouldNotifyMessage != tc.expectedMessage {
				t.Errorf("Message notification: expected %v, got %v", tc.expectedMessage, shouldNotifyMessage)
			}

			// Test call notification logic
			shouldNotifyCall := retrieved.PushEnabled && retrieved.CallsNotif
			if shouldNotifyCall != tc.expectedCall {
				t.Errorf("Call notification: expected %v, got %v", tc.expectedCall, shouldNotifyCall)
			}
		})
	}
}

// TestNotificationSettings_UpdateSettings verifies settings can be updated
func TestNotificationSettings_UpdateSettings(t *testing.T) {
	db := setupTestDB()

	// Create test user
	hashedPassword, _ := utils.HashPassword("password123")
	user := models.User{
		Username:     "testuser",
		Email:        "test@example.com",
		PasswordHash: hashedPassword,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Create initial settings (all enabled)
	settings := models.UserSettings{
		UserID:              user.ID,
		PushEnabled:         true,
		FriendRequestsNotif: true,
		MessagesNotif:       true,
		CallsNotif:          true,
	}
	if err := db.Create(&settings).Error; err != nil {
		t.Fatalf("Failed to create settings: %v", err)
	}

	// Update settings (disable messages)
	if err := db.Model(&models.UserSettings{}).
		Where("user_id = ?", user.ID).
		Update("messages_notif", false).Error; err != nil {
		t.Fatalf("Failed to update settings: %v", err)
	}

	// Retrieve and verify
	var updated models.UserSettings
	if err := db.Where("user_id = ?", user.ID).First(&updated).Error; err != nil {
		t.Fatalf("Failed to retrieve updated settings: %v", err)
	}

	if updated.MessagesNotif {
		t.Error("Expected MessagesNotif to be false after update")
	}
	if !updated.PushEnabled || !updated.FriendRequestsNotif || !updated.CallsNotif {
		t.Error("Other settings should remain unchanged")
	}
}

// TestKYCVerification verifies KYC status checks work correctly
func TestKYCVerification(t *testing.T) {
	// Create user with KYC approved
	now := time.Now()
	expiresAt := now.AddDate(2, 0, 0) // 2 years from now

	user := models.User{
		Username:      "kycuser",
		Email:         "kyc@example.com",
		PasswordHash:  "hashedpassword",
		KYCStatus:     "approved",
		KYCVerifiedAt: &now,
		KYCExpiresAt:  &expiresAt,
	}

	// Test IsKYCVerified
	if !user.IsKYCVerified() {
		t.Error("Expected user with approved KYC to be verified")
	}

	// Test CanWithdraw
	if !user.CanWithdraw() {
		t.Error("Expected verified user to be able to withdraw")
	}

	// Test expired KYC
	expiredDate := now.AddDate(-1, 0, 0) // 1 year ago
	userExpired := models.User{
		Username:      "expireduser",
		Email:         "expired@example.com",
		PasswordHash:  "hashedpassword",
		KYCStatus:     "approved",
		KYCVerifiedAt: &now,
		KYCExpiresAt:  &expiredDate,
	}

	if userExpired.IsKYCVerified() {
		t.Error("Expected user with expired KYC to not be verified")
	}

	if userExpired.CanWithdraw() {
		t.Error("Expected user with expired KYC to not be able to withdraw")
	}
}

// TestNotificationSettings_PrivacyVsNotifications verifies privacy and notification settings are independent
func TestNotificationSettings_PrivacyVsNotifications(t *testing.T) {
	db := setupTestDB()

	// Create test user
	hashedPassword, _ := utils.HashPassword("password123")
	user := models.User{
		Username:     "privacyuser",
		Email:        "privacy@example.com",
		PasswordHash: hashedPassword,
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("Failed to create test user: %v", err)
	}

	// Create settings with:
	// - Privacy: who_can_call = "friends" (allows calls from friends)
	// - Notifications: calls_notif = false (but no notification)
	settings := models.UserSettings{
		UserID:      user.ID,
		PushEnabled: true,
		CallsNotif:  false, // No notification
		WhoCanCall:  "friends",
	}
	if err := db.Create(&settings).Error; err != nil {
		t.Fatalf("Failed to create settings: %v", err)
	}

	// Retrieve settings
	var retrieved models.UserSettings
	if err := db.Where("user_id = ?", user.ID).First(&retrieved).Error; err != nil {
		t.Fatalf("Failed to retrieve settings: %v", err)
	}

	// Privacy setting should allow calls from friends
	if retrieved.WhoCanCall != "friends" {
		t.Error("Expected WhoCanCall to be 'friends'")
	}

	// But notification setting should block the notification
	shouldNotify := retrieved.PushEnabled && retrieved.CallsNotif
	if shouldNotify {
		t.Error("Expected call notification to be blocked when CallsNotif is false")
	}
}
