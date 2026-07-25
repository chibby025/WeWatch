# WeWatch Codebase Cleanup Analysis
**Date:** April 23, 2026  
**Goal:** Reduce app size for Railway free tier compliance (<150MB Docker image, <512MB RAM)

---

## 📊 Current Size Breakdown

### **Backend: 26GB (CRITICAL)**
```
25GB - backend/uploads/           ← TEST DATA (to clean)
1.9MB - internal/                 ← Source code (keep)
324KB - migrations/               ← Database migrations (keep)
80KB  - cmd/                      ← Entry points (keep)
8.0KB - utils/                    ← Utilities (keep)
```

### **Frontend: 889MB**
```
658MB - node_modules/             ← Dependencies (NOT committed, OK)
109MB - public/                   ← Assets (NEEDS CLEANUP)
108MB - dist/                     ← Build output (SHOULD NOT be committed)
8.9MB - test-results/             ← Playwright outputs (SHOULD NOT be committed)
4.7MB - src/                      ← Source code (keep)
1.9MB - playwright-report/        ← Test reports (SHOULD NOT be committed)
100KB - tests/                    ← Test files (keep)
```

### **Frontend Icons: 63MB (276 files)**
```
Total icon files: 276 (146 images: svg/png/jpg/ico)
Actually used: ~90 files
Unused: ~186 files (including 130+ Zone.Identifier files)
Potential savings: ~43MB
```

---

## 🗂️ Backend Uploads Analysis (25GB)

### **Size Breakdown:**
```
3.4GB  - temp/                    ← Temporary processing files
207MB  - previews/                ← Video preview GIFs (duplicate generations)
90MB   - podcast-logos/           ← LiveShare podcast graphics
63MB   - tv-content/              ← Test videos for Theater mode
~1.8GB - Preview GIFs             ← 20+ duplicate preview_*.gif files (37MB each)
~300MB - Test MP4 videos          ← Testing videos (40MB each)
```

### **Findings:**
1. **temp/ folder (3.4GB)**: Temporary upload chunks never cleaned up
2. **Duplicate preview GIFs**: Same session generated 20+ previews (37MB × 20 = 740MB)
3. **Test MP4 videos**: Development testing videos left in production folder
4. **podcast-logos/ (90MB)**: Some may be unused test assets

