// frontend/src/hooks/useAuth.js
// ✅ FIXED: Just re-export the AuthContext hook to avoid duplicate auth logic
import { useAuth as useAuthContext } from '../contexts/AuthContext';

export default useAuthContext;