// frontend/src/components/cinema/modals/TakeQuizModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-hot-toast';

/**
 * TakeQuizModal - Student interface for taking quizzes
 * 
 * Features:
 * - Full-screen locked modal (no escape/click-outside/back button)
 * - Display all questions at once (scrollable)
 * - Timer countdown with 30s warning and auto-submit
 * - Submit answers with confirmation
 * - Show results after submission with ✅/❌ indicators
 * - localStorage recovery for reconnections
 */
export default function TakeQuizModal({
  isOpen,
  onClose,
  quiz,
  results, // Results from backend after submission
  sendMessage,
  currentUser,
  onAutoSubmit, // Callback for host ending quiz
}) {
  const [answers, setAnswers] = useState({});
  const [timeRemaining, setTimeRemaining] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasWarned30s, setHasWarned30s] = useState(false);
  const timerRef = useRef(null);
  const hasAutoSubmittedRef = useRef(false);

  // LocalStorage key for this quiz
  const storageKey = `quiz_answers_${quiz?.id}`;

  // DISABLED: Don't recover answers from localStorage - students should start fresh
  // Previously this was recovering host's correct answers which showed in the input fields
  // useEffect(() => {
  //   if (!isOpen || !quiz) return;
  //   
  //   const savedAnswers = localStorage.getItem(storageKey);
  //   if (savedAnswers) {
  //     try {
  //       const parsed = JSON.parse(savedAnswers);
  //       setAnswers(parsed);
  //       console.log('📝 [TakeQuiz] Recovered saved answers:', parsed);
  //       toast.success('Continue from where you left off', { duration: 2000 });
  //     } catch (err) {
  //       console.error('Failed to parse saved answers:', err);
  //     }
  //   }
  // }, [isOpen, quiz, storageKey]);

  // Save answers to localStorage whenever they change
  useEffect(() => {
    if (!isOpen || !quiz) return;
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(storageKey, JSON.stringify(answers));
    }
  }, [answers, isOpen, quiz, storageKey]);

  // Initialize timer if enabled
  useEffect(() => {
    if (isOpen && quiz?.timer_enabled && quiz?.timer_seconds) {
      setTimeRemaining(quiz.timer_seconds);
    }
  }, [isOpen, quiz]);

  // Timer countdown
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      return;
    }

    timerRef.current = setInterval(() => {
      setTimeRemaining(prev => {
        const newTime = prev - 1;

        // Warning at 30 seconds
        if (newTime === 30 && !hasWarned30s) {
          toast.error('⏰ 30 seconds remaining!', { duration: 3000 });
          setHasWarned30s(true);
        }

        // Auto-submit at 0
        if (newTime <= 0 && !hasAutoSubmittedRef.current) {
          hasAutoSubmittedRef.current = true;
          toast.error("⏰ Time's up! Submitting...", { duration: 3000 });
          setTimeout(() => handleSubmit(true), 500); // Slight delay for toast
        }

        return Math.max(0, newTime);
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timeRemaining, hasWarned30s]);

  // When results received, just clear localStorage and stop timer - DON'T close modal
  useEffect(() => {
    console.log('📝 [TakeQuiz] Results effect - results:', results, 'isSubmitting:', isSubmitting);
    
    if (results && isSubmitting) {
      console.log('📝 [TakeQuiz] Results received, preparing to show in modal:', results);
      
      // Clear localStorage after successful submission
      localStorage.removeItem(storageKey);
      console.log('📝 [TakeQuiz] localStorage cleared');
      
      // Stop timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        console.log('📝 [TakeQuiz] Timer stopped');
      }
      
      // Stop submitting state - modal stays open to show results
      setIsSubmitting(false);
      console.log('📝 [TakeQuiz] Showing results in modal');
    }
  }, [results, isSubmitting, storageKey]);

  // Prevent modal close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen]);

  // Prevent browser back button
  useEffect(() => {
    if (!isOpen) return;
    
    const handlePopState = (e) => {
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };

    window.addEventListener('popstate', handlePopState);
    window.history.pushState(null, '', window.location.href);

    return () => window.removeEventListener('popstate', handlePopState);
  }, [isOpen]);

  // Handle host ending quiz (auto-submit)
  useEffect(() => {
    if (onAutoSubmit) {
      // This will be called by parent when quiz_ended message is received
      // For now, we'll handle it in the parent component
    }
  }, [onAutoSubmit]);

  if (!isOpen || !quiz) return null;

  // Format time as MM:SS
  const formatTime = (seconds) => {
    if (seconds === null) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle answer selection
  const handleAnswerChange = (questionId, answer) => {
    if (isSubmitting) return; // Prevent changes during submission
    
    setAnswers(prev => ({
      ...prev,
      [questionId]: answer
    }));
  };

  // Count answered questions
  const answeredCount = Object.keys(answers).filter(qId => {
    const answer = answers[qId];
    return answer && answer.trim() !== '';
  }).length;

  // Handle submit
  const handleSubmit = async (isAutoSubmit = false) => {
    if (isSubmitting || !isOpen) return; // Prevent double-submission

    console.log('📝 [TakeQuiz] handleSubmit called, isAutoSubmit:', isAutoSubmit);
    console.log('📝 [TakeQuiz] Current answers:', answers);

    // Check for unanswered questions
    const unansweredCount = quiz.questions.length - answeredCount;

    // Show confirmation if not auto-submit
    if (!isAutoSubmit) {
      let confirmMsg = 'Are you sure you want to submit your quiz?';
      if (unansweredCount > 0) {
        confirmMsg = `You have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}. Submit anyway?`;
      }
      
      if (!window.confirm(confirmMsg)) {
        console.log('📝 [TakeQuiz] Submission cancelled by user');
        return;
      }
    }

    setIsSubmitting(true);
    console.log('📝 [TakeQuiz] isSubmitting set to true');

    // Build answers array in backend format
    const formattedAnswers = quiz.questions.map(q => ({
      question_id: q.id,
      answer: answers[q.id] || '', // Send empty string if unanswered
    }));

    console.log('📝 [TakeQuiz] Submitting answers:', formattedAnswers);
    console.log('📝 [TakeQuiz] Sending quiz_submit message...');
    console.log('📝 [TakeQuiz] Quiz object:', quiz);
    console.log('📝 [TakeQuiz] Using quiz_id:', quiz.quiz_id || quiz.id);

    // Send quiz_submit message
    sendMessage({
      type: 'quiz_submit',
      data: {
        quiz_id: quiz.quiz_id || quiz.id, // Use quiz_id field from quiz_data response
        answers: formattedAnswers,
      }
    });

    console.log('📝 [TakeQuiz] quiz_submit message sent, waiting for results...');
    // Results will be received via quiz_results WebSocket message
    // The parent component will pass it as the 'results' prop
  };

  // QUIZ TAKING VIEW
  if (!isOpen || !quiz) return null;

  // RESULTS VIEW - Show after submission
  if (results) {
    const percentage = ((results.score / results.total) * 100).toFixed(1);
    const passed = percentage >= 60; // 60% passing grade
    
    return (
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-2xl bg-gray-900 text-white rounded-lg overflow-hidden">
          {/* Results Header */}
          <div className={`p-6 text-center ${passed ? 'bg-green-600' : 'bg-orange-600'}`}>
            <div className="text-6xl mb-4">{passed ? '🎉' : '📚'}</div>
            <h2 className="text-3xl font-bold mb-2">{quiz.name}</h2>
            <div className="text-5xl font-bold mb-2">{percentage}%</div>
            <div className="text-xl opacity-90">{results.score} out of {results.total} correct</div>
          </div>

          {/* Question-by-Question Results */}
          <div className="p-6 max-h-96 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4">📋 Detailed Results</h3>
            {results.answers.map((answer, index) => {
              const question = quiz.questions.find(q => q.id === answer.question_id);
              return (
                <div key={answer.question_id} className={`mb-4 p-4 rounded-lg border-2 ${
                  answer.is_correct ? 'bg-green-900/30 border-green-600' : 'bg-red-900/30 border-red-600'
                }`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <span className="font-semibold">Q{index + 1}:</span> {question?.question || 'Question'}
                    </div>
                    <span className="text-2xl">{answer.is_correct ? '✅' : '❌'}</span>
                  </div>
                  <div className="text-sm opacity-90">
                    <strong>Your answer:</strong> {answer.answer || '(blank)'}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Close Button */}
          <div className="p-6 border-t border-gray-700">
            <button
              onClick={onClose}
              className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg transition-colors"
            >
              ✓ Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // QUIZ TAKING VIEW
  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90"
      onClick={(e) => e.stopPropagation()} // Prevent click-outside
    >
      <div className="w-full h-full max-w-4xl flex flex-col bg-gray-900 text-white">
        {/* Header */}
        <div className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-pink-600 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xl font-bold">📝 {quiz.name}</h2>
            
            {/* Timer */}
            {timeRemaining !== null && (
              <div className={`text-2xl font-mono font-bold px-4 py-2 rounded-lg ${
                timeRemaining <= 30 
                  ? 'bg-red-600 text-white animate-pulse' 
                  : 'bg-white/20'
              }`}>
                ⏱️ {formatTime(timeRemaining)}
              </div>
            )}
          </div>

          {/* Progress */}
          <div className="text-sm opacity-90">
            {answeredCount}/{quiz.questions.length} answered
          </div>
        </div>

        {/* Questions */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {quiz.questions.map((question, index) => (
            <div key={question.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="font-semibold text-lg mb-3">
                ❓ Question {index + 1} of {quiz.questions.length}
              </div>
              <div className="text-gray-200 mb-4">
                {question.question}
              </div>

              {/* Multiple Choice */}
              {question.type === 'multiple_choice' && (
                <div className="space-y-2">
                  {question.options.map((option, optIndex) => {
                    const optionLetter = String.fromCharCode(65 + optIndex); // A, B, C, D
                    const isSelected = answers[question.id] === optionLetter;

                    return (
                      <label
                        key={optIndex}
                        className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
                          isSelected 
                            ? 'bg-purple-600 text-white' 
                            : 'bg-gray-700 hover:bg-gray-600'
                        } ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="radio"
                          name={`question_${question.id}`}
                          value={optionLetter}
                          checked={isSelected}
                          onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                          disabled={isSubmitting}
                          className="w-5 h-5 flex-shrink-0"
                        />
                        <span className="flex-1">
                          <span className="font-semibold">{optionLetter}.</span> {option}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* Text Input */}
              {question.type === 'text_input' && (
                <input
                  type="text"
                  value={answers[question.id] || ''}
                  onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                  disabled={isSubmitting}
                  className={`w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                    isSubmitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                  placeholder=""
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 p-4 bg-gray-800 border-t border-gray-700">
          <button
            onClick={() => handleSubmit(false)}
            disabled={isSubmitting}
            className={`w-full py-3 font-semibold rounded-lg transition-all ${
              isSubmitting
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {isSubmitting ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Submitting...
              </span>
            ) : (
              '⏹️ Submit Quiz'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
