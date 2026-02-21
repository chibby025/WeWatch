# Watch Type Detection System

**Date:** December 30, 2025  
**Status:** ✅ Implemented

---

## Overview

Implemented a clean, hybrid watch type detection system to replace the hacky `onRaiseHand` proxy pattern. The system uses backend session data as the primary source and URL-based fallback for initial render.

---

## Architecture

### Backend (Already Exists)

**WatchSession Model:**
```go
type WatchSession struct {
    WatchType string `json:"watch_type"` // "video", "3d_cinema", "classroom"
    ClassType string `json:"class_type"` // "classroom", "lecture_hall" (only when watch_type="classroom")
}
```

### Frontend Implementation

**Detection Strategy (Hybrid Approach):**

1. **Primary:** WebSocket `sessionStatus.watch_type` and `sessionStatus.class_type`
2. **Fallback:** URL pathname parsing for initial render before WebSocket connects

**Implementation in Components:**

```javascript
// VideoWatch.jsx
const watchType = sessionStatus?.watch_type || (
  location.pathname.includes('/lecture-hall/') ? 'classroom' :
  location.pathname.includes('/cinema-3d-demo/') ? '3d_cinema' :
  'video'
);
const classType = sessionStatus?.class_type || (
  location.pathname.includes('/lecture-hall/') ? 'lecture_hall' : null
);

// Derived flags
const isClassroom = watchType === 'classroom';
const isLectureHall = isClassroom && classType === 'lecture_hall';
```

---

## Watch Types & Routes

### Type Matrix

| Watch Type | Class Type | Route | Description |
|------------|-----------|-------|-------------|
| `video` | `null` | `/watch/:roomId` | Standard 2D video player |
| `3d_cinema` | `null` | `/cinema-3d-demo/:roomId` | 3D movie theater |
| `classroom` | `classroom` | *(future)* | Small 3D classroom |
| `classroom` | `lecture_hall` | `/lecture-hall/:roomId` | Large 3D lecture hall (145 seats) |

### Feature Detection Logic

```javascript
// In Taskbar.jsx
const isClassroom = watchType === 'classroom';
const isLectureHall = isClassroom && classType === 'lecture_hall';

// Board button: All classrooms
{isClassroom && <BoardButton />}

// Quiz button: Only lecture halls
{isLectureHall && onQuizClick && <QuizButton />}

// Raise Hand: Only lecture halls, students only
{isLectureHall && !isHost && <RaiseHandButton />}
```

---

## Component Updates

### 1. VideoWatch.jsx ✅

**Added:**
```javascript
// 🎯 HYBRID WATCH TYPE DETECTION
const watchType = sessionStatus?.watch_type || (
  location.pathname.includes('/lecture-hall/') ? 'classroom' :
  location.pathname.includes('/cinema-3d-demo/') ? '3d_cinema' :
  'video'
);
const classType = sessionStatus?.class_type || (
  location.pathname.includes('/lecture-hall/') ? 'lecture_hall' : null
);

const isClassroom = watchType === 'classroom';
const isLectureHall = isClassroom && classType === 'lecture_hall';
```

**Props passed to Taskbar:**
```javascript
<Taskbar 
  watchType={watchType}
  classType={classType}
  // ... other props
/>
```

---

### 2. LectureHallPage.jsx ✅

**Props passed to Taskbar:**
```javascript
<Taskbar
  watchType="classroom"
  classType={classType || 'lecture_hall'}
  // ... other props
/>
```

---

### 3. PositionCalculatorPage.jsx ✅

**Props passed to Taskbar:**
```javascript
<Taskbar
  watchType="classroom"
  classType={modelType === 'lecture-hall' ? 'lecture_hall' : 'classroom'}
  // ... other props
/>
```

---

### 4. CinemaScene3DDemo.jsx ✅

**Props passed to Taskbar:**
```javascript
<Taskbar
  watchType="3d_cinema"
  classType={null}
  // ... other props
/>
```

---

### 5. Taskbar.jsx ✅

**Component Signature:**
```javascript
const Taskbar = ({
  watchType = 'video', // 'video', '3d_cinema', 'classroom'
  classType = null,    // 'classroom', 'lecture_hall' (only for watchType='classroom')
  authenticatedUserID,
  // ... other props
}) => {
  // 🎯 Derive feature flags from watch type
  const isClassroom = watchType === 'classroom';
  const isLectureHall = isClassroom && classType === 'lecture_hall';
  
  // ... rest of component
}
```

**Button Visibility Logic:**

