export const formatTokens = (amount) => {
  if (!amount && amount !== 0) return '0.00';
  return parseFloat(amount).toFixed(2);
};

export const formatCurrency = (amount) => {
  if (!amount && amount !== 0) return '₦0.00';
  return `₦${parseFloat(amount).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
