package handlers

import (
	"fmt"
	"log"

	"wewatch-backend/internal/models"
	"gorm.io/gorm"
)

// GetOrCreateLectureHallForSession finds an available hall or creates a new one
// Only applies to classroom sessions with class_type = "lecture_hall"
func GetOrCreateLectureHallForSession(session *models.WatchSession) (int, bool, error) {
	if session.WatchType != "classroom" || session.ClassType != "lecture_hall" {
		return 1, false, nil // Not a lecture hall session, default to hall 1
	}

	// Count active members per hall number
	var hallOccupancy []struct {
		HallNumber    int
		MemberCount   int64
	}

	err := DB.Model(&models.WatchSessionMember{}).
		Select("lecture_hall_number as hall_number, COUNT(*) as member_count").
		Where("watch_session_id = ? AND is_active = ?", session.ID, true).
		Group("lecture_hall_number").
		Order("lecture_hall_number ASC").
		Scan(&hallOccupancy).Error

	if err != nil {
		return 0, false, fmt.Errorf("failed to query hall occupancy: %w", err)
	}

	// If no halls exist yet, create Hall 1
	if len(hallOccupancy) == 0 {
		log.Printf("✅ Created Lecture Hall 1 for session %d", session.ID)
		return 1, false, nil
	}

	// Find first hall with available seats (< 145)
	for _, hall := range hallOccupancy {
		if hall.MemberCount < 145 {
			log.Printf("🪑 Assigning to Lecture Hall %d (%d/145 occupied)", hall.HallNumber, hall.MemberCount)
			return hall.HallNumber, false, nil
		}
	}

	// All halls are full - create new hall
	newHallNumber := len(hallOccupancy) + 1
	log.Printf("✅ Lecture Hall %d created for session %d (overflow hall)", newHallNumber, session.ID)
	return newHallNumber, true, nil
}

// GetUserLectureHallAssignment retrieves a user's hall assignment for a session
func GetUserLectureHallAssignment(userID uint, sessionID uint) (int, error) {
	var member models.WatchSessionMember
	err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = ?", sessionID, userID, true).
		First(&member).Error

	if err != nil {
		if err == gorm.ErrRecordNotFound {
			return 0, nil // No assignment found
		}
		return 0, err
	}

	// Return hall number (defaults to 1 if NULL)
	if member.LectureHallNumber == nil {
		return 1, nil
	}
	return *member.LectureHallNumber, nil
}

// GetLectureHallOccupancy returns occupancy stats for all halls in a session
func GetLectureHallOccupancy(sessionID uint) (map[int]int64, error) {
	var hallOccupancy []struct {
		HallNumber  int
		MemberCount int64
	}

	err := DB.Model(&models.WatchSessionMember{}).
		Select("lecture_hall_number as hall_number, COUNT(*) as member_count").
		Where("watch_session_id = ? AND is_active = ?", sessionID, true).
		Group("lecture_hall_number").
		Scan(&hallOccupancy).Error

	if err != nil {
		return nil, err
	}

	result := make(map[int]int64)
	for _, hall := range hallOccupancy {
		result[hall.HallNumber] = hall.MemberCount
	}

	return result, nil
}

// GetAllHallsForSession returns list of active hall numbers for a session
func GetAllHallsForSession(sessionID uint) ([]int, error) {
	var hallNumbers []int

	err := DB.Model(&models.WatchSessionMember{}).
		Select("DISTINCT lecture_hall_number").
		Where("watch_session_id = ? AND is_active = ?", sessionID, true).
		Order("lecture_hall_number ASC").
		Pluck("lecture_hall_number", &hallNumbers).Error

	if err != nil {
		return nil, err
	}

	// If no halls found, return [1] as default
	if len(hallNumbers) == 0 {
		return []int{1}, nil
	}

	return hallNumbers, nil
}
