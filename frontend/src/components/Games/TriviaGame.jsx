import { useState, useEffect, useRef } from 'react';
import { X, Clock, Trophy, ChevronRight, Loader2 } from 'lucide-react';

const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 15;

const OPTION_BASE = [
  'border-blue-500   bg-blue-600   hover:bg-blue-700',
  'border-green-500  bg-green-600  hover:bg-green-700',
  'border-orange-500 bg-orange-600 hover:bg-orange-700',
  'border-red-500    bg-red-600    hover:bg-red-700',
];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

const FALLBACK_QUESTIONS = [
  { text: 'What is the largest planet in our solar system?', options: ['Earth', 'Jupiter', 'Saturn', 'Neptune'], correct_index: 1 },
  { text: "Which element has the chemical symbol 'Au'?", options: ['Silver', 'Copper', 'Gold', 'Platinum'], correct_index: 2 },
  { text: 'Who painted the Mona Lisa?', options: ['Michelangelo', 'Raphael', 'Van Gogh', 'Leonardo da Vinci'], correct_index: 3 },
  { text: 'What is the fastest land animal?', options: ['Lion', 'Cheetah', 'Horse', 'Peregrine Falcon'], correct_index: 1 },
  { text: 'How many strings does a standard guitar have?', options: ['4', '5', '6', '7'], correct_index: 2 },
  { text: 'What year did the Titanic sink?', options: ['1908', '1912', '1916', '1920'], correct_index: 1 },
  { text: 'How many bones are in the adult human body?', options: ['196', '206', '216', '226'], correct_index: 1 },
  { text: 'What is the capital of Japan?', options: ['Beijing', 'Seoul', 'Tokyo', 'Osaka'], correct_index: 2 },
  { text: 'Which planet is known as the Red Planet?', options: ['Venus', 'Jupiter', 'Mars', 'Saturn'], correct_index: 2 },
  { text: 'How many sides does a hexagon have?', options: ['5', '6', '7', '8'], correct_index: 1 },
];

function processOpentdbQuestion(q) {
  const decode = (s) => decodeURIComponent(s);
  const correct = decode(q.correct_answer);
  const all = [correct, ...q.incorrect_answers.map(decode)].sort(() => Math.random() - 0.5);
  return { text: decode(q.question), options: all, correct_index: all.indexOf(correct) };
}