### **Action Items:**
- ✅ **DELETE temp/ entirely** (3.4GB saved) - Should be regenerated on next upload
- ✅ **DELETE duplicate preview GIFs** (~1.5GB saved) - Keep only latest per session
- ✅ **DELETE test MP4 videos** (~300MB saved) - Not production content
- ⚠️ **Review podcast-logos/** - Check which are actually used in LiveShare modes
- ⚠️ **Review previews/** - Delete orphaned previews (sessions that no longer exist)

**Estimated Savings: 5-6GB minimum**

---

## 🎨 Frontend Icons Analysis (63MB → ~20MB)

### **Used Icons (90 files):**

**Content Rating Icons (6 files):**
- G Rating Icon.png
- PG Rating Icon.png
- 13_ Rating Icon.png
- 16_ Rating Icon.png
- 18_ Rating Icon.png
- Mature Rating Icon.png

**Ticket Assets (3 files):**
- LectureTicket.png
- TheaterTicket.png
- CinemaTicket.png

**Ticket SVGs (4 files):**
- CINETICKET.svg (703 bytes - optimized)
- CINETICKET_ORIGINAL.svg (1.5MB - for comparison tool)
- ticket-background.webp
- ticket-clip.webp

**UI Icons (30+ files):**
- backIcon.svg
- beginWatchIcon.svg
- hostIcon.svg
- roomMembersIcon.svg
- roomTvIcon.svg
- scheduleWatchIcon.svg
- instantWatch.svg
- regularWatchIcon.svg
- chathome.svg
- seat.svg
- coinIcon.svg
- freeIcon.svg
- copyLinkIcon.svg
- searchIcon.svg
- newRoom.svg
- mic.svg
- speaker.svg
- silenceIcon.svg
- turnaround.svg
- saveIcon.svg
- sendIcon.svg
- shareIcon.svg
- settingsIcon.svg
- colorPaletteIcon.png
- bottomIcon.svg
- export.svg
- roomAttachIcon.svg
- stickerIcon.svg
- schedule.svg
- mediaScheduleIcon.svg

**Social Sharing (4 files):**
- whatsappLogo.svg
- facebookLogo.svg
- twitterLogo.svg
- telegramLogo.svg

**Branding (2 files):**
- LetsWatchOutLogo.png
- LetsWatchOut Logo.svg

**Environment Images (13 files):**
- ConnectedWorlds.png
- premiere.png
- fanmeet.png
- modal2.png
- modal5.png
- modal7.png
- modal8.png
- modal10.png
- cinema1.png, cinema2.png, cinema3.png, cinema4.png
- lecture1.png, lecture2.png, lecture3.png
- onlineclass.png

**Demo/Preview Images (4 files):**
- Videowatch1.png
- Videowatch2.png
- Videowatch3.png
- Videowatch4.png

**Misc (10 files):**
- board.svg (canvas drawing)
- placeholder-poster.jpg
- user1avatar.svg
- seat.svg
- BN.png
- Breakin.png
- AudioIcon.svg, ChatIcon.svg, VideoIcon.svg
- FilesIcon.svg, LeaveCallIcon.svg, MembersIcon.svg, MenuIcon.svg

**Attach Modal Icons (4 files - NOT FOUND BUT REFERENCED):**
- documentIcon.svg (referenced but file missing?)
- imageIcon.svg (referenced but file missing?)
- linkIcon.svg (referenced but file missing?)
- pollIcon.svg (referenced but file missing?)

---

### **UNUSED Icons to DELETE (186 files):**

**Zone.Identifier Files (138 files):**
```
All *.svg:Zone.Identifier files (138 files)
All *.png:Zone.Identifier files
```
These are Windows metadata files created when downloading from browser. **Safe to delete entirely.**

**Duplicate/Backup SVG Files (6 files):**
- CINETICKET_BACKUP.svg (1.5MB)
- CINETICKET_OLD_EMBEDDED.svg (1.5MB)
- CINETICKET_OPTIMIZED.svg (703 bytes - we use CINETICKET.svg)
- board1 - Copy.svg
- board2 - Copy.svg
- regularWatchIcon (1).svg, regularWatchIcon (2).svg

**Unused Board Variations (20+ files):**
- board1.svg through board13.svg
We only use `board.svg` in code, others never referenced.

**Streaming Service Icons (NEVER USED - 16 files):**
- youtubeIcon.svg
- netflixIcon.svg
- africamagic-youtubeIcon.svg
- crunchyrollIcon.svg
- hdtodayIcon.svg
- irokotvIcon.svg
- movieboxIcon.svg
- plutotvIcon.svg
- showmaxIcon.svg
- tubiIcon.svg
- twitchIcon.svg
- vikiIcon.svg
- vimeoIcon.svg
(These were likely placeholders for "WatchFrom URL" feature but never implemented in UI)

**Quiz/Game Icons (4 files):**
- quiz.svg
- quizmgt.svg
- results.svg
If quiz feature is not part of MVP, delete these.

**Unused UI Icons (10 files):**
- ticket.svg (we use CINETICKET.svg instead)
- ticket2.svg, ticket3.svg, ticket4.svg
- ticket-top.svg, ticket-bottom.svg
- blankticket.svg
- blankticketinfo.svg
- lecturehallticket.svg
- videowatchticket.svg
- SeatToggleIcon.svg
- SeatsGridIcon.svg
- UploadIcon.svg (we use uploadIcon.svg instead)
- LiveIcon.svg (not referenced in grep search)
- cancelIcon.svg
- giftIcon.svg
- addMemberIcon.svg
- newMemberIcon.svg
- coins.svg (we use coinIcon.svg)
- chat.svg (we use chathome.svg)
- output-onlinepngtools.svg

**Unused Images (5 files):**
- modal1.png, modal3.png, modal4.png, modal6.png, modal9.png
- user1.jpg
- seats-image.jpg

---

### **Deletion Safety Checklist:**

Before deleting, verify these icons are truly unused:
1. ✅ **Zone.Identifier files**: Windows metadata, always safe to delete
2. ✅ **board1-board13.svg**: Only `board.svg` used in code
3. ✅ **Streaming service icons**: Never imported in any component
4. ⚠️ **Quiz icons**: Delete only if quiz feature removed from backend
5. ⚠️ **modal1,3,4,6,9.png**: Verify not used in any info modals
6. ⚠️ **Ticket SVG variations**: Double-check SetTicketPriceModal only uses 3 PNG tickets

---

## 🚮 Frontend Build Artifacts (117MB)

### **Should NOT be committed to Git:**
```
108MB - dist/                     ← Vite build output (generated on Railway)
8.9MB - test-results/             ← Playwright test outputs
1.9MB - playwright-report/        ← HTML test reports
```

### **Action Items:**
- ✅ **DELETE dist/ folder** - Railway runs `npm run build` automatically
- ✅ **DELETE test-results/ folder** - Generated during CI/CD, not needed in repo
- ✅ **DELETE playwright-report/ folder** - Test reports are local artifacts
- ✅ **Update .gitignore** to prevent re-committing:
  ```
  dist/
  test-results/
  playwright-report/
  playwright/.cache/
  ```

**Estimated Savings: 117MB from repo**

---

## 🧹 Quiz/Game Code Analysis

### **Files Found:**
```
backend/internal/services/quiz_service.go
backend/internal/handlers/quiz_handlers.go (likely)
backend/internal/models/quiz.go (likely)
frontend/src/components/QuizModal.jsx (check if exists)
```

### **Investigation Needed:**
1. Are quizzes part of the April 30 MVP launch?
2. Are quiz tables in database schema used?
3. Are quiz routes registered in Gin router?
4. Is quiz UI accessible in frontend?

### **If NOT in MVP:**
- ✅ Delete quiz_service.go, quiz handlers, quiz models
- ✅ Remove quiz routes from router
- ✅ Remove quiz frontend components
- ✅ Delete quiz icons (quiz.svg, quizmgt.svg, results.svg)
- ⚠️ Keep quiz database tables (for future use) but don't populate

**Estimated Savings: ~50-100KB code + 15KB icons**

---

## 🐙 Git Repository Cleanup

### **Issue:**
Large .git/objects/pack file detected (>50MB). This means large files were committed to git history and are still stored even if deleted from working tree.

### **Likely Culprits:**
1. Video files committed to backend/uploads/ in past
2. dist/ folder committed before adding to .gitignore
3. Large node_modules/ accidentally committed
4. Test result videos from Playwright

### **Solution (Advanced - Use with Caution):**
```bash
# Install git-filter-repo
pip install git-filter-repo

# Remove uploads/ from entire git history
git filter-repo --path backend/uploads/ --invert-paths

# Remove dist/ from entire git history
git filter-repo --path frontend/dist/ --invert-paths

# Remove test-results/ from entire git history
git filter-repo --path frontend/test-results/ --invert-paths
```

**⚠️ WARNING:** This rewrites git history and requires force-push. Backup repository first.

**Alternative (Safer but less effective):**
- Accept current .git size (~100-200MB)
- Ensure .gitignore prevents future large commits
- Railway only clones latest commit (shallow clone), so .git size doesn't affect deployment

---

## 📦 Expected Results After Cleanup

### **Backend:**
```
Before: 26GB
After:  ~200MB (uploads cleaned, only source code + migrations)
Savings: 25.8GB
```

### **Frontend:**
```
Before: 889MB (with node_modules)
After:  ~100MB source code + 20MB icons + 658MB node_modules = 778MB
Savings: 111MB from repo (dist + test outputs removed)
Icon savings: 43MB
```

### **Railway Deployment:**
```
Current Docker image: Unknown (likely 500MB+ due to uploads)
Target Docker image: <150MB compressed
Expected RAM usage: 20-50MB idle, 100-200MB under load
Free tier limit: 512MB RAM ✅
```

---

## ✅ Cleanup Execution Plan (Safe & Incremental)

### **Phase 1: Safe Deletions (Zero Risk)**
1. Delete all Zone.Identifier files (138 files)
2. Delete frontend dist/, test-results/, playwright-report/
3. Update .gitignore with excluded folders

### **Phase 2: Uploads Cleanup (Requires Verification)**
1. Backup backend/uploads/ folder to external drive
2. Delete temp/ folder (3.4GB)
3. Delete duplicate preview GIFs (keep only 1 per session)
4. Delete test MP4 videos (check filenames don't match production sessions)

### **Phase 3: Icon Cleanup (Requires Testing)**
1. Create icon-usage-report.txt (list all used icons)
2. Delete streaming service icons (never referenced)
3. Delete board1-board13.svg (only keep board.svg)
4. Delete duplicate/backup SVG files
5. Test app locally to ensure no broken images

### **Phase 4: Quiz Code Review (Conditional)**
1. Check if quiz routes are active in backend
2. If not in MVP, remove quiz service, handlers, models
3. Delete quiz icons
4. Update .clinerules to mark quiz as "post-launch feature"

### **Phase 5: Git History (Optional, Advanced)**
1. Create full repository backup
2. Use git-filter-repo to remove uploads/ and dist/ from history
3. Force-push to GitHub (coordinate with team)
4. Verify Railway deployment still works

---

## 🎯 Success Metrics

- ✅ **Backend uploads/ < 500MB** (only active session data)
- ✅ **Frontend icons/ < 25MB** (only used icons)
- ✅ **No build artifacts in git** (dist, test-results excluded)
- ✅ **Railway Docker image < 150MB**
- ✅ **Railway RAM usage < 200MB under load**
- ✅ **Page load time < 3 seconds** (with cleaned assets)

---

## 📝 Next Steps

1. **Today (April 23):**
   - Update .clinerules with post-launch roadmap ✅
   - Create this cleanup analysis document ✅
   - Review icons usage with user approval before deletion
   - Create backup strategy for uploads/ folder

2. **Tomorrow (April 24):**
   - Execute Phase 1 (safe deletions)
   - Execute Phase 2 (uploads cleanup)
   - Test deployment on Railway

3. **April 25-26:**
   - Execute Phase 3 (icon cleanup with testing)
   - Execute Phase 4 (quiz code review)
   - Verify all features still work

4. **April 27-29:**
   - Final testing before launch
   - Monitor Railway resource usage
   - Document final app size metrics

---

**Document prepared by:** GitHub Copilot (Claude Sonnet 4.5)  
**Review status:** Pending user approval before execution  
**Risk level:** LOW (with proper backups and incremental approach)
