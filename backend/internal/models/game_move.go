package models

import (
"database/sql/driver"
"encoding/json"
"time"
)

// GameMove represents a single move in a game session
type GameMove struct {
ID            uint     `gorm:"primaryKey" json:"id"`
GameSessionID uint     `gorm:"not null" json:"game_session_id"`
PlayerID      uint     `gorm:"not null" json:"player_id"`
MoveType      string   `gorm:"type:varchar(50);not null" json:"move_type"`
MoveData      MoveData `gorm:"type:jsonb;not null" json:"move_data"`
CreatedAt     time.Time `json:"created_at"`

GameSession GameSession `gorm:"foreignKey:GameSessionID" json:"-"`
Player      User        `gorm:"foreignKey:PlayerID" json:"player,omitempty"`
}

// MoveData represents move-specific data
type MoveData map[string]interface{}

func (md *MoveData) Scan(value interface{}) error {
if value == nil {
*md = MoveData{}
return nil
}
bytes, ok := value.([]byte)
if !ok {
return nil
}
return json.Unmarshal(bytes, md)
}

func (md MoveData) Value() (driver.Value, error) {
if len(md) == 0 {
return []byte("{}"), nil
}
return json.Marshal(md)
}

func (GameMove) TableName() string {
return "game_moves"
}
