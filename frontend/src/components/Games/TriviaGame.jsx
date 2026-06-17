import { useState, useEffect, useRef } from 'react';
import { X, Clock, Trophy, ChevronRight, Loader2, RefreshCw } from 'lucide-react';

const TOTAL_ROUNDS = 10;
const ROUND_SECONDS = 15;

const OPTION_LABELS = ['A', 'B', 'C', 'D'];
const OPTION_BASE = [
  'border-blue-500   bg-blue-500/20   hover:bg-blue-500/35',
  'border-green-500  bg-green-500/20  hover:bg-green-500/35',
  'border-orange-500 bg-orange-500/20 hover:bg-orange-500/35',
  'border-red-500    bg-red-500/20    hover:bg-red-500/35',
];

const CATEGORIES = [
  { id: 9,  label: 'General Knowledge', emoji: '🧠', color: 'from-purple-600 to-indigo-600' },
  { id: 11, label: 'Film',              emoji: '🎬', color: 'from-yellow-600 to-orange-600' },
  { id: 14, label: 'Television',        emoji: '📺', color: 'from-blue-600 to-cyan-600' },
  { id: 12, label: 'Music',             emoji: '🎵', color: 'from-pink-600 to-rose-600' },
  { id: 15, label: 'Video Games',       emoji: '🎮', color: 'from-green-600 to-emerald-600' },
  { id: 31, label: 'Anime & Manga',     emoji: '🌸', color: 'from-fuchsia-600 to-pink-600' },
  { id: 17, label: 'Science',           emoji: '🔬', color: 'from-teal-600 to-cyan-600' },
  { id: 22, label: 'Geography',         emoji: '🌍', color: 'from-sky-600 to-blue-600' },
  { id: 21, label: 'Sports',            emoji: '⚽', color: 'from-lime-600 to-green-600' },
  { id: 26, label: 'Celebrities',       emoji: '⭐', color: 'from-amber-500 to-yellow-600' },
  { id: 32, label: 'Cartoons',          emoji: '🎭', color: 'from-violet-600 to-purple-600' },
  { id: 23, label: 'History',           emoji: '📜', color: 'from-stone-500 to-amber-700' },
];

const DIFFICULTIES = [
  { id: 'easy',   label: 'Easy',   color: 'border-green-500 bg-green-500/20 text-green-300',   active: 'border-green-400 bg-green-500/40 ring-2 ring-green-400' },
  { id: 'medium', label: 'Medium', color: 'border-yellow-500 bg-yellow-500/20 text-yellow-300', active: 'border-yellow-400 bg-yellow-500/40 ring-2 ring-yellow-400' },
  { id: 'hard',   label: 'Hard',   color: 'border-red-500 bg-red-500/20 text-red-300',          active: 'border-red-400 bg-red-500/40 ring-2 ring-red-400' },
];

const FALLBACK_QUESTIONS = [
  { text: 'What is the largest planet in our solar system?', options: ['Earth','Jupiter','Saturn','Neptune'], correct_index: 1 },
  { text: "Which element has the chemical symbol 'Au'?", options: ['Silver','Copper','Gold','Platinum'], correct_index: 2 },
  { text: 'Who painted the Mona Lisa?', options: ['Michelangelo','Raphael','Van Gogh','Leonardo da Vinci'], correct_index: 3 },
  { text: 'What is the fastest land animal?', options: ['Lion','Cheetah','Horse','Leopard'], correct_index: 1 },
  { text: 'How many strings does a standard guitar have?', options: ['4','5','6','7'], correct_index: 2 },
  { text: 'What year did the Titanic sink?', options: ['1908','1912','1916','1920'], correct_index: 1 },
  { text: 'How many bones are in the adult human body?', options: ['196','206','216','226'], correct_index: 1 },
  { text: 'What is the capital of Japan?', options: ['Beijing','Seoul','Tokyo','Osaka'], correct_index: 2 },
  { text: 'Which planet is known as the Red Planet?', options: ['Venus','Jupiter','Mars','Saturn'], correct_index: 2 },
  { text: 'How many sides does a hexagon have?', options: ['5','6','7','8'], correct_index: 1 },
];

function decodeHtml(str) {
  try { return decodeURIComponent(str); } catch { return str; }
}

function processOpentdbQuestion(q) {
  const correct = decodeHtml(q.correct_answer);
  const all = [correct, ...q.incorrect_answers.map(decodeHtml)].sort(() => Math.random() - 0.5);
  return { text: decodeHtml(q.question), options: all, correct_index: all.indexOf(correct) };
}

