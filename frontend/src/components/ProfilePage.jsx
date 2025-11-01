// components/ProfilePage.jsx
const ProfilePage = () => {
  const [user, setUser] = useState({});
  const [newAvatar, setNewAvatar] = useState(null);
  
  useEffect(() => {
    const fetchUser = async () => {
      const userData = await getCurrentUser();
      setUser(userData.user);
    };
    fetchUser();
  }, []);

  
  
  const handleAvatarUpload = async () => {
    

    const apiKey = import.meta.env.VITE_IMGBB_API_KEY;
    if (!apiKey) {
    alert("Image upload service not configured. Please contact admin.");
    return;
    }

    const formData = new FormData();
    formData.append('image', newAvatar);
    
    const response = await fetch(`https://api.imgbb.com/1/upload?key=${import.meta.env.VITE_IMGBB_API_KEY}`, {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    const avatarUrl = data.data.url;
    
    // Save to backend
    await apiClient.put('/api/auth/profile', { avatar_url: avatarUrl });
    setUser(prev => ({ ...prev, avatar_url: avatarUrl }));
  };
  
  return (
    <div>
      <img src={user.avatar_url} className="w-20 h-20 rounded-full" />
      <input type="file" onChange={(e) => setNewAvatar(e.target.files[0])} />
      <button onClick={handleAvatarUpload}>Upload Avatar</button>
    </div>
  );
};