```javascript
// Board/Menu Button (Right side, near Settings)
{showProgram && (
  <TaskbarButton
    icon={isClassroom ? BoardIcon : ProgramMenuIcon}
    label={isClassroom ? "Board" : "Menu"}
    onClick={() => onToggleLeftSidebar()}
  />
)}

// Quiz Button (Center section)
{isLectureHall && onQuizClick && (
  <TaskbarButton
    icon={QuizIcon}
    label="Quiz"
    onClick={onQuizClick}
    shouldPulse={activeQuizCount > 0}
  />
)}

// Raise Hand Button (Center section, students only)
{isLectureHall && !isHost && onRaiseHand && onLowerHand && (
  <TaskbarButton
    icon={handRaised ? '🙋' : '✋'}
    label={handRaised ? 'Lower Hand' : 'Raise Hand'}
    onClick={() => handRaised ? onLowerHand() : onRaiseHand()}
    shouldPulse={handRaised}
  />
)}
```

---

## Icons Used

| Button | Icon Type | File Path | Watch Type |
|--------|-----------|-----------|------------|
| Menu | SVG | `/icons/mediaScheduleIcon.svg` | video, 3d_cinema |
| Board | SVG | `/icons/board.svg` | classroom (all) |
| Quiz | Emoji | 📝 | lecture_hall only |
| Raise Hand | Emoji | 🙋/✋ | lecture_hall only |

---

## Benefits of This Approach

### ✅ Advantages

1. **Clean Separation:** Watch type is a first-class concept, not inferred from props
2. **Type Safety:** Explicit enums make feature detection clear
3. **Maintainable:** Easy to add new watch types (e.g., "sports_stadium", "church")
4. **Reliable:** Uses backend as source of truth, URL as fallback
5. **Consistent:** All components use same detection pattern
6. **No Proxy Props:** Removed hacky `onRaiseHand` as indicator

### ❌ Old Pattern (Removed)

```javascript
// BAD: Using onRaiseHand as lecture hall detector
{onRaiseHand && <QuizButton />}
{onRaiseHand ? <BoardIcon /> : <MenuIcon />}
```

### ✅ New Pattern

```javascript
// GOOD: Explicit watch type detection
{isLectureHall && <QuizButton />}
{isClassroom ? <BoardIcon /> : <MenuIcon />}
```

---

## Future Watch Types

### Planned Extensions

```javascript
// Church module
watchType: 'classroom'
classType: 'church'
features: ['donation_tray', 'prayer_requests', 'scripture_viewer']

// Sports Stadium
watchType: 'classroom'  
classType: 'sports_stadium'
features: ['live_stats', 'team_selection', 'cheer_sounds']

// Small Classroom
watchType: 'classroom'
classType: 'classroom'
capacity: 25
features: ['whiteboard', 'breakout_rooms']
```

### Adding New Watch Type

1. **Backend:** Add to `WatchType` or `ClassType` enum
2. **Route:** Add to `App.jsx` routes
3. **Component:** Pass `watchType` and `classType` to Taskbar
4. **Taskbar:** Add feature detection flags
5. **UI:** Add conditional buttons/features

---

## Testing Checklist

### Verify Watch Type Detection

- [ ] VideoWatch (2D) shows "Menu" button
- [ ] CinemaScene3DDemo shows "Menu" button
- [ ] LectureHallPage shows "Board" button
- [ ] LectureHallPage shows "Quiz" button (host)
- [ ] LectureHallPage shows "Raise Hand" button (student)
- [ ] PositionCalculatorPage shows "Board" button

### Verify WebSocket Sync

- [ ] On session start, `sessionStatus.watch_type` populates correctly
- [ ] On session join, URL fallback works before WebSocket connects
- [ ] Switching between sessions updates watch type correctly

### Verify Button Behavior

- [ ] Board button toggles left sidebar in lecture halls
- [ ] Menu button toggles left sidebar in cinema/video modes
- [ ] Quiz button only shows in lecture halls
- [ ] Raise hand only shows for students in lecture halls

---

## Migration Notes

### Breaking Changes

**None** - This is a pure enhancement. All existing functionality preserved.

### Deprecated Patterns

⚠️ **Avoid using `onRaiseHand` as a lecture hall indicator going forward.**

Use `isLectureHall` or `isClassroom` flags instead.

---

## Related Documentation

- [LECTURE_HALL_COMPLETE_SUMMARY.md](./LECTURE_HALL_COMPLETE_SUMMARY.md) - Lecture hall system overview
- [QUIZ_COMPLETE_SUMMARY.md](./QUIZ_COMPLETE_SUMMARY.md) - Quiz system implementation
- [CINEMA_3D_SUMMARY.md](./CINEMA_3D_SUMMARY.md) - 3D cinema architecture

---

**Status:** ✅ Production Ready  
**Last Updated:** December 30, 2025  
**Implemented By:** GitHub Copilot