async function fetchQuestions(categoryId, difficulty) {
  const url = `https://opentdb.com/api.php?amount=10&type=multiple&encode=url3986${
    categoryId ? `&category=${categoryId}` : ''
  }${difficulty ? `&difficulty=${difficulty}` : ''}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.response_code !== 0 || !data.results?.length) throw new Error('no results');
  return data.results.map(processOpentdbQuestion);
}

// ─── Category picker (host only) ─────────────────────────────────────────────
function CategoryPicker({ onConfirm, onEnd }) {
  const [selected, setSelected] = useState(null);
  const [difficulty, setDifficulty] = useState('medium');

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col overflow-y-auto">
      <div className="flex items-start justify-between pl-20 pr-5 pt-6 pb-2">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Pick a Topic 🎯</h2>
          <p className="text-gray-400 text-sm">Choose what you want to be quizzed on</p>
        </div>
        <button
          onClick={onEnd}
          className="mt-1 p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors flex-shrink-0"
          title="Cancel game"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Category grid */}
      <div className="px-5 py-4 grid grid-cols-3 sm:grid-cols-4 gap-2.5 flex-1">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelected(cat.id === selected ? null : cat.id)}
            className={`
              relative rounded-xl p-3 flex flex-col items-center justify-center gap-1.5 border-2 transition-all
              ${selected === cat.id
                ? `bg-gradient-to-br ${cat.color} border-white/40 scale-105 shadow-lg`
                : 'border-gray-700 bg-gray-800/60 hover:border-gray-500 hover:bg-gray-700/60'
              }
            `}
          >
            <span className="text-2xl sm:text-3xl">{cat.emoji}</span>
            <span className="text-white text-[11px] font-semibold text-center leading-tight">{cat.label}</span>
            {selected === cat.id && (
              <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-white rounded-full flex items-center justify-center text-xs text-gray-900 font-bold">✓</span>
            )}
          </button>
        ))}
      </div>

      {/* Difficulty + start */}
      <div className="px-5 pb-6 pt-2 space-y-4 border-t border-gray-800">
        <div>
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">Difficulty</p>
          <div className="flex gap-2">
            {DIFFICULTIES.map(d => (
              <button
                key={d.id}
                onClick={() => setDifficulty(d.id)}
                className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                  difficulty === d.id ? d.active : d.color
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => onConfirm(selected, difficulty)}
          className="w-full py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all disabled:opacity-40"
        >
          {selected
            ? `Start — ${CATEGORIES.find(c => c.id === selected)?.label}`
            : 'Start — Random Mix'}
        </button>
      </div>
    </div>
  );
}

// ─── Main game component ──────────────────────────────────────────────────────
export default function TriviaGame({ gameState, currentUserId, onMove, onClose, onEndGame }) {
  // 'picking' → host only; 'loading' → fetching from API; 'game' → main UI
  const [localPhase, setLocalPhase] = useState('picking');
  const [questions, setQuestions] = useState([]);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [myAnswer, setMyAnswer] = useState(null);
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [fetchError, setFetchError] = useState(false);
  const revealSentRef = useRef(false);

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const currentQuestion = gs.current_question || null;
  const answers = gs.answers || {};
  const scores = gs.scores || {};
  const round = Number(gs.round) || 0;

  const players = gameState?.players || [];
  const isHostUser = players[0]?.user_id === currentUserId;

  // Non-hosts skip the picker and go straight to game
  useEffect(() => {
    if (!isHostUser) setLocalPhase('game');
  }, [isHostUser]);

  // Reset answer when a new question arrives
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

  const handleCategoryConfirm = async (categoryId, difficulty) => {
    setLocalPhase('loading');
    setFetchError(false);
    try {
      const qs = await fetchQuestions(categoryId, difficulty);
      setQuestions(qs);
    } catch {
      setFetchError(true);
      setQuestions(FALLBACK_QUESTIONS);
    }
    setLocalPhase('game');
  };

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

  const endGame = () => { if (onEndGame) onEndGame(); else onClose(); };

  const answeredCount = Object.keys(answers).length;
  const isLastRound = round >= TOTAL_ROUNDS;
  const sortedPlayers = [...players].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );

  // ── Host: category picker ────────────────────────────────────────────────
  if (isHostUser && localPhase === 'picking') {
    return <CategoryPicker onConfirm={handleCategoryConfirm} onEnd={endGame} />;
  }

  // ── Host: loading screen ─────────────────────────────────────────────────
  if (isHostUser && localPhase === 'loading') {
    return (
      <div className="fixed inset-0 z-[60] bg-gray-950/98 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-white text-lg font-medium">Fetching questions…</p>
          <p className="text-gray-500 text-sm mt-1">Powered by Open Trivia DB</p>
        </div>
      </div>
    );
  }

  // ── Main game UI ─────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header — left padding clears the sidebar (~64px wide on mobile) */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <span className="text-white font-bold text-xl">Trivia</span>
          {round > 0 && (
            <span className="text-gray-400 text-sm ml-1">Round {round}/{TOTAL_ROUNDS}</span>
          )}
          {fetchError && (
            <span className="text-xs bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Using fallback questions
            </span>
          )}
        </div>
        <button
          onClick={endGame}
          className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
          title={isHostUser ? 'End game for everyone' : 'Leave game'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Score strip */}
      {round > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
          {sortedPlayers.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-1.5 flex-shrink-0">
              {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
              <div className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: p.color }} />
              <span className="text-white text-sm">{p.username}</span>
              <span className="text-yellow-400 text-xs font-bold">{Number(scores[String(p.user_id)]) || 0}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">

        {/* Waiting */}
        {phase === 'waiting' && (
          <div className="text-center">
            <div className="text-6xl mb-5">{isHostUser ? '🎯' : '⏳'}</div>
            <h2 className="text-2xl font-bold text-white mb-2">{isHostUser ? 'Ready!' : 'Get Ready!'}</h2>
            <p className="text-gray-400 mb-8 text-sm">
              {isHostUser
                ? 'Questions loaded. Start when everyone is ready.'
                : 'Waiting for the host to start the first round…'}
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

        {/* Question / Reveal */}
        {(phase === 'question' || phase === 'reveal') && currentQuestion && (
          <div className="w-full max-w-2xl">
            {/* Timer bar */}
            {phase === 'question' && (
              <div className="flex items-center gap-3 mb-5">
                <Clock className={`w-4 h-4 flex-shrink-0 ${timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`} />
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${timeLeft <= 5 ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right tabular-nums ${timeLeft <= 5 ? 'text-red-400' : 'text-gray-300'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            {/* Question card */}
            <div className="bg-gray-800 rounded-2xl p-6 mb-4 text-center shadow-lg">
              <p className="text-white text-lg font-semibold leading-relaxed">{currentQuestion.text}</p>
            </div>

            {phase === 'question' && (
              <p className="text-gray-500 text-xs text-center mb-3">
                {answeredCount}/{players.length} answered
              </p>
            )}

            {/* Answer grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currentQuestion.options?.map((option, i) => {
                const isCorrect = i === currentQuestion.correct_index;
                const isMyPick = myAnswer === i;
                const revealed = phase === 'reveal';

                let cls = 'w-full p-3.5 rounded-xl border-2 text-left transition-all flex items-center gap-3 ';
                if (revealed) {
                  if (isCorrect)     cls += 'border-green-500 bg-green-600/25 text-white';
                  else if (isMyPick) cls += 'border-red-500 bg-red-600/20 text-gray-300 line-through';
                  else               cls += 'border-gray-700 bg-gray-800/40 text-gray-500';
                } else if (isMyPick) {
                  cls += 'border-purple-400 bg-purple-600/25 text-white';
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
                    <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {OPTION_LABELS[i]}
                    </span>
                    <span className="flex-1 text-sm font-medium leading-snug">{option}</span>
                    {revealed && isCorrect  && <span className="text-green-400 font-bold text-base">✓</span>}
                    {revealed && isMyPick && !isCorrect && <span className="text-red-400 font-bold text-base">✗</span>}
                  </button>
                );
              })}
            </div>

            {/* Reveal results */}
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
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
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
              <div className="flex justify-between items-center mt-5">
                <button onClick={endGame} className="text-gray-500 hover:text-red-400 text-sm transition-colors">
                  End Game
                </button>
                <div className="flex gap-2">
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
                      <Trophy className="w-4 h-4" /> Show Results
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Member hint */}
            {!isHostUser && phase === 'question' && (
              <p className="text-center text-gray-500 text-xs mt-4">
                {myAnswer !== null ? 'Locked in! Waiting for answers to be revealed…' : 'Pick an answer before time runs out!'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
