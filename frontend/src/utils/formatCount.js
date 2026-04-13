// Format large numbers into short form (1.2K, 2.5M, etc.)
export const formatCount = (count) => {
  if (count === null || count === undefined) return '0';
  
  const num = parseInt(count);
  
  if (isNaN(num)) return '0';
  
  if (num < 1000) {
    return num.toString();
  }
  
  if (num < 1000000) {
    const k = (num / 1000).toFixed(1);
    return k.endsWith('.0') ? k.slice(0, -2) + 'K' : k + 'K';
  }
  
  const m = (num / 1000000).toFixed(1);
  return m.endsWith('.0') ? m.slice(0, -2) + 'M' : m + 'M';
};
