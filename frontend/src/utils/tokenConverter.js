/**
 * Token Conversion Utility
 * Base rate: 1 token = $0.10 USD
 * 
 * Handles conversion between fiat currencies and platform tokens
 * with support for multiple currencies via exchange rates.
 */

const BASE_TOKEN_RATE_USD = 0.10; // $0.10 per token

/**
 * Exchange rates (approximate - can be fetched from backend in production)
 * For NGN: Platform rate is 1 token = ₦122
 * All rates are relative to USD base ($0.10 per token)
 */
export const EXCHANGE_RATES = {
  USD: 1.00,
  NGN: 122.00,   // ₦122 = 1 token (platform rate)
  GHS: 12.50,    // ₵12.50 = $1
  KES: 150.00,   // KSh150 = $1
  ZAR: 18.50,    // R18.50 = $1
  EUR: 0.92,     // €0.92 = $1
  GBP: 0.79,     // £0.79 = $1
};

/**
 * Currency symbols mapping
 */
export const CURRENCY_SYMBOLS = {
  USD: '$',
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh',
  ZAR: 'R',
  EUR: '€',
  GBP: '£',
};

/**
 * Supported currencies list
 * Currently NGN only (Paystack Nigeria)
 * Other currencies commented out until Stripe/international support added
 */
export const SUPPORTED_CURRENCIES = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦' },
  // Coming soon with Stripe:
  // { code: 'USD', name: 'US Dollar', symbol: '$' },
  // { code: 'GHS', name: 'Ghanaian Cedi', symbol: '₵' },
  // { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh' },
  // { code: 'EUR', name: 'Euro', symbol: '€' },
  // { code: 'GBP', name: 'British Pound', symbol: '£' },
];

/**
 * Detect user's currency based on browser locale
 * @returns {string} Currency code (USD, NGN, etc.)
 */
export const detectUserCurrency = () => {
  // MVP: NGN only (Paystack Nigeria)
  // Will add multi-currency when Stripe is integrated
  return 'NGN';
  
  /* Multi-currency support (coming soon):
  try {
    const locale = navigator.language || 'en-US';
    const region = locale.split('-')[1]?.toUpperCase();
    
    const currencyMap = {
      'NG': 'NGN',
      'GH': 'GHS',
      'KE': 'KES',
      'ZA': 'ZAR',
      'US': 'USD',
      'GB': 'GBP',
    };
    
    // Check if region is in EU countries
    const euCountries = ['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'PT', 'IE', 'FI', 'GR'];
    if (euCountries.includes(region)) {
      return 'EUR';
    }
    
    return currencyMap[region] || 'NGN';
  } catch (error) {
    console.error('Error detecting currency:', error);
    return 'NGN';
  }
  */
};

/**
 * Convert fiat amount to tokens
 * @param {number} fiatAmount - Amount in fiat currency
 * @param {string} currency - Currency code (USD, NGN, EUR, GBP, etc.)
 * @returns {number} Equivalent tokens (rounded to nearest integer)
 */
export const convertFiatToTokens = (fiatAmount, currency = 'USD') => {
  if (!fiatAmount || fiatAmount <= 0) return 0;
  
  // For NGN, direct conversion: amount / 122 = tokens
  if (currency === 'NGN') {
    const tokens = fiatAmount / EXCHANGE_RATES.NGN;
    // Multiply by 100 to convert to cents (storage format)
    return Math.round(tokens * 100);
  }
  
  // For other currencies, convert to USD first
  let usdAmount = fiatAmount;
  
  if (currency !== 'USD') {
    const exchangeRate = EXCHANGE_RATES[currency];
    if (!exchangeRate) {
      console.warn(`Unknown currency: ${currency}, defaulting to USD`);
      const tokens = fiatAmount / BASE_TOKEN_RATE_USD;
      return Math.round(tokens * 100);
    }
    usdAmount = fiatAmount / exchangeRate;
  }
  
  // Convert USD to tokens (1 token = $0.10)
  const tokens = usdAmount / BASE_TOKEN_RATE_USD;
  // Multiply by 100 to convert to cents (storage format)
  return Math.round(tokens * 100);
};

