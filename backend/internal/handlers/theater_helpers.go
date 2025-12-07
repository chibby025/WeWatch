package handlers

import (
	"fmt"
	"log"

	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// GetOrCreateTheaterForSession finds an available theater or creates a new one
// Only applies to 3D Cinema sessions (watch_type = "3d_cinema")
func GetOrCreateTheaterForSession(session *models.WatchSession) (*models.Theater, bool, error) {
	if session.WatchType != "3d_cinema" {
		return nil, false, nil // VideoWatch doesn't need theaters
	}

	// Find all theaters for this session, ordered by theater number
	var theaters []models.Theater
	if err := DB.Where("watch_session_id = ?", session.ID).
		Order("theater_number ASC").
		Find(&theaters).Error; err != nil {
		return nil, false, fmt.Errorf("failed to fetch theaters: %w", err)
	}

	// If no theaters exist, create Theater 1 (initial theater)
	if len(theaters) == 0 {
		theater := &models.Theater{
			WatchSessionID: session.ID,
			TheaterNumber:  1,
			OccupiedSeats:  0,
			MaxSeats:       42,
		}
		if err := DB.Create(theater).Error; err != nil {
			return nil, false, fmt.Errorf("failed to create first theater: %w", err)
		}
		log.Printf("✅ Created Theater 1 for session %d", session.ID)
		return theater, false, nil // Created first theater, not a new overflow theater
	}

	// Check existing theaters for available seats
	for i := range theaters {
		if theaters[i].HasAvailableSeats() {
			return &theaters[i], false, nil // Found available theater
		}
	}

	// All theaters are full - create new theater
	newTheaterNumber := len(theaters) + 1
	newTheater := &models.Theater{
		WatchSessionID: session.ID,
		TheaterNumber:  newTheaterNumber,
		OccupiedSeats:  0,
		MaxSeats:       42,
	}

	if err := DB.Create(newTheater).Error; err != nil {
		return nil, false, fmt.Errorf("failed to create theater %d: %w", newTheaterNumber, err)
	}

	log.Printf("✅ Theater %d created for session %d (overflow theater)", newTheaterNumber, session.ID)
	return newTheater, true, nil // Created new overflow theater
}

// AssignUserToTheater assigns a user to an available seat in a theater
func AssignUserToTheater(userID uint, sessionID uint, theaterID uint, seatRow string, seatCol int) error {
	// Check if user already has an assignment for this session
	var existingAssignment models.UserTheaterAssignment
	err := DB.Where("user_id = ? AND watch_session_id = ?", userID, sessionID).
		First(&existingAssignment).Error

	if err == nil {
		// User already assigned - update if different theater/seat
		if existingAssignment.TheaterID != theaterID || 
		   existingAssignment.SeatRow != seatRow || 
		   existingAssignment.SeatCol != seatCol {
			existingAssignment.TheaterID = theaterID
			existingAssignment.SeatRow = seatRow
			existingAssignment.SeatCol = seatCol
			existingAssignment.SeatNumber = rowColToSeatNumber(seatRow, seatCol)
			return DB.Save(&existingAssignment).Error
		}
		return nil // Already correctly assigned
	}

	if err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to check existing assignment: %w", err)
	}

	// Create new assignment
	assignment := models.UserTheaterAssignment{
		UserID:         userID,
		WatchSessionID: sessionID,
		TheaterID:      theaterID,
		SeatRow:        seatRow,
		SeatCol:        seatCol,
		SeatNumber:     rowColToSeatNumber(seatRow, seatCol),
	}

	if err := DB.Create(&assignment).Error; err != nil {
		return fmt.Errorf("failed to create theater assignment: %w", err)
	}

	// Increment theater occupied seats
	if err := DB.Model(&models.Theater{}).
		Where("id = ?", theaterID).
		UpdateColumn("occupied_seats", gorm.Expr("occupied_seats + 1")).Error; err != nil {
		return fmt.Errorf("failed to increment theater occupancy: %w", err)
	}

	log.Printf("✅ Assigned user %d to Theater %d, Seat %s-%d", userID, theaterID, seatRow, seatCol)
	return nil
}

// GetUserTheaterAssignment retrieves a user's theater assignment for a session
func GetUserTheaterAssignment(userID uint, sessionID uint) (*models.UserTheaterAssignment, error) {
	var assignment models.UserTheaterAssignment
	err := DB.Preload("Theater").
		Where("user_id = ? AND watch_session_id = ?", userID, sessionID).
		First(&assignment).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, nil // No assignment found
		}
		return nil, err
	}

	return &assignment, nil
}

// RemoveUserFromTheater removes a user's theater assignment and decrements occupancy
func RemoveUserFromTheater(userID uint, sessionID uint) error {
	var assignment models.UserTheaterAssignment
	err := DB.Where("user_id = ? AND watch_session_id = ?", userID, sessionID).
		First(&assignment).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil // Already removed or never assigned
		}
		return err
	}

	// Decrement theater occupied seats
	if err := DB.Model(&models.Theater{}).
		Where("id = ?", assignment.TheaterID).
		UpdateColumn("occupied_seats", gorm.Expr("occupied_seats - 1")).Error; err != nil {
		log.Printf("⚠️ Failed to decrement theater occupancy: %v", err)
	}

	// Delete assignment
	if err := DB.Delete(&assignment).Error; err != nil {
		return fmt.Errorf("failed to delete theater assignment: %w", err)
	}

	log.Printf("✅ Removed user %d from theater assignment", userID)
	return nil
}

// GetAllTheatersForSession retrieves all theaters for a session with occupancy info
func GetAllTheatersForSession(sessionID uint) ([]models.Theater, error) {
	var theaters []models.Theater
	err := DB.Where("watch_session_id = ?", sessionID).
		Order("theater_number ASC").
		Find(&theaters).Error

	return theaters, err
}

// rowColToSeatNumber converts row letter and column number to seat number (1-42)
// Row A = seats 1-6, Row B = seats 7-12, etc.
func rowColToSeatNumber(row string, col int) int {
	if len(row) == 0 || col < 1 || col > 6 {
		return 0
	}
	rowNum := int(row[0] - 'A') // A=0, B=1, C=2, etc.
	return rowNum*6 + col
}
