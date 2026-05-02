// frontend/src/components/cinema/modals/MakeQuizModal.jsx
import React, { useState } from 'react';

/**
 * QuestionEditor - Moved outside to prevent re-creation on parent re-render
 * This fixes the cursor disappearing bug
 */
const QuestionEditor = ({ question, index, updateQuestion, updateOption, removeQuestion }) => (
  <div className="bg-gray-700/50 rounded-lg p-4 space-y-3">
    {/* Question Header */}
    <div className="flex items-center justify-between">
      <span className="text-white font-semibold">Question {index + 1}</span>
      <div className="flex items-center gap-2">
        <span className={`px-2 py-1 rounded text-xs font-semibold ${
          question.type === 'text_input' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
        }`}>
          {question.type === 'text_input' ? '✍️ Text Input' : '☑️ Multiple Choice'}
        </span>
        <button
          onClick={() => removeQuestion(question.id)}
          className="text-red-400 hover:text-red-500 text-xl leading-none"
        >
          ×
        </button>
      </div>
    </div>

    {/* Question Text */}
    <div>
      <label className="block text-gray-400 text-sm mb-1">Question</label>
      <textarea
        value={question.question}
        onChange={(e) => updateQuestion(question.id, 'question', e.target.value)}
        placeholder="Enter your question here..."
        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white resize-none focus:outline-none focus:border-blue-500"
        rows={2}
      />
    </div>

    {/* Multiple Choice Options */}
    {question.type === 'multiple_choice' && (
      <div>
        <label className="block text-gray-400 text-sm mb-2">Answer Options</label>
        <div className="space-y-2">
          {question.options.map((option, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="text-white font-semibold w-6">{String.fromCharCode(65 + idx)}.</span>
              <input
                type="text"
                value={option}
                onChange={(e) => updateOption(question.id, idx, e.target.value)}
                placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
              />
            </div>
          ))}
        </div>
      </div>
    )}

    {/* Correct Answer */}
    <div>
      <label className="block text-gray-400 text-sm mb-1">
        Correct Answer {question.type === 'multiple_choice' && '(Enter letter: A, B, C, or D)'}
      </label>
      <input
        type="text"
        value={question.correct_answer}
        onChange={(e) => updateQuestion(question.id, 'correct_answer', e.target.value)}
        placeholder={question.type === 'multiple_choice' ? 'A' : 'Correct answer'}
        className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-green-500"
        maxLength={question.type === 'multiple_choice' ? 1 : undefined}
      />
    </div>

    {/* Exact Match Option (text_input only) */}
    {question.type === 'text_input' && (
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`exact-match-${question.id}`}
          checked={question.exact_match || false}
          onChange={(e) => updateQuestion(question.id, 'exact_match', e.target.checked)}
          className="w-4 h-4 text-blue-600 bg-gray-800 border-gray-600 rounded focus:ring-blue-500"
        />
        <label htmlFor={`exact-match-${question.id}`} className="text-gray-400 text-sm">
          Require exact match (case-sensitive)
        </label>
      </div>
    )}
  </div>
);

/**
 * MakeQuizModal - Host interface for creating quizzes
 * 
 * Features:
 * - Add/remove questions
 * - Two question types: text_input, multiple_choice
 * - Optional timer (global for entire quiz)
 * - Save as draft or publish immediately
 */
