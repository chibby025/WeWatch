# Quiz System Integration Guide

## Overview
This document provides step-by-step instructions for integrating the quiz system into VideoWatch.jsx.

## 📦 Files Created

### Modal Components
- ✅ `frontend/src/components/cinema/modals/QuizManagementModal.jsx` (242 lines)
- ✅ `frontend/src/components/cinema/modals/MakeQuizModal.jsx` (356 lines)
- ✅ `frontend/src/components/cinema/modals/TakeQuizModal.jsx` (232 lines)
- ✅ `frontend/src/components/cinema/modals/QuizResultsModal.jsx` (165 lines)

### Modified Components
- ✅ `frontend/src/components/Taskbar.jsx` (added Quiz button with emoji icon)
- ✅ `frontend/src/components/cinema/ui/LeftSidebar.jsx` (added Quiz section in Upload tab)

## 🔌 Integration Steps for VideoWatch.jsx

### Step 1: Import Modal Components

Add these imports near the top of VideoWatch.jsx:

```jsx
// Quiz System Modals
import QuizManagementModal from './modals/QuizManagementModal';
import MakeQuizModal from './modals/MakeQuizModal';
import TakeQuizModal from './modals/TakeQuizModal';
import QuizResultsModal from './modals/QuizResultsModal';
```

### Step 2: Add State Variables

Add these state declarations with the other useState calls (around line 100-200):

```jsx
// 📝 QUIZ SYSTEM STATE
const [quizzes, setQuizzes] = useState([]); // All quizzes in this session
const [activeQuiz, setActiveQuiz] = useState(null); // Currently in-progress quiz
const [currentQuizData, setCurrentQuizData] = useState(null); // Quiz for student to take
const [quizResults, setQuizResults] = useState(null); // Student's results
const [isQuizManagementOpen, setIsQuizManagementOpen] = useState(false);
const [isMakeQuizOpen, setIsMakeQuizOpen] = useState(false);
const [isTakeQuizOpen, setIsTakeQuizOpen] = useState(false);
const [isQuizResultsOpen, setIsQuizResultsOpen] = useState(false);
```

### Step 3: Add WebSocket Message Handlers

Add this useEffect after your existing WebSocket message handlers (search for `useEffect(() => {` with messages dependency):

```jsx
// 📝 QUIZ SYSTEM: WebSocket Message Handlers
useEffect(() => {
  if (!messages || messages.length === 0) return;

  const latestMessage = messages[messages.length - 1];
  if (!latestMessage) return;

  try {
    const messageData = typeof latestMessage === 'string' 
      ? JSON.parse(latestMessage) 
      : latestMessage;

    // ✅ Handle quiz_created - Host receives confirmation
    if (messageData.type === 'quiz_created') {
      console.log('📝 [VideoWatch] Quiz created:', messageData.data);
      toast.success(`Quiz "${messageData.data.name}" created successfully!`);
      
      // Add to quizzes list
      setQuizzes(prev => [...prev, messageData.data]);
    }

    // ✅ Handle quiz_published - All users receive notification
    if (messageData.type === 'quiz_published') {
      console.log('📝 [VideoWatch] Quiz published:', messageData.data);
      
      const quizInfo = messageData.data;
      setActiveQuiz(quizInfo);
      
      // Show notification to students
      if (!isHost) {
        toast.success(`📝 New quiz available: ${quizInfo.name}`, {
          duration: 5000,
          icon: '📝'
        });
        
        // Auto-open quiz modal for students
        setTimeout(() => {
          handleRequestQuiz(quizInfo.quiz_id);
        }, 1000);
      } else {
        toast.success(`Quiz "${quizInfo.name}" published to all students!`);
      }
    }

    // ✅ Handle quiz_data - Student receives quiz questions
    if (messageData.type === 'quiz_data') {
      console.log('📝 [VideoWatch] Received quiz data:', messageData.data);
      setCurrentQuizData(messageData.data);
      setIsTakeQuizOpen(true);
    }

    // ✅ Handle quiz_results - Student receives graded results
    if (messageData.type === 'quiz_results') {
      console.log('📝 [VideoWatch] Received quiz results:', messageData.data);
      setQuizResults(messageData.data);
      setIsTakeQuizOpen(false);
      setIsQuizResultsOpen(true);
      
      // Show score notification
      const percentage = ((messageData.data.score / messageData.data.total) * 100).toFixed(1);
      toast.success(`Quiz submitted! Score: ${messageData.data.score}/${messageData.data.total} (${percentage}%)`, {
        duration: 6000
      });
    }

    // ✅ Handle quiz_submission_received - Host receives notification
    if (messageData.type === 'quiz_submission_received') {
      console.log('📝 [VideoWatch] Student submitted quiz:', messageData.data);
      
      if (isHost) {
        toast.success(`${messageData.data.username} submitted the quiz! Score: ${messageData.data.score}/${messageData.data.total}`, {
          duration: 4000,
          icon: '✅'
        });
      }
    }

    // ✅ Handle quiz_ended - All users receive notification
    if (messageData.type === 'quiz_ended') {
      console.log('📝 [VideoWatch] Quiz ended:', messageData.data);
      
      setActiveQuiz(null);
      setIsTakeQuizOpen(false);
      
      toast.success('Quiz has ended', {
        duration: 3000
      });
      
      if (isHost) {
        toast.success(`Total submissions: ${messageData.data.total_submissions}, Avg score: ${messageData.data.average_score?.toFixed(1)}`, {
          duration: 5000
        });
      }
    }

    // ✅ Handle quiz_error
    if (messageData.type === 'quiz_error') {
      console.error('❌ [VideoWatch] Quiz error:', messageData.data);
      toast.error(messageData.data.message || 'Quiz error occurred');
    }

  } catch (error) {
    console.error('❌ [VideoWatch] Error processing quiz message:', error);
  }
}, [messages, isHost]);
```

