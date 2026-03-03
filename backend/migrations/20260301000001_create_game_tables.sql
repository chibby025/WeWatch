-- Create game_sessions table
CREATE TABLE IF NOT EXISTS game_sessions (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES watch_sessions(id) ON DELETE CASCADE,
    game_type VARCHAR(50) NOT NULL, -- 'tic_tac_toe', 'rock_paper_scissors', 'ludo'
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active', -- 'active', 'completed', 'forfeited'
    winner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    players JSONB NOT NULL, -- [{user_id: 1, username: "Alice", color: "red", avatar: "url"}, ...]
    game_state JSONB, -- Game-specific state (board state, scores, etc.)
    created_at TIMESTAMP DEFAULT NOW(),
    ended_at TIMESTAMP
);

-- Create game_moves table for move history
CREATE TABLE IF NOT EXISTS game_moves (
    id SERIAL PRIMARY KEY,
    game_session_id INTEGER NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    player_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    move_type VARCHAR(50) NOT NULL, -- 'place', 'pick', 'roll', 'move_token'
    move_data JSONB NOT NULL, -- Move-specific data {position: 0, token_id: 1, etc.}
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_game_sessions_room ON game_sessions(room_id);
CREATE INDEX idx_game_sessions_status ON game_sessions(status);
CREATE INDEX idx_game_moves_session ON game_moves(game_session_id);
CREATE INDEX idx_game_moves_player ON game_moves(player_id);

-- Add comments for documentation
COMMENT ON TABLE game_sessions IS 'Stores active and completed game sessions in WeWatch rooms';
COMMENT ON TABLE game_moves IS 'Stores move history for game replay and state reconstruction';
COMMENT ON COLUMN game_sessions.game_type IS 'Type of game: tic_tac_toe, rock_paper_scissors, or ludo';
COMMENT ON COLUMN game_sessions.status IS 'Game status: active (in progress), completed (finished normally), forfeited (player left)';
COMMENT ON COLUMN game_sessions.players IS 'JSON array of player objects with user_id, username, color, avatar';
COMMENT ON COLUMN game_sessions.game_state IS 'JSON object containing current game state (board, scores, turn, etc.)';
