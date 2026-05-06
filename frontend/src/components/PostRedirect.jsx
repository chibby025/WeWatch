// WeWatch/frontend/src/components/PostRedirect.jsx
// Redirect component for /post/:id URLs (shareable post links)
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

const PostRedirect = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to lobby with post state
    navigate('/lobby', {
      state: {
        openPost: parseInt(id),
        autoPlay: true
      },
      replace: true
    });
  }, [id, navigate]);

  return null;
};

export default PostRedirect;
