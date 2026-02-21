package handlers

import (
	"fmt"
	"log"
	
	"wewatch-backend/internal/models"
)

// FindNextAvailableCinemaSeat finds the first available seat in a cinema theater
// Scans back-to-front (Row 6 → Row 1), LEFT-TO-RIGHT (Col 1 → 7) within each row
// Seat 36 (Row 6, Col 1 = "5-0") is RESERVED for host, members start at Seat 37 ("5-1")
// Only applies to 3D Cinema sessions (watch_type = "3d_cinema")
// Returns seat key like "5-1" (Row 6, Col 2) or "" if theater is full
func FindNextAvailableCinemaSeat(h *Hub, roomID uint, theaterNumber int, isHost bool) string {
	// Lock seating mutex for read access
	h.seatingMutex.RLock()
	defer h.seatingMutex.RUnlock()
	
	// If user is host, always return seat 36 (Row 6, Col 1)
	if isHost {
		hostSeatKey := "5-0" // Row 6, Col 1 (0-indexed) = Seat 36 (F1)
		
		// Get occupied seats for this theater
		occupiedSeats := make(map[string]bool)
		if roomMap, exists := h.seatingAssignments[roomID]; exists {
			if theaterMap, exists := roomMap[theaterNumber]; exists {
				for seatKey := range theaterMap {
					occupiedSeats[seatKey] = true
				}
			}
		}
		
		// Check if host seat is already taken (shouldn't happen, but validate)
		if occupiedSeats[hostSeatKey] {
			log.Printf("⚠️ [FindNextAvailableCinemaSeat] Host seat %s already occupied!", hostSeatKey)
			return "" // Host seat taken - error state
		}
		
		log.Printf("🎭 [FindNextAvailableCinemaSeat] Assigning HOST to Seat 36 (key: %s, Row 6, Col 1) in Theater %d", 
			hostSeatKey, theaterNumber)
		return hostSeatKey
	}
	
	// Get occupied seats for this theater
	occupiedSeats := make(map[string]bool)
	if roomMap, exists := h.seatingAssignments[roomID]; exists {
		if theaterMap, exists := roomMap[theaterNumber]; exists {
			for seatKey := range theaterMap {
				occupiedSeats[seatKey] = true
			}
		}
	}
	
	// For members: Scan back-to-front (Row 6 → Row 1), LEFT-TO-RIGHT (Col 1 → 7)
	// Row 6 = index 5, Row 5 = index 4, ..., Row 1 = index 0
	// Col 1 (index 0) is reserved for host, so start at Col 2 (index 1) for Row 6
	for row := 5; row >= 0; row-- {
		// For Row 6 (index 5): start at col 1 (skip col 0 which is host seat)
		// For other rows: start at col 0 (all seats available)
		startCol := 0
		if row == 5 { // Row 6 (0-indexed as 5)
			startCol = 1 // Skip col 0 (host seat)
		}
		
		for col := startCol; col <= 6; col++ {
			seatKey := fmt.Sprintf("%d-%d", row, col)
			if !occupiedSeats[seatKey] {
				log.Printf("🎭 [FindNextAvailableCinemaSeat] Found available seat: %s (Row %d, Col %d) in Theater %d", 
					seatKey, row+1, col+1, theaterNumber)
				return seatKey
			}
		}
	}
	
	log.Printf("⚠️ [FindNextAvailableCinemaSeat] Theater %d is full (41/41 member seats occupied)", theaterNumber)
	return "" // Theater is full
}

// CheckCinemaSeatAvailable checks if a specific seat is available in a theater
// Used for reconnection logic to try to reclaim previous seat
func CheckCinemaSeatAvailable(h *Hub, roomID uint, theaterNumber int, seatKey string) bool {
	h.seatingMutex.RLock()
	defer h.seatingMutex.RUnlock()
	
	if roomMap, exists := h.seatingAssignments[roomID]; exists {
		if theaterMap, exists := roomMap[theaterNumber]; exists {
			_, occupied := theaterMap[seatKey]
			return !occupied
		}
	}
	
	return true // Theater/room doesn't exist yet, seat is available
}

// GetUserCinemaSeat retrieves the current seat assignment for a user in a cinema session
// Returns seatKey and theaterNumber, or empty string and 0 if not found
// Checks DATABASE FIRST (for reconnection after swaps), then falls back to in-memory map
func GetUserCinemaSeat(h *Hub, roomID uint, userID uint) (string, int) {
	// 1️⃣ CHECK DATABASE FIRST: Get active session and user's theater assignment
	var activeSession models.WatchSession
	if err := DB.Where("room_id = ? AND ended_at IS NULL", roomID).First(&activeSession).Error; err == nil {
		// Get user's theater assignment from database
		assignment, err := GetUserTheaterAssignment(userID, activeSession.ID)
		if err == nil && assignment != nil {
			// Convert SeatRow (A-F) and SeatCol (1-7) to seat key ("5-0" format)
			// SeatRow: A=0, B=1, C=2, D=3, E=4, F=5
			// SeatCol: 1-7 → 0-6 (0-indexed)
			row := int(assignment.SeatRow[0] - 'A') // Convert 'A' → 0, 'F' → 5
			col := assignment.SeatCol - 1            // Convert 1-7 → 0-6
			seatKey := fmt.Sprintf("%d-%d", row, col)
			
			log.Printf("🔄 [GetUserCinemaSeat] Found DB assignment: User %d → Seat %s (Row %s, Col %d) in Theater %d", 
				userID, seatKey, assignment.SeatRow, assignment.SeatCol, assignment.Theater.TheaterNumber)
			
			// Restore to in-memory map if not already there (reconnection scenario)
			h.seatingMutex.Lock()
			if _, exists := h.seatingAssignments[roomID]; !exists {
				h.seatingAssignments[roomID] = make(map[int]map[string]uint)
			}
			if _, exists := h.seatingAssignments[roomID][assignment.Theater.TheaterNumber]; !exists {
				h.seatingAssignments[roomID][assignment.Theater.TheaterNumber] = make(map[string]uint)
			}
			h.seatingAssignments[roomID][assignment.Theater.TheaterNumber][seatKey] = userID
			h.seatingMutex.Unlock()
			
			return seatKey, assignment.Theater.TheaterNumber
		}
	}
	
	// 2️⃣ FALLBACK: Check in-memory map (for active sessions without reconnection)
	h.seatingMutex.RLock()
	defer h.seatingMutex.RUnlock()
	
	if roomMap, exists := h.seatingAssignments[roomID]; exists {
		for theaterNum, theaterMap := range roomMap {
			for seatKey, occupantID := range theaterMap {
				if occupantID == userID {
					return seatKey, theaterNum
				}
			}
		}
	}
	
	return "", 0
}