export default function TriviaGame({ gameState, currentUserId, onMove, onClose, onEndGame }) {
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [myAnswer, setMyAnswer] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const revealSentRef = useRef(false);

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const currentQuestion = gs.current_question || null;
  const answers = gs.answers || {};
  const scores = gs.scores || {};
  const round = Number(gs.round) || 0;

  const players = gameState?.players || [];
  const isHostUser = players[0]?.user_id === currentUserId;

  // Fetch trivia questions (host only)
  useEffect(() => {
    if (!isHostUser) { setIsLoading(false); return; }
    fetch('https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986')
      .then(r => r.json())
      .then(data => setQuestions(data.results.map(processOpentdbQuestion)))
      .catch(() => setQuestions(FALLBACK_QUESTIONS))
      .finally(() => setIsLoading(false));
  }, [isHostUser]);

  // Reset answer state when a new question arrives
  useEffect(() => {
    if (phase === 'question') {
      setMyAnswer(null);
      revealSentRef.current = false;
    }
  }, [currentQuestion?.started_at]);

  // Countdown timer
  useEffect(() => {
    if (phase !== 'question' || !currentQuestion?.started_at) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - currentQuestion.started_at) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHostUser && !revealSentRef.current) {
        revealSentRef.current = true;
        onMove({ move_type: 'reveal' });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, currentQuestion?.started_at, isHostUser, onMove]);

  const sendQuestion = () => {
    if (questionIndex >= questions.length) return;
    const q = { ...questions[questionIndex], started_at: Date.now() };
    onMove({ move_type: 'trivia_question', question: q });
    setQuestionIndex(i => i + 1);
  };

  const sendAnswer = (index) => {
    if (myAnswer !== null || phase !== 'question') return;
    setMyAnswer(index);
    onMove({ move_type: 'answer', answer_index: index });
  };

  const sendReveal = () => {
    if (revealSentRef.current) return;
    revealSentRef.current = true;
    onMove({ move_type: 'reveal' });
  };

  const endGame = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  const answeredCount = Object.keys(answers).length;
  const isLastRound = round >= TOTAL_ROUNDS;

  const sortedPlayers = [...players].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );

  if (isLoading && isHostUser) {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Loading trivia questions…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <span className="text-white font-bold text-xl">Trivia</span>
          {round > 0 && (
            <span className="text-gray-400 text-sm ml-1">Round {round}/{TOTAL_ROUNDS}</span>
          )}
        </div>
        {isHostUser && (
          <button onClick={endGame} className="text-gray-400 hover:text-white transition-colors" title="End game">
            <X className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Scores strip */}
      {round > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
          {sortedPlayers.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-1.5 flex-shrink-0">
              {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
              <div className="w-5 h-5 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: p.color }} />
              <span className="text-white text-sm">{p.username}</span>
              <span className="text-yellow-400 text-xs font-bold">{Number(scores[String(p.user_id)]) || 0}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">

        {/* Waiting state */}
        {phase === 'waiting' && (
          <div className="text-center">
            <div className="text-6xl mb-5">🎯</div>
            <h2 className="text-2xl font-bold text-white mb-2">Get Ready!</h2>
            <p className="text-gray-400 mb-8 text-sm">
              {isHostUser ? 'Start the first round when everyone is ready.' : 'Waiting for the host to start…'}
            </p>
            {isHostUser && (
              <button
                onClick={sendQuestion}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all"
              >
                Start Round 1
              </button>
            )}
          </div>
        )}

        {/* Question / Reveal phase */}
        {(phase === 'question' || phase === 'reveal') && currentQuestion && (
          <div className="w-full max-w-2xl">
            {/* Timer bar */}
            {phase === 'question' && (
              <div className="flex items-center gap-3 mb-5">
                <Clock className={`w-4 h-4 flex-shrink-0 ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-400'}`} />
                <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${timeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-300'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            {/* Question card */}
            <div className="bg-gray-800 rounded-2xl p-6 mb-4 text-center">
              <p className="text-white text-lg font-semibold leading-relaxed">{currentQuestion.text}</p>
            </div>

            {phase === 'question' && (
              <p className="text-gray-500 text-xs text-center mb-3">{answeredCount}/{players.length} answered</p>
            )}

            {/* Options grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentQuestion.options?.map((option, i) => {
                const isCorrect = i === currentQuestion.correct_index;
                const isMyPick = myAnswer === i;
                const revealed = phase === 'reveal';

                let cls = 'w-full p-3.5 rounded-xl border-2 text-left transition-all flex items-center gap-3 ';
                if (revealed) {
                  if (isCorrect)       cls += 'border-green-500 bg-green-600/20 text-white';
                  else if (isMyPick)   cls += 'border-red-500 bg-red-600/20 text-gray-400';
                  else                 cls += 'border-gray-700 bg-gray-800/40 text-gray-500';
                } else if (isMyPick) {
                  cls += 'border-purple-500 bg-purple-600/20 text-white';
                } else if (myAnswer !== null) {
                  cls += 'border-gray-700 bg-gray-800/40 text-gray-500 opacity-60';
                } else {
                  cls += `${OPTION_BASE[i]} text-white cursor-pointer`;
                }

                return (
                  <button
                    key={i}
                    onClick={() => sendAnswer(i)}
                    disabled={revealed || myAnswer !== null}
                    className={cls}
                  >
                    <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug">{option}</span>
                    {revealed && isCorrect  && <span className="text-green-400 font-bold">✓</span>}
                    {revealed && isMyPick && !isCorrect && <span className="text-red-400 font-bold">✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Reveal: who got it right */}
            {phase === 'reveal' && (
              <div className="mt-5 bg-gray-800/60 rounded-xl p-4">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide mb-3">Results</p>
                <div className="flex flex-wrap gap-2">
                  {players.map(p => {
                    const playerAnswer = answers[String(p.user_id)];
                    const correct = Number(playerAnswer) === currentQuestion.correct_index;
                    const answered = playerAnswer !== undefined && playerAnswer !== null;
                    return (
                      <span
                        key={p.user_id}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                          !answered
                            ? 'bg-gray-700 text-gray-400'
                            : correct
                              ? 'bg-green-600/25 border border-green-500/40 text-green-400'
                              : 'bg-red-600/20 border border-red-500/40 text-red-400'
                        }`}
                      >
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.username}
                        {answered ? (correct ? ' +100' : ' ✗') : ' –'}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Host controls */}
            {isHostUser && (
              <div className="flex justify-end gap-3 mt-5">
                {phase === 'question' && (
                  <button
                    onClick={sendReveal}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm transition-colors"
                  >
                    Reveal Answers
                  </button>
                )}
                {phase === 'reveal' && !isLastRound && (
                  <button
                    onClick={sendQuestion}
                    className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-semibold text-sm transition-all"
                  >
                    Next Round <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {phase === 'reveal' && isLastRound && (
                  <button
                    onClick={endGame}
                    className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-700 hover:to-teal-700 text-white rounded-xl font-semibold text-sm transition-all"
                  >
                    <Trophy className="w-4 h-4" /> End Game
                  </button>
                )}
              </div>
            )}

            {/* Player status hint */}
            {!isHostUser && phase === 'question' && (
              <p className="text-center text-gray-500 text-xs mt-4">
                {myAnswer !== null ? 'Answer locked in! Waiting for the host to reveal…' : 'Pick an answer!'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
