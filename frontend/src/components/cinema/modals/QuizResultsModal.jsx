// frontend/src/components/cinema/modals/QuizResultsModal.jsx
import React from 'react';

/**
 * QuizResultsModal - Student view of quiz results
 * 
 * Features:
 * - Show score and percentage
 * - Show correct/incorrect answers
 * - Show what the correct answer was
 * - Leaderboard preview (optional)
 */
export default function QuizResultsModal({
  isOpen,
  onClose,
  results,
  quiz,
}) {
  if (!isOpen || !results || !quiz) return null;

  const percentage = ((results.score / results.total) * 100).toFixed(1);
  const passed = percentage >= 50; // You can adjust passing threshold

  // Get grade emoji
  const getGradeEmoji = (pct) => {
    if (pct >= 90) return '🏆';
    if (pct >= 80) return '🌟';
    if (pct >= 70) return '👍';
    if (pct >= 60) return '👌';
    if (pct >= 50) return '📝';
    return '📚';
  };

  // Get grade text
  const getGradeText = (pct) => {
    if (pct >= 90) return 'Excellent!';
    if (pct >= 80) return 'Great Job!';
    if (pct >= 70) return 'Good Work!';
    if (pct >= 60) return 'Well Done!';
    if (pct >= 50) return 'Passed';
    return 'Keep Practicing';
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header with Score */}
        <div className="p-3 sm:p-6 border-b border-gray-700">
          <div className="text-center">
            <div className="text-4xl sm:text-6xl mb-2 sm:mb-3">{getGradeEmoji(percentage)}</div>
            <h2 className="text-white text-xl sm:text-3xl font-bold mb-2">{getGradeText(percentage)}</h2>
            <p className="text-gray-400 text-xs sm:text-sm mb-3 sm:mb-4 truncate px-2">{quiz.name}</p>
            
            {/* Score Display */}
            <div className="flex items-center justify-center gap-3 sm:gap-8">
              <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 min-w-[100px] sm:min-w-[120px]">
                <div className="text-gray-400 text-xs sm:text-sm mb-1">Your Score</div>
                <div className="text-white text-xl sm:text-3xl font-bold">
                  {results.score}/{results.total}
                </div>
              </div>
              
              <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 min-w-[100px] sm:min-w-[120px]">
                <div className="text-gray-400 text-xs sm:text-sm mb-1">Percentage</div>
                <div className={`text-xl sm:text-3xl font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}>
                  {percentage}%
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Answers Review */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          <h3 className="text-white font-bold text-base sm:text-xl mb-3 sm:mb-4">📊 Answer Review</h3>
          
          <div className="space-y-3 sm:space-y-4">
            {results.answers?.map((answer, index) => {
              // Find the question from quiz
              const question = quiz.questions?.find(q => q.id === answer.question_id);
              if (!question) return null;

              return (
                <div 
                  key={answer.question_id}
                  className={`rounded-lg p-3 sm:p-4 border-2 ${
                    answer.is_correct 
                      ? 'bg-green-900/20 border-green-600/50' 
                      : 'bg-red-900/20 border-red-600/50'
                  }`}
                >
                  {/* Question */}
                  <div className="flex items-start gap-2 sm:gap-3 mb-2 sm:mb-3">
                    <span className="text-xl sm:text-2xl flex-shrink-0">
                      {answer.is_correct ? '✅' : '❌'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-semibold text-sm sm:text-base">
                        Q{index + 1}. {question.question}
                      </p>
                      <span className={`inline-block mt-1 px-2 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs font-semibold ${
                        question.type === 'text_input' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'
                      }`}>
                        {question.type === 'text_input' ? '✍️ Text Input' : '☑️ Multiple Choice'}
                      </span>
                    </div>
                  </div>

                  {/* Your Answer */}
                  <div className="ml-6 sm:ml-10 space-y-1 sm:space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-gray-400 text-xs sm:text-sm font-semibold min-w-[80px] sm:min-w-[100px] flex-shrink-0">Your Answer:</span>
                      <span className={`text-xs sm:text-sm font-medium break-words ${
                        answer.is_correct ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {question.type === 'multiple_choice' && answer.your_answer
                          ? `${answer.your_answer}. ${question.options?.[answer.your_answer.charCodeAt(0) - 65]}`
                          : answer.your_answer || '(No answer)'}
                      </span>
                    </div>

                    {/* Correct Answer (if wrong) */}
                    {!answer.is_correct && (
                      <div className="flex items-start gap-2">
                        <span className="text-gray-400 text-xs sm:text-sm font-semibold min-w-[80px] sm:min-w-[100px] flex-shrink-0">Correct Answer:</span>
                        <span className="text-green-400 text-xs sm:text-sm font-medium break-words">
                          {question.type === 'multiple_choice'
                            ? `${answer.correct_answer}. ${question.options?.[answer.correct_answer.charCodeAt(0) - 65]}`
                            : answer.correct_answer}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-center p-3 sm:p-6 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-6 sm:px-8 py-2 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all text-sm sm:text-base"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