### Step 4: Add Handler Functions

Add these functions after your other handler functions (around line 800-1000):

```jsx
// 📝 QUIZ SYSTEM: Handler Functions

const handleQuizClick = useCallback(() => {
  if (isHost) {
    setIsQuizManagementOpen(true);
  } else {
    // Student clicks quiz button - show active quiz if available
    if (activeQuiz) {
      handleRequestQuiz(activeQuiz.quiz_id);
    } else {
      toast.error('No active quiz available');
    }
  }
}, [isHost, activeQuiz]);

const handleRequestQuiz = useCallback((quizId) => {
  if (!sendMessage) {
    console.error('❌ [VideoWatch] sendMessage not available');
    return;
  }
  
  sendMessage({
    type: 'quiz_request',
    data: { quiz_id: quizId }
  });
}, [sendMessage]);

const handleCreateQuiz = useCallback(() => {
  setIsQuizManagementOpen(false);
  setIsMakeQuizOpen(true);
}, []);

const handleViewResults = useCallback((quizId) => {
  // TODO: Fetch quiz results from backend
  console.log('📊 View results for quiz:', quizId);
  toast.info('Results view coming soon!');
}, []);
```

### Step 5: Pass Props to Taskbar

Find the `<Taskbar` component (around line 1860) and add these props:

```jsx
<Taskbar 
  // ... existing props ...
  onQuizClick={handleQuizClick}
  activeQuizCount={activeQuiz ? 1 : 0}
/>
```

### Step 6: Pass Props to LeftSidebar

Find the `<LeftSidebar` component (around line 1980) and add these props:

```jsx
<LeftSidebar
  // ... existing props ...
  onQuizClick={handleQuizClick}
  hasRaiseHandFeature={!!onRaiseHand} // Use raise hand as lecture hall indicator
/>
```

### Step 7: Render Modal Components

Add these modal components at the end of the return statement, just before the closing tag (around line 2230):

```jsx
{/* 📝 QUIZ SYSTEM MODALS */}
{isQuizManagementOpen && isHost && (
  <QuizManagementModal
    isOpen={isQuizManagementOpen}
    onClose={() => setIsQuizManagementOpen(false)}
    isHost={isHost}
    quizzes={quizzes}
    activeQuiz={activeQuiz}
    onCreateQuiz={handleCreateQuiz}
    onViewResults={handleViewResults}
    sendMessage={sendMessage}
    currentUser={currentUser}
  />
)}

{isMakeQuizOpen && isHost && (
  <MakeQuizModal
    isOpen={isMakeQuizOpen}
    onClose={() => {
      setIsMakeQuizOpen(false);
      setIsQuizManagementOpen(true); // Return to management
    }}
    sendMessage={sendMessage}
    currentUser={currentUser}
    roomId={roomId}
    sessionId={sessionStatus?.id}
  />
)}

{isTakeQuizOpen && !isHost && (
  <TakeQuizModal
    isOpen={isTakeQuizOpen}
    onClose={() => setIsTakeQuizOpen(false)}
    quiz={currentQuizData}
    sendMessage={sendMessage}
    currentUser={currentUser}
  />
)}

{isQuizResultsOpen && !isHost && (
  <QuizResultsModal
    isOpen={isQuizResultsOpen}
    onClose={() => setIsQuizResultsOpen(false)}
    results={quizResults}
    quiz={currentQuizData}
  />
)}
```

## 🎯 Testing Checklist

