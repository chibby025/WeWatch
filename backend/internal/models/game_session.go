package models

import (
"database/sql/driver"
"encoding/json"
"time"
)

// GameSession represents a game session in a WeWatch room
type GameSession struct {
ID        uint      `gorm:"primaryKey" json:"id"`
RoomID    uint      `gorm:"not null" json:"room_id"`
SessionID *uint     `json:"session_id,omitempty"` // Watch session reference
GameType  string    `gorm:"type:varchar(50);not null" json:"game_type"` // 'tic_tac_toe', 'rock_paper_scissors', 'ludo'
HostID    uint      `gorm:"not null" json:"host_id"`
Status    string    `gorm:"type:varchar(20);default:'active'" json:"status"` // 'active', 'completed', 'forfeited'
WinnerID  *uint     `json:"winner_id,omitempty"`
Players   Players   `gorm:"type:jsonb" json:"players"`   // Array of player objects
GameState GameState `gorm:"type:jsonb" json:"game_state"` // Game-specific state
CreatedAt time.Time `json:"created_at"`
EndedAt   *time.Time `json:"ended_at,omitempty"`

// Associations
Room    Room  `gorm:"foreignKey:RoomID" json:"-"`
Host    User  `gorm:"foreignKey:HostID" json:"host,omitempty"`
Winner  *User `gorm:"foreignKey:WinnerID" json:"winner,omitempty"`
}

// Player represents a player in a game session
type Player struct {
UserID   uint   `json:"user_id"`
Username string `json:"username"`
Color    string `json:"color"`    // For Ludo: 'red', 'blue', 'green', 'yellow'
Avatar   string `json:"avatar"`   // User avatar URL
Position int    `json:"position"` // Player order (0-based)
}

// Players is a slice of Player that implements JSONB scanning
type Players []Player

// Scan implements sql.Scanner for JSONB
func (p *Players) Scan(value interface{}) error {
if value == nil {
*p = Players{}
return nil
}
bytes, ok := value.([]byte)
if !ok {
return nil
}
return json.Unmarshal(bytes, p)
}

// Value implements driver.Valuer for JSONB
func (p Players) Value() (driver.Value, error) {
if len(p) == 0 {
return []byte("[]"), nil
}
return json.Marshal(p)
}

// GameState represents the current state of a game
type GameState map[string]interface{}

// Scan implements sql.Scanner for JSONB
func (gs *GameState) Scan(value interface{}) error {
if value == nil {
*gs = GameState{}
return nil
}
bytes, ok := value.([]byte)
if !ok {
return nil
}
return json.Unmarshal(bytes, gs)
}

// Value implements driver.Valuer for JSONB
func (gs GameState) Value() (driver.Value, error) {
if len(gs) == 0 {
return []byte("{}"), nil
}
return json.Marshal(gs)
}

// Table name override
func (GameSession) TableName() string {
return "game_sessions"
}
