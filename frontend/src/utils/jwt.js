// WeWatch/frontend/src/utils/jwt.js
// --- CORRECT IMPORT using Named Export ---
import { jwtDecode } from 'jwt-decode'; // <-- Use { jwtDecode } for named export
// --- --- ---

/**
 * Decodes a JWT token and returns the payload.
 * @param {string} token - The JWT token string.
 * @returns {Object|null} The decoded payload object, or null if decoding fails.
 */
export const jwtDecodeUtil = (token) => { // Renamed function to avoid conflict
  try {
    if (!token) {
      console.warn("jwtDecodeUtil: No token provided for decoding.");
      return null;
    }
    // --- USE THE IMPORTED jwtDecode FUNCTION ---
    // Use the jwtDecode function from the jwt-decode library to parse the token
    const decoded = jwtDecode(token); // <-- Use the imported jwtDecode function
    console.log("jwtDecodeUtil: Token decoded successfully:", decoded);
    return decoded;
  } catch (error) {
    console.error("jwtDecodeUtil: Error decoding token:", error);
    return null; // Return null on failure
  }
};

// Export the renamed utility function
export default jwtDecodeUtil;