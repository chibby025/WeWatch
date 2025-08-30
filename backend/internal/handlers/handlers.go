// WeWatch/backend/internal/handlers/handlers.go
package handlers

// Import necessary packages
// Note: No need to import gorm.io/gorm here if DB is only declared/used in other files
// import (
//   "gorm.io/gorm"
// )

// --- NO MORE VARIABLE DECLARATIONS HERE ---
// DB and hub are declared in auth.go and websocket.go respectively.
// This file can be used for other shared handler logic or package initialization if needed.

// Placeholder for future handler functions
// func StandingsWidget(c *gin.Context) { ... }
// func GamesWidget(c *gin.Context) { ... }
// func GameWidget(c *gin.Context) { ... }

// --- Export the Hub type and NewHub function ---
// These are defined in websocket.go and need to be accessible from main.go
// type Hub struct { ... } // Defined in websocket.go
// func NewHub() *Hub { ... } // Defined in websocket.go
// --- --- ---