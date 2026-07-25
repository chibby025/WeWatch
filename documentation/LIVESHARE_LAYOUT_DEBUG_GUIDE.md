# LiveShare Layout Debug Logs Guide

## What to Look For in Console

### 1. HOST TAB - When Starting LiveShare

**When selecting layout in wizard:**
```
🎬 [VideoWatch HOST] LiveShare type selected: both layout: split-view
🎨 [VideoWatch HOST] Setting selectedLiveShareLayout to: split-view
📊 [VideoWatch HOST] Layout tracking: { receivedLayout: "split-view", willSetState: true, ... }
```

**When mode is selected:**
```
🎙️ [VideoWatch HOST] LiveShare mode selected: regular null layout: split-view
📊 [VideoWatch HOST] Mode select tracking: { mode: "regular", layout: "split-view", willBroadcast: true, ... }
🎨 [VideoWatch HOST] Setting selectedLiveShareLayout to: split-view
📊 [VideoWatch HOST] Layout state update: { previousLayout: null, newLayout: "split-view", willBroadcast: true, ... }
```

**When broadcasting:**
```
📡 [VideoWatch HOST] Broadcasting layout to all members: split-view
📡 [VideoWatch] Broadcasting LiveShare mode to all members: { type: "liveshare_mode_selected", mode: "regular", layout: "split-view" }
```

### 2. MEMBER TAB - When Joining Live

**When receiving broadcast:**
```
🎬 [VideoWatch MEMBER] Received liveshare_mode_selected broadcast: { mode: "regular", layout: "split-view", ... }
📊 [VideoWatch MEMBER] Broadcast content: { mode: "regular", hasLayout: true, layout: "split-view", ... }
📌 [VideoWatch MEMBER] Setting liveShareContentMode to: regular
🎨 [VideoWatch MEMBER] Setting layout from broadcast: split-view
📊 [VideoWatch MEMBER] Layout state update: { previousLayout: null, newLayout: "split-view", source: "websocket_broadcast", ... }
```

### 3. MEMBER TAB - Late Joiner (Joins After LiveShare Started)

**When receiving session_status:**
```
🔄 [VideoWatch] Restoring LiveShare state for late joiner: { mode: "regular", hasLayout: true, layout: "split-view", ... }
🎨 [VideoWatch LATE JOINER] Restoring layout from database: split-view
```

**If no layout found:**
```
⚠️ [VideoWatch LATE JOINER] No layout found in session_status - will use default
```

### 4. BACKEND LOGS

**When host starts LiveShare:**
```
🎬 [LiveShare] Mode selected: regular for session <uuid>
🎨 [LiveShare] Layout specified: split-view
📡 [LiveShare] Broadcasting layout: split-view
✅ [LiveShare] Mode regular set for session <uuid>
```

## Test Scenarios

### Scenario 1: Host + Member Join Together
1. **Host**: Start LiveShare → Regular → Screen+Camera → Split View
2. **Expected Host Logs**: All "HOST" logs above
3. **Expected Member Logs**: All "MEMBER" broadcast logs above
4. **Result**: Member should see split view (screen left, camera right)

### Scenario 2: Late Joiner
1. **Host**: Already has LiveShare running with split view
2. **New Member**: Joins session
3. **Expected Member Logs**: All "LATE JOINER" logs above
4. **Result**: Late joiner should immediately see split view

### Scenario 3: Layout Not Sent (Bug)
1. **Warning to look for**: `⚠️ [VideoWatch HOST] Layout not included in broadcast - was not provided`
2. **Or**: `⚠️ [VideoWatch MEMBER] No layout in broadcast - will use default`
3. **Result**: Member sees fullscreen (default) instead of split view

## Quick Debug Checklist

✅ Check: Host logs show `receivedLayout: "split-view"`  
✅ Check: Host logs show `willBroadcast: true`  
✅ Check: Member logs show `hasLayout: true`  
✅ Check: Member logs show `newLayout: "split-view"`  
✅ Check: Backend logs show `Broadcasting layout: split-view`  
✅ Check: Late joiner logs show `Restoring layout from database: split-view`  

If any of these are missing or showing `null`/`undefined`, that's where the layout is getting lost!