export default function MakeQuizModal({
  isOpen,
  onClose,
  onSaveQuiz,
  sendMessage,
  currentUser,
  roomId,
  sessionId,
}) {
  const [quizName, setQuizName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const addQuestion = (type) => {
    const newQuestion = {
      id: questions.length + 1,
      type, // 'text_input' or 'multiple_choice'
      question: '',
      correct_answer: '',
      options: type === 'multiple_choice' ? ['', '', '', ''] : null, // A, B, C, D
      exact_match: false, // Default to case-insensitive for text_input
    };
    setQuestions([...questions, newQuestion]);
  };

  const updateQuestion = (questionId, field, value) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? { ...q, [field]: value } : q
    ));
  };

  const updateOption = (questionId, optionIndex, value) => {
    setQuestions(questions.map(q => 
      q.id === questionId ? {
        ...q,
        options: q.options.map((opt, idx) => idx === optionIndex ? value : opt)
      } : q
    ));
  };

  const removeQuestion = (questionId) => {
    setQuestions(questions.filter(q => q.id !== questionId));
  };

  const handleSaveQuiz = () => {
    // Validation
    if (!quizName.trim()) {
      alert('Please enter a quiz name');
      return;
    }

    if (questions.length === 0) {
      alert('Please add at least one question');
      return;
    }

    // Validate all questions
    for (const q of questions) {
      if (!q.question.trim()) {
        alert(`Question ${q.id}: Please enter a question`);
        return;
      }

      if (!q.correct_answer.trim()) {
        alert(`Question ${q.id}: Please enter a correct answer`);
        return;
      }

      if (q.type === 'multiple_choice') {
        const filledOptions = q.options.filter(opt => opt.trim());
        if (filledOptions.length < 2) {
          alert(`Question ${q.id}: Multiple choice needs at least 2 options`);
          return;
        }

        // Validate correct answer is A, B, C, or D
        const answerLetter = q.correct_answer.toUpperCase();
        if (!['A', 'B', 'C', 'D'].includes(answerLetter)) {
          alert(`Question ${q.id}: Correct answer must be A, B, C, or D`);
          return;
        }

        // Check if the selected option is filled
        const optionIndex = answerLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
        if (!q.options[optionIndex]?.trim()) {
          alert(`Question ${q.id}: Option ${answerLetter} is empty but marked as correct`);
          return;
        }
      }
    }

    // Prepare quiz data
    const quizData = {
      room_id: roomId,
      session_id: sessionId,
      name: quizName.trim(),
      questions: questions.map(q => ({
        id: q.id,
        type: q.type,
        question: q.question.trim(),
        correct_answer: q.type === 'multiple_choice' ? q.correct_answer.toUpperCase() : q.correct_answer.trim(),
        options: q.type === 'multiple_choice' ? q.options.filter(opt => opt.trim()) : null,
        exact_match: q.type === 'text_input' ? (q.exact_match || false) : undefined,
      })),
      timer_enabled: timerEnabled,
      timer_seconds: timerEnabled ? timerMinutes * 60 : null,
    };

    console.log('📝 [MakeQuiz] Creating quiz with:', { 
      roomId, 
      sessionId, 
      quizData,
      roomId_type: typeof roomId,
      sessionId_type: typeof sessionId
    });

    setIsSubmitting(true);

    // Send to backend
    if (sendMessage) {
      sendMessage({
        type: 'quiz_create',
        data: quizData
      });
      console.log('📝 [MakeQuiz] Sent quiz to backend');
    }

    // Reset form
    setQuizName('');
    setQuestions([]);
    setTimerEnabled(false);
    setTimerMinutes(5);
    setIsSubmitting(false);

    // Close modal
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div>
            <h2 className="text-white text-2xl font-bold">✨ Create New Quiz</h2>
            <p className="text-gray-400 text-sm mt-1">Add questions and set a timer</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-3xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quiz Name */}
          <div>
            <label className="block text-white font-semibold mb-2">Quiz Name</label>
            <input
              type="text"
              value={quizName}
              onChange={(e) => setQuizName(e.target.value)}
              placeholder="e.g., Chapter 5 Review"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Timer Settings */}
          <div className="bg-gray-700/30 rounded-lg p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={timerEnabled}
                onChange={(e) => setTimerEnabled(e.target.checked)}
                className="w-5 h-5"
              />
              <span className="text-white font-semibold">Enable Timer</span>
            </label>
            {timerEnabled && (
              <div className="mt-3 flex items-center gap-3">
                <label className="text-gray-400 text-sm">Time Limit:</label>
                <input
                  type="number"
                  value={timerMinutes}
                  onChange={(e) => setTimerMinutes(Math.max(1, parseInt(e.target.value) || 1))}
                  min="1"
                  max="60"
                  className="w-20 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <span className="text-gray-400 text-sm">minutes</span>
              </div>
            )}
          </div>

          {/* Questions */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-white font-bold text-lg">Questions ({questions.length})</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => addQuestion('text_input')}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all"
                >
                  ➕ Text Input
                </button>
                <button
                  onClick={() => addQuestion('multiple_choice')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg transition-all"
                >
                  ➕ Multiple Choice
                </button>
              </div>
            </div>

            {questions.length === 0 ? (
              <div className="text-center py-12 bg-gray-700/30 rounded-lg">
                <div className="text-4xl mb-3">📝</div>
                <p className="text-gray-400">No questions added yet. Click the buttons above to add questions.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {questions.map((question, index) => (
                  <QuestionEditor 
                    key={question.id} 
                    question={question} 
                    index={index}
                    updateQuestion={updateQuestion}
                    updateOption={updateOption}
                    removeQuestion={removeQuestion}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSaveQuiz}
            disabled={isSubmitting}
            className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Saving...' : '💾 Save Quiz'}
          </button>
        </div>
      </div>
    </div>
  );
}
