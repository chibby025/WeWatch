# Custom Avatar System with User Images

## Overview

The CustomAvatar component supports user profile images by mapping them as textures onto the spherical head geometry. Each avatar displays the user's uploaded image while maintaining the same basic structure (sphere head, dome body, floating arms).

## Key Features

### 🖼️ Image Texture Mapping
- Loads user profile images as Three.js textures
- Maps images onto spherical head geometry
- Automatic fallback to solid colors when image fails
- Support for various image formats (PNG, JPG, WebP)

### 🎨 Consistent Design
- Same geometric structure for all avatars
- Only the head texture changes between users
- Body and arms use consistent color scheme
- Premium users get gold color accents

### ⚡ Performance Optimized
- Texture caching and reuse
- Proper image loading with error handling
- Loading indicators during texture fetch
- Cleanup of unused textures

## Usage

### Basic Implementation

```jsx
import CustomAvatar from './components/cinema/3d-cinema/avatars/CustomAvatar';

// In your room component
<CustomAvatar
  userId={user.id}
  username={user.username}
  seatPosition={[x, y, z]}
  seatRotation={[rx, ry, rz]}
  userPhotoUrl={user.avatar_url}  // <- User's profile image URL
  isPremium={user.isPremium}
  isCurrentUser={user.id === currentUserId}
/>
```

### Complete Room Example

```jsx
const roomMembers = [
  { 
    id: 1, 
    username: 'Alice', 
    avatar_url: 'https://example.com/alice.jpg',
    isPremium: false 
  },
  { 
    id: 2, 
    username: 'Bob', 
    avatar_url: 'https://example.com/bob.png',
    isPremium: true 
  },
  {
    id: 3,
    username: 'Charlie',
    avatar_url: null, // Will use fallback color
    isPremium: false
  }
];

// Render avatars for all room members
{roomMembers.map(member => (
  <CustomAvatar
    key={member.id}
    userId={member.id}
    username={member.username}
    userPhotoUrl={member.avatar_url}
    seatPosition={calculateSeatPosition(member.id)}
    seatRotation={[0, 0, 0]}
    isPremium={member.isPremium}
    isCurrentUser={member.id === currentUserId}
  />
))}
```

## Image Requirements

### Supported Formats
- ✅ PNG (recommended for transparency)
- ✅ JPG/JPEG 
- ✅ WebP
- ✅ GIF (static frames)

### Optimal Specifications
- **Size:** 150x150 to 512x512 pixels
- **Aspect Ratio:** 1:1 (square)
- **File Size:** < 2MB for best performance
- **Format:** PNG for portraits with transparency

### URL Requirements
- Must be accessible via CORS
- HTTPS recommended for production
- Can be data URLs or blob URLs for local files

## Fallback Behavior

### No Image URL Provided
```jsx
<CustomAvatar 
  userPhotoUrl={null}  // Will use solid color based on userId
  // ... other props
/>
```

### Image Loading Failed
- Component automatically detects failed loads
- Falls back to procedurally generated color
- No visual indication of failure (seamless UX)

### Loading States
- Shows subtle loading indicator while texture loads
- Non-blocking (avatar appears immediately with color)
- Texture swaps in when ready

## Color System

### Default Users
```javascript
// Color generated from user ID for consistency
const hue = Math.abs(userIdHash) % 360;
const color = `hsl(${hue}, 65%, 50%)`;
```

### Premium Users
```javascript
const premiumColor = '#DAA520'; // Gold color
```

### Custom Colors
```jsx
<CustomAvatar 
  avatarColor="#FF5733"  // Override automatic color
  userPhotoUrl={user.avatar_url}
/>
```

## Integration with File Uploads

### Frontend Upload Handler
```jsx
const handleAvatarUpload = async (file) => {
  // Validate file
  if (!file.type.startsWith('image/')) {
    throw new Error('Please upload an image file');
  }
  
  if (file.size > 2 * 1024 * 1024) { // 2MB limit
    throw new Error('Image must be smaller than 2MB');
  }
  
  // Upload to your backend
  const formData = new FormData();
  formData.append('avatar', file);
  
  const response = await fetch('/api/upload-avatar', {
    method: 'POST',
    body: formData,
    headers: {
      'Authorization': `Bearer ${userToken}`
    }
  });
  
  const { avatar_url } = await response.json();
  
  // Update user profile
  setUser(prev => ({ ...prev, avatar_url }));
};
```

### Backend Storage (Node.js/Express example)
```javascript
const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
  destination: './uploads/avatars/',
  filename: (req, file, cb) => {
    const userId = req.user.id;
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${userId}-${Date.now()}${extension}`);
  }
});

app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  const avatar_url = `/uploads/avatars/${req.file.filename}`;
  
  // Save to database
  updateUserAvatar(req.user.id, avatar_url);
  
  res.json({ avatar_url });
});
```

## Testing

### Demo Components Available
1. **CinemaScene3DDemo** - Basic 3D cinema with avatar testing
2. **AvatarImageDemo** - Focused avatar image testing with various URL types
3. **GLBAvatarTest** - For comparing with GLB model approach

### Test URLs for Development
```javascript
// Use these for testing different image types
const testAvatars = [
  'https://i.pravatar.cc/150?img=1',      // Real photos
  'https://api.multiavatar.com/test.png', // Generated avatars
  'https://robohash.org/test.png',        // Robot avatars
  null,                                   // Fallback test
  'https://broken-url.com/image.jpg'      // Error handling test
];
```

### Access Demo
Visit: `http://localhost:5173/avatar-image-demo`

## Performance Notes

### Texture Memory Management
- Three.js automatically handles texture cleanup
- Images are cached per URL to avoid re-downloads
- Component unmounting properly disposes materials

### Loading Optimization
- Images load asynchronously (non-blocking)
- Consider preloading critical avatars
- Use loading states for better UX

### Network Considerations
- Implement image resizing on upload
- Use CDN for avatar serving in production
- Consider WebP format for better compression

## Troubleshooting

### Common Issues

1. **Images not loading**
   - Check CORS headers on image server
   - Verify URL accessibility
   - Check browser console for network errors

2. **Poor image quality**
   - Ensure source image is high resolution
   - Use PNG for better quality
   - Check texture filtering settings

3. **Slow loading**
   - Optimize image file sizes
   - Implement progressive loading
   - Use appropriate image formats

### Debug Mode
```jsx
<CustomAvatar 
  // ... props
  debug={true}  // Enables console logging
/>
```