### Host Flow
1. ✅ Click Quiz button in Taskbar → Opens QuizManagementModal
2. ✅ Click "Create New Quiz" → Opens MakeQuizModal
3. ✅ Add questions (text input + multiple choice)
4. ✅ Save quiz → Returns to management modal
5. ✅ Click "Publish Quiz" → Broadcasts to all students
6. ✅ Receive submission notifications from students
7. ✅ Click "View Progress" → See real-time stats
8. ✅ Click "End Quiz" → Broadcasts end message

### Student Flow
1. ✅ Receive notification when quiz published
2. ✅ Click Quiz button → Opens TakeQuizModal
3. ✅ Answer all questions
4. ✅ Submit answers → Receive quiz_results
5. ✅ View results in QuizResultsModal
6. ✅ See correct/incorrect answers
7. ✅ Receive notification when quiz ends

### WebSocket Messages
- ✅ `quiz_create` → `quiz_created`
- ✅ `quiz_publish` → `quiz_published` (broadcast)
- ✅ `quiz_request` → `quiz_data`
- ✅ `quiz_submit` → `quiz_results` + `quiz_submission_received` (to host)
- ✅ `quiz_end` → `quiz_ended` (broadcast)
- ✅ `quiz_progress` → `quiz_progress` response

## 📊 Data Flow Summary

```
HOST CREATES QUIZ:
1. Host clicks "Create Quiz" in management modal
2. Opens MakeQuizModal
3. Host adds questions (text input, multiple choice)
4. Host clicks "Save Quiz"
5. Frontend sends: { type: 'quiz_create', data: { name, questions, timer... } }
6. Backend responds: { type: 'quiz_created', data: { quiz_id, status: 'draft' } }
7. Quiz added to quizzes list

HOST PUBLISHES QUIZ:
1. Host clicks "Publish Quiz" in management modal
2. Frontend sends: { type: 'quiz_publish', data: { quiz_id } }
3. Backend broadcasts: { type: 'quiz_published', data: { quiz_id, name, total_questions, timer... } }
4. All students receive notification + modal auto-opens

STUDENT TAKES QUIZ:
1. Student clicks Quiz button or receives auto-prompt
2. Frontend sends: { type: 'quiz_request', data: { quiz_id } }
3. Backend responds: { type: 'quiz_data', data: { quiz (no correct answers) } }
4. TakeQuizModal opens with questions
5. Student fills answers and submits
6. Frontend sends: { type: 'quiz_submit', data: { quiz_id, answers: [...] } }
7. Backend grades and responds: { type: 'quiz_results', data: { score, total, answers with is_correct } }
8. Backend notifies host: { type: 'quiz_submission_received', data: { user_id, username, score } }
9. QuizResultsModal opens showing graded answers

HOST ENDS QUIZ:
1. Host clicks "End Quiz" in management modal
2. Frontend sends: { type: 'quiz_end', data: { quiz_id } }
3. Backend broadcasts: { type: 'quiz_ended', data: { quiz_id, total_submissions, average_score } }
4. All modals close, activeQuiz cleared
```

## 🎨 UI Features

### Quiz Button (Taskbar)
- Emoji icon: 📝
- Shows pulse animation when quiz is active
- Subtitle: "🟢 1 active" when quiz in progress
- Visible only in lecture halls (detected by presence of raise hand feature)

### Quiz Section (LeftSidebar)
- Only visible to host in lecture hall
- In Upload tab, below playlist
- Button: "📊 Manage Quizzes"
- Opens QuizManagementModal

### Modals Styling
- Dark theme (gray-800 background)
- Consistent with existing modal patterns
- Full-screen modals for focus
- Smooth transitions
- Toast notifications for all events

## 🔒 Security Notes

- Students never receive correct answers until after submission
- One submission per student per quiz (enforced by backend UNIQUE constraint)
- Only host can create, publish, and end quizzes
- Quiz results are immediately graded and persisted

## 🚀 Next Steps

1. Run database migration: `psql -h localhost -p 5432 -U postgres -d wewatch_db -f backend/migrations/*_create_quiz_tables.sql`
2. Restart backend: `cd backend && go run ./cmd/server/main.go`
3. Integrate code snippets into VideoWatch.jsx
4. Test with multiple browser windows (1 host + multiple students)
5. Monitor WebSocket messages in browser console

## 📝 Known Limitations (MVP)

- No edit quiz functionality (only create/delete drafts)
- No quiz templates or question banks
- No partial credit for text answers
- No question randomization
- Timer is global (not per-question)
- No image/media support in questions
- Results view for host shows only submissions (no detailed leaderboard UI yet)

These can be added in future iterations!
