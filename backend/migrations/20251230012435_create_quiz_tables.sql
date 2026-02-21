-- Migration: Create quiz system tables
-- Date: 2025-12-30
-- Description: Add tables for interactive quiz functionality in lecture halls

-- Table: quizzes
CREATE TABLE IF NOT EXISTS quizzes (
  id SERIAL PRIMARY KEY,
  room_id INT NOT NULL,
  session_id INT NOT NULL,
  host_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  timer_enabled BOOLEAN DEFAULT FALSE,
  timer_seconds INT DEFAULT NULL,
  questions JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP DEFAULT NULL,
  ended_at TIMESTAMP DEFAULT NULL,
  
  CONSTRAINT fk_quiz_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_host FOREIGN KEY (host_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_status CHECK (status IN ('draft', 'in_progress', 'completed'))
);

-- Indexes for quizzes table
CREATE INDEX idx_quizzes_room_session ON quizzes(room_id, session_id);
CREATE INDEX idx_quizzes_status ON quizzes(status);
CREATE INDEX idx_quizzes_host ON quizzes(host_id);

-- Table: quiz_responses
CREATE TABLE IF NOT EXISTS quiz_responses (
  id SERIAL PRIMARY KEY,
  quiz_id INT NOT NULL,
  user_id INT NOT NULL,
  answers JSONB NOT NULL,
  score INT NOT NULL,
  total_questions INT NOT NULL,
  submitted_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT fk_response_quiz FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  CONSTRAINT fk_response_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT uq_quiz_user UNIQUE (quiz_id, user_id)
);

-- Indexes for quiz_responses table
CREATE INDEX idx_responses_quiz ON quiz_responses(quiz_id);
CREATE INDEX idx_responses_user ON quiz_responses(user_id);

-- Comments for documentation
COMMENT ON TABLE quizzes IS 'Stores quiz definitions created by hosts in lecture hall sessions';
COMMENT ON TABLE quiz_responses IS 'Stores student answers and scores for quizzes';
COMMENT ON COLUMN quizzes.questions IS 'JSONB array of question objects with type, question, options, and correct_answer';
COMMENT ON COLUMN quiz_responses.answers IS 'JSONB array of answer objects with question_id, answer, and is_correct';
