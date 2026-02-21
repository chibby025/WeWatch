# Room Image Upload - Quick Test Guide

## ✅ Implementation Complete

### Backend Changes:
1. ✅ Database migration added (`add_image_url_to_rooms.sql`)
2. ✅ Room model updated with `ImageURL` field
3. ✅ Upload endpoint: `PUT /api/rooms/:id/image`
4. ✅ Delete endpoint: `DELETE /api/rooms/:id/image`
5. ✅ Routes registered in main.go
6. ✅ Image URLs included in GetRooms/GetRoom responses
7. ✅ Upload directory created: `backend/uploads/room_images/`

### Frontend Changes:
1. ✅ Circular room image on lobby cards (WhatsApp/Telegram style)
2. ✅ Pulsing green badge for active sessions (on bottom-right of avatar)
3. ✅ Image upload UI in RoomPageEditModal (circular preview with camera button)
4. ✅ Delete image button (trash icon on top-right)
5. ✅ File validation (images only, max 5MB)

---

## 🚀 How to Test

### 1. Start Backend
```bash
cd /home/chibuzor_dev/WeWatch/backend
go run cmd/server/main.go
```

### 2. Test Flow

**Upload Room Image:**
1. Go to lobby
2. Click on a room card (you must be the host)
3. Click the ellipsis menu (⋮) → Edit Settings
4. Click the camera icon on the circular avatar
5. Select an image (JPG, PNG, GIF, or WebP - max 5MB)
6. Click "Upload Image"
7. See the image appear in circular preview

**View Room Image:**
1. Go back to lobby
2. Room card now shows your uploaded image in circular format
3. If session is active, see pulsing green play badge on avatar

**Delete Room Image:**
1. Open room settings again
2. Click the trash icon (🗑️) on top-right of avatar
3. Confirm deletion
4. Avatar reverts to gradient with film icon

---

## 🎨 Visual Design

### Room Card (Lobby):
```
┌──────────────────────────────────┐
│ ○           Room Name      📅   │
│ ▶️          Host: Username       │
└──────────────────────────────────┘
 ↑ Circular avatar with active badge
```

### Settings Modal:
```
┌─────────────────┐
│    Room Image   │
│                 │
│      ┌───┐      │
│      │ ○ │ 🗑️   │  ← Delete button
│      └───┘      │
│        📷       │  ← Camera button
│                 │
│  [Upload Image] │  ← Only shows when new file selected
└─────────────────┘
```

---

## 📋 API Endpoints

### Upload Image
```bash
PUT /api/rooms/:id/image
Content-Type: multipart/form-data
Body: { image: file }

Response:
{
  "message": "Room image updated successfully",
  "image_url": "/uploads/room_images/room_1_1706123456.jpg"
}
```

### Delete Image
```bash
DELETE /api/rooms/:id/image

Response:
{
  "message": "Room image deleted successfully"
}
```

---

## 🐛 Common Issues

**Issue: Image not showing**
- Check browser console for 404 errors
- Verify uploads/room_images/ directory exists
- Check backend is serving static files from uploads/

**Issue: Upload fails**
- Check file size (must be < 5MB)
- Check file type (only images allowed)
- Check user is room host

**Issue: Old image not deleted**
- Check file permissions on uploads/ directory
- Check backend logs for deletion errors

---

## 📊 File Size Limits

- **Maximum:** 5MB
- **Recommended:** 500KB - 1MB
- **Optimal dimensions:** 512×512px (will be displayed as circle)

---

## 🔧 Backend Code Locations

**Handlers:**
- `backend/internal/handlers/rooms.go:199-382` (Upload/Delete handlers)

**Model:**
- `backend/internal/models/room.go:22` (ImageURL field)

**Routes:**
- `backend/cmd/server/main.go:270-271` (Image routes)

**Migration:**
- `backend/migrations/add_image_url_to_rooms.sql`

---

## 🎯 Next Steps (Optional Enhancements)

1. **Image Cropping:** Add client-side cropper for perfect circles
2. **Image Compression:** Auto-compress large images
3. **Multiple Images:** Gallery of room images
4. **Image Moderation:** Flag inappropriate images
5. **CDN Integration:** Store on Cloudinary/S3 for better performance

---

## ✨ Features Summary

✅ Circular avatars (WhatsApp/Telegram style)  
✅ Pulsing green badge for active sessions  
✅ Easy upload (camera button overlay)  
✅ Easy delete (trash button)  
✅ Gradient fallback when no image  
✅ File validation  
✅ Host-only access  
✅ Real-time preview  
✅ Database persistence  

**Ready to test! Start your backend server and try it out!** 🚀