/**
 * Convert tokens to fiat amount
 * @param {number} tokens - Number of tokens
 * @param {string} currency - Target currency code
 * @returns {number} Equivalent fiat amount
 */
export const convertTokensToFiat = (tokens, currency = 'USD') => {
  if (!tokens || tokens <= 0) return 0;
  
  // Convert tokens to USD
  const usdAmount = tokens * BASE_TOKEN_RATE_USD;
  
  // Convert to target currency
  if (currency === 'USD') {
    return usdAmount;
  }
  
  const exchangeRate = EXCHANGE_RATES[currency];
  if (!exchangeRate) {
    console.warn(`Unknown currency: ${currency}, returning USD equivalent`);
    return usdAmount;
  }
  
  return usdAmount * exchangeRate;
};

/**
 * Format token amount with label
 * @param {number} cents - Number of cents (token value stored as cents)
 * @returns {string} Formatted string (e.g., "0.82 tokens")
 */
export const formatTokens = (cents) => {
  if (!cents && cents !== 0) return '0.00 tokens';
  const tokens = cents / 100;
  return `${tokens.toFixed(2)} token${tokens === 1 ? '' : 's'}`;
};

/**
 * Format currency amount with symbol
 * @param {number} amount - Amount in currency
 * @param {string} currency - Currency code
 * @returns {string} Formatted string (e.g., "$5.00", "₦5,000")
 */
export const formatCurrency = (amount, currency = 'USD') => {
  if (!amount && amount !== 0) return `${CURRENCY_SYMBOLS[currency] || currency}0.00`;
  
  const symbol = CURRENCY_SYMBOLS[currency] || currency;
  
  // Different formatting for different currencies
  const decimals = ['NGN', 'KES', 'GHS'].includes(currency) ? 0 : 2;
  
  const formattedAmount = parseFloat(amount).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return `${symbol}${formattedAmount}`;
};

/**
 * Get currency symbol
 * @param {string} currency - Currency code
 * @returns {string} Currency symbol
 */
export const getCurrencySymbol = (currency) => {
  return CURRENCY_SYMBOLS[currency] || currency;
};

/**
 * Validate price amount
 * @param {number} amount - Price amount
 * @param {string} currency - Currency code
 * @returns {object} Validation result { valid: boolean, error: string }
 */
export const validatePrice = (amount, currency) => {
  if (!amount || amount <= 0) {
    return { valid: false, error: 'Price must be greater than 0' };
  }
  
  // Maximum: 10,000 tokens
  const maxTokens = 10000;
  const tokens = convertFiatToTokens(amount, currency);
  
  if (tokens > maxTokens) {
    const maxAmount = convertTokensToFiat(maxTokens, currency);
    return { 
      valid: false, 
      error: `Maximum price is ${formatCurrency(maxAmount, currency)} (${maxTokens} tokens)` 
    };
  }
  
  return { valid: true, error: null };
};

/**
 * Calculate early bird price from discount percentage
 * @param {number} regularPrice - Regular price amount
 * @param {number} discountPercent - Discount percentage (e.g., 20 for 20%)
 * @returns {number} Early bird price
 */
export const calculateEarlyBirdPrice = (regularPrice, discountPercent) => {
  if (!regularPrice || !discountPercent) return 0;
  const discount = (regularPrice * discountPercent) / 100;
  return regularPrice - discount;
};

/**
 * Calculate discount percentage from regular and early bird prices
 * @param {number} regularPrice - Regular price amount
 * @param {number} earlyBirdPrice - Early bird price amount
 * @returns {number} Discount percentage
 */
export const calculateDiscountPercent = (regularPrice, earlyBirdPrice) => {
  if (!regularPrice || !earlyBirdPrice || earlyBirdPrice >= regularPrice) return 0;
  const discount = regularPrice - earlyBirdPrice;
  return Math.round((discount / regularPrice) * 100);
};

export default {
  EXCHANGE_RATES,
  CURRENCY_SYMBOLS,
  SUPPORTED_CURRENCIES,
  detectUserCurrency,
  convertFiatToTokens,
  convertTokensToFiat,
  formatTokens,
  formatCurrency,
  getCurrencySymbol,
  validatePrice,
  calculateEarlyBirdPrice,
  calculateDiscountPercent,
};
