# Session Card UI Update - Implementation Guide

## Changes Made So Far:
✅ Added imports: HeartIcon, ChatBubbleLeftIcon (solid and outline)
✅ Added state: sessionLikes, sessionChatCounts, isChatPreviewOpen, selectedSessionForChat
✅ Added helper functions: fetchSessionLikes, fetchSessionChatCount, handleSessionLike, handleOpenChatPreview
✅ Added WebSocket listeners: session_liked, session_unliked
✅ Added useEffect to fetch likes/chat counts on session load
✅ Created components: SessionChatPreviewModal, TikTokHeartAnimation
✅ Created utility: formatCount

## Next Steps - Update Session Card JSX:

### Location: LobbyPage.jsx, around line 2750-2850

### Current Structure:
```jsx
<div className="absolute bottom-4 left-4 right-4">
  {/* Row 1: Avatar + Name + Star + Content Rating */}
  {/* Row 2: Title + Viewers */}
  {/* Row 3: Expandable Details */}
</div>
```

### New Structure:
```jsx
<div className="absolute bottom-4 left-4 right-20 ...">
  {/* Existing rows */}
</div>

{/* NEW: Right Icon Stack */}
<div className="absolute bottom-4 right-4 flex flex-col items-center gap-3">
  {/* Content Rating Icon */}
  {/* Likes Icon + Count */}
  {/* Chat Icon + Count */}
  {/* Members Icon + Count */}
</div>
```

### Content Rating Icon:
Replace the current inline content rating (in Row 1) with this new implementation in the right stack:

```jsx
{/* Content Rating - Top of stack */}
{session.content_rating && (
  <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br ${
    session.content_rating === 'G' ? 'from-green-400 to-green-600' :
    session.content_rating === 'PG' ? 'from-blue-400 to-blue-600' :
    session.content_rating === '13+' ? 'from-yellow-400 to-yellow-600' :
    session.content_rating === '18+' ? 'from-red-400 to-red-600' :
    session.content_rating === 'Mature' ? 'from-purple-400 to-purple-600' :
    'from-gray-400 to-gray-600'
  } shadow-lg`}>
    <img 
      src={
        session.content_rating === 'G' ? '/icons/G Rating Icon.png' :
        session.content_rating === 'PG' ? '/icons/PG Rating Icon.png' :
        session.content_rating === '13+' ? '/icons/13_ Rating Icon.png' :
        session.content_rating === '18+' ? '/icons/18_ Rating Icon.png' :
        session.content_rating === 'Mature' ? '/icons/Mature Rating Icon.png' :
        '/icons/G Rating Icon.png'
      }
      alt={`${session.content_rating} rating`}
      className="w-8 h-8"
    />
  </div>
)}
```

### Likes Icon:
```jsx
{/* Likes - Below rating */}
<button
  onClick={(e) => handleSessionLike(session.session_id, e)}
  className="flex flex-col items-center gap-1 group"
>
  {sessionLikes[session.session_id]?.isLiked ? (
    <HeartIcon className="w-8 h-8 text-red-500 transition-transform group-hover:scale-110" />
  ) : (
    <HeartOutlineIcon className="w-8 h-8 text-white transition-transform group-hover:scale-110" />
  )}
  <span className="text-white text-xs font-semibold">
    {formatCount(sessionLikes[session.session_id]?.count || 0)}
  </span>
</button>
```

### Chat Icon:
```jsx
{/* Chat - Below likes */}
<button
  onClick={(e) => handleOpenChatPreview(session, e)}
  disabled={!session.preview_enabled}
  className={`flex flex-col items-center gap-1 group ${
    !session.preview_enabled ? 'opacity-50 cursor-not-allowed' : ''
  }`}
>
  <ChatBubbleLeftIcon className="w-8 h-8 text-white transition-transform group-hover:scale-110" />
  <span className="text-white text-xs font-semibold">
    {formatCount(sessionChatCounts[session.session_id] || 0)}
  </span>
</button>
```

### Members Icon (moved to stack):
```jsx
{/* Members - Bottom of stack */}
<div className="flex flex-col items-center gap-1">
  <UsersIcon className="w-8 h-8 text-white" />
  <span className="text-white text-xs font-semibold">
    {formatCount(session.member_count || 0)}
  </span>
</div>
```

### Remove Old Elements:
1. Remove content rating img from Row 1 (it's now in the right stack)
2. Remove "Viewers Count" from Row 2 (it's now in the right stack)

## Add Chat Preview Modal to JSX (before closing </div>):

```jsx
{/* ✅ Session Chat Preview Modal */}
<SessionChatPreviewModal
  isOpen={isChatPreviewOpen}
  onClose={() => setIsChatPreviewOpen(false)}
  sessionId={selectedSessionForChat?.session_id}
  sessionTitle={selectedSessionForChat?.session_title || selectedSessionForChat?.currently_playing}
/>
```

## Summary of Changes:
1. ✅ Moved content rating to right stack with gradient background
2. ✅ Added likes icon with count (formatted)
3. ✅ Added chat icon with count (formatted)
4. ✅ Moved members icon to right stack
5. ✅ Removed duplicate viewers text
6. ✅ Removed inline content rating
7. ✅ Added chat preview modal integration

## Testing Checklist:
- [ ] Content rating icons show with correct gradient colors
- [ ] Likes icon toggles between outline/filled
- [ ] Like count updates in real-time
- [ ] Chat icon opens modal
- [ ] Chat icon disabled for preview_enabled=false sessions
- [ ] Members count displays correctly
- [ ] All icons aligned vertically on right side
- [ ] Icons don't overlap with session info
