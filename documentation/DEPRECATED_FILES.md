# Deprecated Files

This document tracks files that are deprecated and scheduled for removal after verification of new implementations.

## Frontend Components

### Deprecated: `frontend/src/components/cinema/ui/SeatsModal.jsx`
**Status:** Deprecated as of December 21, 2025  
**Reason:** Replaced by modular seat grid components  
**Replacement:** 
- `frontend/src/components/cinema/ui/LectureHallSeatsGrid.jsx` - Lecture hall 3-column grid
- `frontend/src/components/cinema/ui/CinemaSeatsGrid.jsx` - Cinema 7×6 grid (to be created)
- `frontend/src/components/UnifiedSeatsModal.jsx` - Wrapper component (to be created)

**Migration Path:**
1. Cinema 3D scenes should use UnifiedSeatsModal with `watchType="3d_cinema"`
2. Video watch should use UnifiedSeatsModal with `watchType="video"`
3. Lecture hall should use UnifiedSeatsModal with `watchType="classroom"`

**Remove After:** All watch types (cinema, video, classroom, lecture_hall) verified working with new components

---

### Deprecated: `frontend/src/components/SeatsModal.jsx` (old)
**Status:** Deprecated (if exists)  
**Reason:** Superseded by cinema-specific components
**Replacement:** See cinema/ui/SeatsModal.jsx above

---

### Deprecated: `frontend/src/components/SeatingGrid.jsx` (old)
**Status:** Deprecated (if exists)  
**Reason:** Basic grid replaced by advanced seat grid components
**Replacement:** Watch-type-specific grid components

---

---

## 3D Cinema Seat System (Old)

### Deprecated: `frontend/src/components/cinema/3d-cinema/seatCalculator.js`
**Status:** Deprecated as of January 27, 2026  
**Reason:** Replaced by manual position recording system (like lecture hall)  
**Replacement:** `cinemaSeats.json` with Position Calculator modal in CinemaScene3DDemo.jsx  
**Migration:** New WASD camera movement + manual seat position recording

### Deprecated: `frontend/src/components/cinema/3d-cinema/SeatMarkers.jsx`
**Status:** Deprecated as of January 27, 2026  
**Reason:** Debug visualization no longer needed with manual positioning  
**Replacement:** None (integrated into Position Calculator modal)

### Deprecated: `frontend/src/components/cinema/3d-cinema/useSeatController.js`
**Status:** Deprecated as of January 27, 2026  
**Reason:** Replaced by simplified seat management  
**Replacement:** Direct seat key management in CinemaScene3DDemo.jsx

### Deprecated: `adjust_seat_heights.js` (root)
**Status:** Deprecated as of January 27, 2026  
**Reason:** Script for old interpolation-based seat system  
**Replacement:** None (manual position recording eliminates need for adjustment scripts)

### Deprecated: `revert_seat_heights.js` (root)
**Status:** Deprecated as of January 27, 2026  
**Reason:** Script for old interpolation-based seat system  
**Replacement:** None

### Deprecated: `generate_seats.js` (root)
**Status:** Deprecated as of January 27, 2026  
**Reason:** Lecture hall specific, not used by 3D cinema anymore  
**Replacement:** None

---

## Renamed Files (3D Cinema)

### Renamed: `AvatarManager.jsx` → `CinemaAvatarManager.jsx`
**Date:** January 27, 2026  
**Location:** `frontend/src/components/cinema/3d-cinema/avatars/`
**Reason:** Cinema-specific component, better organization with "cinema" prefix for easy identification

---

## Notes

- Do not delete these files yet - they may be in use by existing code
- After all watch types are migrated and tested, these files can be safely removed
- Document any breaking changes in migration guide
- Check for imports across the codebase before deletion

## Cleanup Checklist

- [ ] Verify all cinema scenes use new components
- [ ] Verify video watch uses new components  
- [ ] Verify classroom/lecture hall uses new components
- [ ] Search codebase for remaining imports of old files
- [ ] Remove deprecated files
- [ ] Update documentation
- [ ] Remove premium seat logic from cinema
- [ ] Verify new manual position recording system works
- [ ] Test WASD camera movement in 3D cinema
