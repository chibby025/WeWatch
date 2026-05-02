// frontend/src/utils/ageUtils.js
// Utility functions for age calculation and age-related logic

/**
 * Calculate user's age from date of birth
 * @param {string|Date} dateOfBirth - Date of birth (ISO string or Date object)
 * @returns {number} Age in years (0 if invalid date)
 */
export function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return 0;

  const birthDate = new Date(dateOfBirth);
  
  // Check if valid date
  if (isNaN(birthDate.getTime())) return 0;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  // Adjust if birthday hasn't occurred this year yet
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }

  return age >= 0 ? age : 0;
}

/**
 * Check if user meets minimum age requirement
 * @param {string|Date} dateOfBirth - Date of birth
 * @param {number} minAge - Minimum required age
 * @returns {boolean} True if user meets minimum age
 */
export function meetsAgeRequirement(dateOfBirth, minAge) {
  const age = calculateAge(dateOfBirth);
  return age >= minAge;
}

/**
 * Get age category/rating eligibility
 * @param {string|Date} dateOfBirth - Date of birth
 * @returns {string[]} Array of eligible content rating IDs
 */
export function getEligibleRatings(dateOfBirth) {
  const age = calculateAge(dateOfBirth);
  
  if (age === 0) return ['G', 'PG', 'Educational', 'Religious']; // Unknown age - only safe content
  
  const eligible = ['G', 'PG', 'Educational', 'Religious'];
  
  if (age >= 13) eligible.push('13+');
  if (age >= 16) eligible.push('16+');
  if (age >= 18) eligible.push('18+', 'Mature');
  
  return eligible;
}
