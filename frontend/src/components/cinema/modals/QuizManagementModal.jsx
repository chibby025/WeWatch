// frontend/src/components/cinema/modals/QuizManagementModal.jsx
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

/**
 * QuizManagementModal - Interface for managing quizzes (Host) and viewing quizzes (Member)
 * 
 * Host Features:
 * - List all quizzes (draft, in_progress, completed)
 * - Publish draft quizzes
 * - End active quizzes
 * - View real-time quiz progress
 * - View quiz results/leaderboard
 * - Create new quiz (opens MakeQuizModal)
 * 
 * Member Features:
 * - Active tab: View and take active quizzes
 * - Completed tab: View past quiz submissions with scores
 */
export default function QuizManagementModal({
  isOpen,
  onClose,
  isHost = false,
  quizzes = [], // All quizzes for this session
  activeQuiz = null, // Currently in-progress quiz
  quizProgress = null, // Progress data for active quiz {submitted_count, average_score, time_remaining}
  quizHistory: quizHistoryProp = { active_quizzes: [], completed_submissions: [] }, // Member's quiz history from backend
  onCreateQuiz,
  onPublishQuiz,
  onEndQuiz,
  onViewResults,
  onTakeQuiz,
  sendMessage,
  currentUser,
  sessionId,
  quizExportData = null, // ✅ Export data from parent (PositionCalculatorPage)
}) {
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('active'); // 'active' | 'completed'
  const [quizHistory, setQuizHistory] = useState(quizHistoryProp);
  const [exportingQuizId, setExportingQuizId] = useState(null);
  const [viewResultsQuiz, setViewResultsQuiz] = useState(null); // ✅ Quiz to view detailed results
  const [resultsData, setResultsData] = useState(null); // ✅ Detailed results from backend
  const [showExportDropdown, setShowExportDropdown] = useState(null); // ✅ Quiz ID for which dropdown is shown
  const [exportFormat, setExportFormat] = useState('pdf'); // ✅ 'pdf' or 'docx' for next export

  if (!isOpen) return null;

  // ✅ Handle quiz export data from backend
  const handleExportData = (data) => {
    const exportData = {
      quiz: {
        id: data.quiz.id,
        name: data.quiz.name,
        status: data.quiz.status,
        timer_enabled: data.quiz.timer_enabled,
        timer_seconds: data.quiz.timer_seconds,
        questions: data.quiz.questions,
        created_at: data.quiz.created_at,
        published_at: data.quiz.published_at,
        ended_at: data.quiz.ended_at
      },
      responses: data.responses || [],
      statistics: {
        total_submissions: data.submitted_count || 0,
        average_score: data.average_score || 0,
        pass_rate: data.pass_rate || 0,
        total_questions: data.quiz.questions?.length || 0
      },
      exported_at: new Date().toISOString(),
      exported_by: currentUser?.username || 'Unknown'
    };
    
    // ✅ If we're viewing results, store the data for the modal
    if (viewResultsQuiz && data.quiz.id === viewResultsQuiz.id) {
      console.log('📊 [QuizManagement] Received results data for viewing:', exportData);
      setResultsData(exportData);
      toast.dismiss();
      toast.success('Results loaded!');
      return;
    }
    
    // ✅ Export based on format preference (PDF or DOCX)
    const quiz = { id: data.quiz.id, name: data.quiz.name };
    if (exportFormat === 'docx') {
      handleExportDOCX(quiz, exportData);
    } else {
      handleExportPDF(quiz, exportData);
    }
    setExportingQuizId(null);
    setExportFormat('pdf'); // Reset to default
  };

  // ✅ Export single quiz
  const handleExportQuiz = (quiz) => {
    if (!sendMessage) {
      toast.error('Cannot export: WebSocket not connected');
      return;
    }
    
    setExportingQuizId(quiz.id);
    toast.loading('Exporting quiz results...', { id: `export-${quiz.id}` });
    
    sendMessage({
      type: 'quiz_export_request',
      data: { quiz_id: quiz.id }
    });
  };

  // ✅ Export all completed quizzes
  const handleExportAll = () => {
    if (completedQuizzes.length === 0) {
      toast.error('No completed quizzes to export');
      return;
    }
    
    completedQuizzes.forEach(quiz => {
      setTimeout(() => handleExportQuiz(quiz), 100); // Stagger requests
    });
    
    toast.success(`Exporting ${completedQuizzes.length} quizzes...`);
  };

  // ✅ Listen for export data from parent (PositionCalculatorPage)
  useEffect(() => {
    if (quizExportData && viewResultsQuiz && quizExportData.quiz.id === viewResultsQuiz.id) {
      console.log('📊 [QuizManagement] Received export data for viewing:', quizExportData);
      setResultsData(quizExportData);
      toast.dismiss();
      toast.success('Results loaded!');
    }
  }, [quizExportData, viewResultsQuiz]);

  // Update local quiz history when prop changes
  useEffect(() => {
    setQuizHistory(quizHistoryProp);
  }, [quizHistoryProp]);

  // Request quiz history for members when modal opens
  useEffect(() => {
    if (!isHost && isOpen && sendMessage && sessionId) {
      console.log('📚 [QuizManagement] Member requesting quiz history for session:', sessionId);
      sendMessage({
        type: 'quiz_history_request',
        data: { session_id: sessionId }
      });
    }
  }, [isHost, isOpen, sendMessage, sessionId]);

  // Listen for quiz_history response (for members)
  useEffect(() => {
    if (!isHost) {
      // This will be populated by the WebSocket handler in PositionCalculatorPage
      // For now, we'll use quizzes prop as fallback
      const activeQuizzes = quizzes.filter(q => q.status === 'in_progress');
      setQuizHistory(prev => ({
        ...prev,
        active_quizzes: activeQuizzes
      }));
    }
  }, [isHost, quizzes]);

  // ✅ Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showExportDropdown && !e.target.closest('.export-dropdown-container')) {
        setShowExportDropdown(null);
      }
    };
    
    if (showExportDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExportDropdown]);

  // Categorize quizzes
  const draftQuizzes = quizzes.filter(q => q.status === 'draft');
  const inProgressQuizzes = quizzes.filter(q => q.status === 'in_progress');
  const completedQuizzes = quizzes.filter(q => q.status === 'completed');

  // Check if there's an active quiz (only one active quiz at a time)
  const hasActiveQuiz = inProgressQuizzes.length > 0;

  const handlePublishQuiz = async (quizId) => {
    if (!sendMessage) return;
    
    console.log('📝 [QuizManagement] Publishing quiz with ID:', quizId, 'type:', typeof quizId);
    
    setIsLoading(true);
    try {
      sendMessage({
        type: 'quiz_publish',
        data: { quiz_id: quizId }
      });
      console.log('📝 [QuizManagement] Sent publish message for quiz:', quizId);
    } catch (error) {
      console.error('❌ [QuizManagement] Error publishing quiz:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndQuiz = async (quizId) => {
    if (!sendMessage) return;
    
    const confirmed = window.confirm('Are you sure you want to end this quiz? Students can no longer submit answers.');
    if (!confirmed) return;
    
    setIsLoading(true);
    try {
      sendMessage({
        type: 'quiz_end',
        data: { quiz_id: quizId }
      });
      console.log('📝 [QuizManagement] Ended quiz:', quizId);
    } catch (error) {
      console.error('❌ [QuizManagement] Error ending quiz:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestProgress = (quizId) => {
    if (!sendMessage) return;
    
    sendMessage({
      type: 'quiz_progress',
      data: { quiz_id: quizId }
    });
  };

  const handleEditQuiz = (quizId) => {
    // TODO: Implement edit functionality
    console.log('📝 [QuizManagement] Edit quiz:', quizId);
    alert('Edit functionality coming soon!');
  };

  // ✅ Export results as PDF
  const handleExportPDF = (quiz, data) => {
    try {
      // Create HTML content for PDF
      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Quiz Results - ${quiz.name}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
    h1 { color: #1e40af; border-bottom: 3px solid #1e40af; padding-bottom: 10px; }
    .header { margin-bottom: 30px; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
    .stat-box { background: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; }
    .stat-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
    .stat-value { font-size: 24px; font-weight: bold; color: #1f2937; }
    .submissions { margin-top: 20px; }
    .submission { background: #f9fafb; border-left: 4px solid #3b82f6; padding: 15px; margin-bottom: 15px; }
    .submission.passed { border-left-color: #10b981; }
    .submission.failed { border-left-color: #ef4444; }
    .student-name { font-weight: bold; font-size: 16px; margin-bottom: 5px; }
    .score { font-size: 20px; font-weight: bold; }
    .score.passed { color: #10b981; }
    .score.failed { color: #ef4444; }
    .timestamp { font-size: 12px; color: #6b7280; }
    .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; }
    @media print {
      .stat-box { break-inside: avoid; }
      .submission { break-inside: avoid; page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 Quiz Results: ${quiz.name}</h1>
    <p>Exported on ${new Date().toLocaleString()}</p>
  </div>

  <div class="stats">
    <div class="stat-box">
      <div class="stat-label">Total Submissions</div>
      <div class="stat-value">${data.statistics.total_submissions}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Average Score</div>
      <div class="stat-value">${data.statistics.average_score.toFixed(1)}/${data.statistics.total_questions}</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Pass Rate</div>
      <div class="stat-value">${data.statistics.pass_rate.toFixed(1)}%</div>
    </div>
    <div class="stat-box">
      <div class="stat-label">Questions</div>
      <div class="stat-value">${data.statistics.total_questions}</div>
    </div>
  </div>

  <h2>👥 Student Submissions</h2>
  <div class="submissions">
    ${data.responses && data.responses.length > 0 
      ? data.responses.map(response => {
          const percentage = ((response.score / data.statistics.total_questions) * 100).toFixed(1);
          const passed = percentage >= 50;
          return `
            <div class="submission ${passed ? 'passed' : 'failed'}">
              <div class="student-name">${response.username || 'Anonymous'}</div>
              <div class="score ${passed ? 'passed' : 'failed'}">${response.score}/${data.statistics.total_questions} (${percentage}%)</div>
              <div class="timestamp">Submitted: ${new Date(response.submitted_at).toLocaleString()}</div>
              <div style="margin-top: 10px;">
                <span style="color: #10b981;">✓ ${response.score} correct</span> • 
                <span style="color: #ef4444;">✗ ${data.statistics.total_questions - response.score} incorrect</span>
              </div>
            </div>
          `;
        }).join('')
      : '<p>No submissions yet.</p>'
    }
  </div>

  <div class="footer">
    Generated by WeWatch Lecture Hall System
  </div>
</body>
</html>
      `;

      // Create blob and download
      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `quiz_${quiz.name.replace(/[^a-z0-9]/gi, '_')}_results_${Date.now()}.html`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('📄 HTML file downloaded! Open it and use your browser\'s "Print to PDF" feature');
    } catch (error) {
      console.error('Export PDF error:', error);
      toast.error('Failed to export PDF');
    }
  };

  // ✅ Export results as DOCX-compatible format
  const handleExportDOCX = (quiz, data) => {
    try {
      // Create rich text content compatible with Word
      const docContent = `Quiz Results: ${quiz.name}
Exported on ${new Date().toLocaleString()}
${'='.repeat(60)}

STATISTICS SUMMARY
${'='.repeat(60)}
Total Submissions: ${data.statistics.total_submissions}
Average Score: ${data.statistics.average_score.toFixed(1)}/${data.statistics.total_questions}
Pass Rate: ${data.statistics.pass_rate.toFixed(1)}%
Total Questions: ${data.statistics.total_questions}

STUDENT SUBMISSIONS
${'='.repeat(60)}

${data.responses && data.responses.length > 0 
  ? data.responses.map((response, idx) => {
      const percentage = ((response.score / data.statistics.total_questions) * 100).toFixed(1);
      const passed = percentage >= 50;
      return `${idx + 1}. ${response.username || 'Anonymous'}
   Score: ${response.score}/${data.statistics.total_questions} (${percentage}%)
   Status: ${passed ? 'PASSED ✓' : 'FAILED ✗'}
   Submitted: ${new Date(response.submitted_at).toLocaleString()}
   Breakdown: ${response.score} correct, ${data.statistics.total_questions - response.score} incorrect
${'—'.repeat(60)}
`;
    }).join('\n')
  : 'No submissions yet.\n'
}

${'='.repeat(60)}
Generated by WeWatch Lecture Hall System
      `;

      // Create blob with RTF format for better Word compatibility
      const blob = new Blob([docContent], { type: 'application/rtf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const filename = `quiz_${quiz.name.replace(/[^a-z0-9]/gi, '_')}_results_${Date.now()}.rtf`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('📝 Document exported! Can be opened in Microsoft Word or Google Docs');
    } catch (error) {
      console.error('Export DOCX error:', error);
      toast.error('Failed to export document');
    }
  };

  const handleDeleteQuiz = async (quizId) => {
    if (!sendMessage) return;
    
    const confirmed = window.confirm('Are you sure you want to delete this quiz? This cannot be undone.');
    if (!confirmed) return;
    
    setIsLoading(true);
    try {
      sendMessage({
        type: 'quiz_delete',
        data: { quiz_id: quizId }
      });
      console.log('📝 [QuizManagement] Deleted quiz:', quizId);
    } catch (error) {
      console.error('❌ [QuizManagement] Error deleting quiz:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const QuizCard = ({ quiz, status }) => (
    <div className="bg-gray-700/50 rounded-lg p-3 sm:p-4 hover:bg-gray-700/70 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <h4 className="text-white font-semibold text-base sm:text-lg mb-1 truncate">{quiz.name}</h4>
          <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-gray-400 flex-wrap">
            <span>📝 {quiz.total_questions || quiz.questions?.length || 0} questions</span>
            {quiz.timer_enabled && (
              <span>⏱️ {Math.floor((quiz.timer_seconds || 0) / 60)} min</span>
            )}
          </div>
        </div>
        <span className={`px-2 sm:px-3 py-1 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap flex-shrink-0 ${
          status === 'draft' ? 'bg-gray-600 text-gray-300' :
          status === 'in_progress' ? 'bg-green-600 text-white animate-pulse' :
          'bg-blue-600 text-white'
        }`}>
          {status === 'draft' ? '📋 Draft' :
           status === 'in_progress' ? '🟢 Live' :
           '✅ Completed'}
        </span>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2 mt-3">
        {status === 'draft' && (
          <>
            {!hasActiveQuiz ? (
              <button
                onClick={() => handlePublishQuiz(quiz.id)}
                disabled={isLoading}
                className="flex-1 px-2 sm:px-4 py-1.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50"
              >
                <span className="hidden sm:inline">📢 Publish Quiz</span>
                <span className="sm:hidden">📢 Publish</span>
              </button>
            ) : (
              <div className="flex-1 px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-600 text-gray-400 text-xs sm:text-sm font-medium rounded-lg text-center">
                <span className="hidden sm:inline">⏳ End active quiz first</span>
                <span className="sm:hidden">⏳ Quiz active</span>
              </div>
            )}
            <button
              onClick={() => handleEditQuiz(quiz.id)}
              disabled={isLoading}
              className="px-2 sm:px-4 py-1.5 sm:py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDeleteQuiz(quiz.id)}
              disabled={isLoading}
              className="px-2 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              🗑️
            </button>
          </>
        )}
        
        {status === 'in_progress' && (
          <>
            <button
              onClick={() => handleRequestProgress(quiz.id)}
              className="flex-1 px-2 sm:px-4 py-1.5 sm:py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all"
            >
              <span className="hidden sm:inline">📊 View Progress</span>
              <span className="sm:hidden">📊 Progress</span>
            </button>
            <button
              onClick={() => handleEndQuiz(quiz.id)}
              disabled={isLoading}
              className="px-2 sm:px-4 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50"
            >
              <span className="hidden sm:inline">🛑 End Quiz</span>
              <span className="sm:hidden">🛑 End</span>
            </button>
          </>
        )}
        
        {/* Show progress stats for in-progress quiz */}
        {status === 'in_progress' && quizProgress && quizProgress.quiz_id === quiz.id && (
          <div className="mt-3 pt-3 border-t border-gray-600">
            <div className="grid grid-cols-2 gap-2 sm:gap-3 text-xs sm:text-sm">
              <div className="bg-gray-600/50 rounded-lg p-2">
                <div className="text-gray-400 text-[10px] sm:text-xs mb-1">✍️ Submissions</div>
                <div className="text-white font-bold text-base sm:text-lg">{quizProgress.submitted_count || 0}</div>
              </div>
              <div className="bg-gray-600/50 rounded-lg p-2">
                <div className="text-gray-400 text-[10px] sm:text-xs mb-1">🎯 Average Score</div>
                <div className="text-white font-bold text-base sm:text-lg">
                  {quizProgress.average_score != null ? quizProgress.average_score.toFixed(1) : '0.0'}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {status === 'completed' && (
          <>
            {/* Export Dropdown */}
            <div className="flex-1 relative export-dropdown-container">
              <button
                onClick={() => setShowExportDropdown(showExportDropdown === quiz.id ? null : quiz.id)}
                disabled={exportingQuizId === quiz.id}
                className="w-full px-2 sm:px-4 py-1.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-1"
              >
                {exportingQuizId === quiz.id ? (
                  <span>⏳ Exporting...</span>
                ) : (
                  <>
                    <img src="/icons/export.svg" alt="" className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Export Results</span>
                    <span className="sm:hidden">Export</span>
                    <span className="text-xs">▼</span>
                  </>
                )}
              </button>
              
              {/* Dropdown Menu */}
              {showExportDropdown === quiz.id && exportingQuizId !== quiz.id && (
                <div className="absolute top-full left-0 mt-1 w-full bg-gray-700 border border-gray-600 rounded-lg shadow-xl overflow-hidden z-50">
                  <button
                    onClick={() => {
                      setShowExportDropdown(null);
                      setExportFormat('pdf');
                      handleExportQuiz(quiz);
                    }}
                    className="w-full px-3 sm:px-4 py-2 text-left text-white hover:bg-gray-600 transition-colors text-xs sm:text-sm border-b border-gray-600 flex items-center gap-2"
                  >
                    <img src="/icons/export.svg" alt="" className="w-3 h-3 sm:w-4 sm:h-4" />
                    Export as PDF
                  </button>
                  <button
                    onClick={() => {
                      setShowExportDropdown(null);
                      setExportFormat('docx');
                      handleExportQuiz(quiz);
                    }}
                    className="w-full px-3 sm:px-4 py-2 text-left text-white hover:bg-gray-600 transition-colors text-xs sm:text-sm flex items-center gap-2"
                  >
                    <img src="/icons/export.svg" alt="" className="w-3 h-3 sm:w-4 sm:h-4" />
                    Export as DOCX
                  </button>
                </div>
              )}
            </div>
            
            <button
              onClick={() => {
                // Request quiz results from backend and show detailed modal
                console.log('📊 [QuizManagement] Requesting detailed results for quiz:', quiz.id);
                setViewResultsQuiz(quiz);
                
                // Request full results data from backend
                sendMessage?.({
                  type: 'quiz_export_request',
                  data: { quiz_id: quiz.id }
                });
                
                toast('Loading quiz results...');
              }}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <img src="/icons/results.svg" alt="" className="w-4 h-4" />
              View Results
            </button>
          </>
        )}
      </div>

      {/* Additional Info for Completed Quizzes */}
      {status === 'completed' && quiz.stats && (
        <div className="mt-3 pt-3 border-t border-gray-600 text-sm text-gray-400">
          <div className="flex items-center justify-between">
            <span>{quiz.stats.total_submissions || 0} submissions</span>
            <span>Avg: {quiz.stats.average_score?.toFixed(1) || 0}/{quiz.total_questions || 0}</span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-4xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <div>
            <h2 className="text-white text-2xl font-bold flex items-center gap-2">
              <img src="/icons/quizmgt.svg" alt="" className="w-6 h-6" />
              {isHost ? 'Quiz Management' : 'Quizzes'}
            </h2>
            <p className="text-gray-400 text-sm mt-1">
              {isHost 
                ? 'Create, publish, and manage quizzes for your lecture'
                : 'Take active quizzes and view your results'
              }
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isHost && (
              <button
                onClick={onCreateQuiz}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-all"
              >
                ➕ Create New Quiz
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white text-3xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Member Tabs */}
        {!isHost && (
          <div className="flex border-b border-gray-700 px-6">
            <button
              onClick={() => setActiveTab('active')}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'active'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🟢 Active Quizzes
            </button>
            <button
              onClick={() => setActiveTab('completed')}
              className={`px-6 py-3 font-semibold transition-all ${
                activeTab === 'completed'
                  ? 'text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ✅ Completed
            </button>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isHost ? (
            // HOST VIEW - Show all quizzes by status
            <>
              {/* Active Quiz Section */}
              {inProgressQuizzes.length > 0 && (
                <div>
                  <h3 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                    <span className="animate-pulse">🟢</span> Active Quiz
                  </h3>
                  <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 mb-3">
                    <p className="text-blue-300 text-sm">
                      💡 <strong>Tip:</strong> You can create new quizzes (as drafts) while this quiz is active. They'll be ready to publish when this one ends.
                    </p>
                  </div>
                  <div className="space-y-3">
                    {inProgressQuizzes.map(quiz => (
                      <QuizCard key={quiz.id} quiz={quiz} status="in_progress" />
                    ))}
                  </div>
                </div>
              )}

              {/* Draft Quizzes Section */}
              {draftQuizzes.length > 0 && (
                <div>
                  <h3 className="text-white font-bold text-lg mb-3">📋 Draft Quizzes</h3>
                  <div className="space-y-3">
                    {draftQuizzes.map(quiz => (
                      <QuizCard key={quiz.id} quiz={quiz} status="draft" />
                    ))}
                  </div>
                </div>
              )}

              {/* Completed Quizzes Section */}
              {completedQuizzes.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold text-lg">✅ Completed Quizzes</h3>
                    <button
                      onClick={handleExportAll}
                      className="px-3 sm:px-4 py-1.5 sm:py-2 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-all"
                    >
                      <span className="hidden sm:inline">📥 Export All Results</span>
                      <span className="sm:hidden">📥 Export All</span>
                    </button>
                  </div>
                  <div className="space-y-3">
                    {completedQuizzes.map(quiz => (
                      <QuizCard key={quiz.id} quiz={quiz} status="completed" />
                    ))}
                  </div>
                </div>
              )}

              {/* Empty State */}
              {quizzes.length === 0 && (
                <div className="text-center py-12">
                  <div className="text-6xl mb-4">📝</div>
                  <h3 className="text-white text-xl font-semibold mb-2">No quizzes yet</h3>
                  <p className="text-gray-400">Click the "Create New Quiz" button above to get started</p>
                </div>
              )}
            </>
          ) : (
            // MEMBER VIEW - Show active or completed tab
            <>
              {activeTab === 'active' && (
                <div>
                  {inProgressQuizzes.length > 0 ? (
                    <div className="space-y-3">
                      {inProgressQuizzes.map(quiz => (
                        <div key={quiz.id} className="bg-gray-700/50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="text-white font-semibold text-lg mb-1">{quiz.name}</h4>
                              <div className="flex items-center gap-3 text-sm text-gray-400">
                                <span>📝 {quiz.total_questions || quiz.questions?.length || 0} questions</span>
                                {quiz.timer_enabled && (
                                  <span>⏱️ {Math.floor((quiz.timer_seconds || 0) / 60)} min</span>
                                )}
                              </div>
                            </div>
                            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-600 text-white animate-pulse">
                              🟢 Live
                            </span>
                          </div>
                          <button
                            onClick={() => onTakeQuiz?.(quiz)}
                            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all"
                          >
                            📝 Take Quiz
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📚</div>
                      <h3 className="text-white text-xl font-semibold mb-2">No active quizzes</h3>
                      <p className="text-gray-400">Check back later when the host starts a quiz</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'completed' && (
                <div>
                  {quizHistory.completed_submissions.length > 0 ? (
                    <div className="space-y-3">
                      {quizHistory.completed_submissions.map((submission, idx) => (
                        <div key={idx} className="bg-gray-700/50 rounded-lg p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              <h4 className="text-white font-semibold text-lg mb-1">{submission.quiz_name}</h4>
                              <div className="flex items-center gap-3 text-sm text-gray-400">
                                <span>📊 Score: {submission.score}/{submission.total_questions}</span>
                                <span>🎯 {submission.percentage}%</span>
                                <span>📅 {new Date(submission.submitted_at).toLocaleDateString()}</span>
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-sm">
                            <div className="bg-gray-600/50 rounded p-2 text-center">
                              <div className="text-gray-400 text-xs">Score</div>
                              <div className="text-white font-bold">{submission.score}/{submission.total_questions}</div>
                            </div>
                            <div className="bg-gray-600/50 rounded p-2 text-center">
                              <div className="text-gray-400 text-xs">Percentage</div>
                              <div className="text-white font-bold">{submission.percentage}%</div>
                            </div>
                            <div className="bg-gray-600/50 rounded p-2 text-center">
                              <div className="text-gray-400 text-xs">Status</div>
                              <div className="text-green-400 font-bold">✅ Submitted</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="text-6xl mb-4">📋</div>
                      <h3 className="text-white text-xl font-semibold mb-2">No completed quizzes</h3>
                      <p className="text-gray-400">Your submitted quizzes will appear here</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ✅ Quiz Results Modal Overlay */}
      {viewResultsQuiz && resultsData && (
        <div className="absolute inset-0 bg-black/90 z-10 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-gray-900 rounded-lg w-full max-w-5xl max-h-[95vh] sm:max-h-[90vh] overflow-hidden flex flex-col border-2 border-blue-500/50">
            {/* Header */}
            <div className="p-3 sm:p-4 md:p-6 border-b border-gray-700 bg-gradient-to-r from-blue-900/50 to-purple-900/50">
              <div className="flex justify-between items-start mb-3 sm:mb-4">
                <div className="flex-1 min-w-0 pr-2">
                  <h3 className="text-white text-base sm:text-xl md:text-2xl font-bold mb-1 sm:mb-2 truncate flex items-center gap-2">
                    <img src="/icons/results.svg" alt="" className="w-5 h-5 sm:w-6 sm:h-6" />
                    Quiz Results
                  </h3>
                  <p className="text-gray-300 text-xs sm:text-sm truncate">
                    {viewResultsQuiz.name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setViewResultsQuiz(null);
                    setResultsData(null);
                  }}
                  className="text-gray-400 hover:text-white text-2xl sm:text-3xl leading-none flex-shrink-0"
                >
                  ×
                </button>
              </div>

              {/* Statistics Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
                <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 md:p-4">
                  <div className="text-gray-400 text-[10px] sm:text-xs mb-1">Submissions</div>
                  <div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
                    {resultsData.statistics.total_submissions}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 md:p-4">
                  <div className="text-gray-400 text-[10px] sm:text-xs mb-1">Avg Score</div>
                  <div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
                    {resultsData.statistics.average_score.toFixed(1)}/{resultsData.statistics.total_questions}
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 md:p-4">
                  <div className="text-gray-400 text-[10px] sm:text-xs mb-1">Pass Rate</div>
                  <div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
                    {resultsData.statistics.pass_rate.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-2 sm:p-3 md:p-4">
                  <div className="text-gray-400 text-[10px] sm:text-xs mb-1">Questions</div>
                  <div className="text-white text-lg sm:text-xl md:text-2xl font-bold">
                    {resultsData.statistics.total_questions}
                  </div>
                </div>
              </div>
            </div>

            {/* Student Submissions */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">
              <h4 className="text-white font-bold text-sm sm:text-base md:text-lg mb-3 sm:mb-4">👥 Student Submissions</h4>
              
              {resultsData.responses && resultsData.responses.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {resultsData.responses.map((response, idx) => {
                    const percentage = ((response.score / resultsData.statistics.total_questions) * 100).toFixed(1);
                    const passed = percentage >= 50;
                    
                    return (
                      <div key={idx} className="bg-gray-800/50 rounded-lg p-3 sm:p-4 hover:bg-gray-800/70 transition-colors">
                        <div className="flex items-center justify-between mb-2 sm:mb-3 gap-2">
                          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm sm:text-base flex-shrink-0">
                              {response.username?.charAt(0).toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-white font-semibold text-xs sm:text-sm md:text-base truncate">
                                {response.username || 'Anonymous'}
                              </div>
                              <div className="text-gray-400 text-[10px] sm:text-xs truncate">
                                {new Date(response.submitted_at).toLocaleString(undefined, { 
                                  month: 'short', 
                                  day: 'numeric', 
                                  hour: '2-digit', 
                                  minute: '2-digit' 
                                })}
                              </div>
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-lg sm:text-xl md:text-2xl font-bold ${passed ? 'text-green-400' : 'text-red-400'}`}>
                              {response.score}/{resultsData.statistics.total_questions}
                            </div>
                            <div className="text-gray-400 text-xs sm:text-sm">
                              {percentage}%
                            </div>
                          </div>
                        </div>
                        
                        {/* Answer breakdown */}
                        <div className="flex items-center gap-2 text-xs sm:text-sm flex-wrap">
                          <span className="text-green-400">
                            ✓ {response.score} correct
                          </span>
                          <span className="text-gray-500">•</span>
                          <span className="text-red-400">
                            ✗ {resultsData.statistics.total_questions - response.score} incorrect
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 sm:py-12">
                  <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">📭</div>
                  <h4 className="text-white text-base sm:text-lg font-semibold mb-2">No submissions yet</h4>
                  <p className="text-gray-400 text-sm">Students haven't submitted their answers yet</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="p-3 sm:p-4 border-t border-gray-700 bg-gray-800/30">
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={() => handleExportPDF(viewResultsQuiz, resultsData)}
                  className="flex-1 px-3 sm:px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  <img src="/icons/export.svg" alt="" className="w-4 h-4" />
                  Export as PDF
                </button>
                <button
                  onClick={() => handleExportDOCX(viewResultsQuiz, resultsData)}
                  className="flex-1 px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-all text-xs sm:text-sm flex items-center justify-center gap-2"
                >
                  <img src="/icons/export.svg" alt="" className="w-4 h-4" />
                  Export as DOCX
                </button>
                <button
                  onClick={() => {
                    setViewResultsQuiz(null);
                    setResultsData(null);
                  }}
                  className="px-4 sm:px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white font-semibold rounded-lg transition-all text-xs sm:text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
