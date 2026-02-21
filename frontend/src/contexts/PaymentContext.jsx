/**
 * Payment Context
 * Global state management for payment-related data
 * - Wallet balance & transactions
 * - Payment accounts
 * - Earnings & payouts
 * - KYC status
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getWallet,
  getWalletStats,
  getPaymentAccounts,
  getKYCStatus,
  getEarningsSummary
} from '../services/paymentApi';

const PaymentContext = createContext();

export const usePayment = () => {
  const context = useContext(PaymentContext);
  if (!context) {
    throw new Error('usePayment must be used within a PaymentProvider');
  }
  return context;
};

export const PaymentProvider = ({ children }) => {
  // Wallet state
  const [wallet, setWallet] = useState(null);
  const [walletStats, setWalletStats] = useState(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  
  // Payment accounts state
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [primaryAccount, setPrimaryAccount] = useState(null);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  
  // KYC state
  const [kycStatus, setKycStatus] = useState(null);
  const [loadingKYC, setLoadingKYC] = useState(false);
  
  // Earnings state
  const [earnings, setEarnings] = useState(null);
  const [loadingEarnings, setLoadingEarnings] = useState(false);
  
  // Error state
  const [error, setError] = useState(null);

  /**
   * Fetch wallet data
   */
  const fetchWallet = useCallback(async () => {
    try {
      setLoadingWallet(true);
      setError(null);
      
      const [walletData, statsData] = await Promise.all([
        getWallet(),
        getWalletStats()
      ]);
      
      setWallet(walletData.wallet);
      setWalletStats(statsData);
      
      return walletData.wallet;
    } catch (err) {
      console.error('Failed to fetch wallet:', err);
      setError(err.response?.data?.error || 'Failed to load wallet data');
      throw err;
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  /**
   * Fetch payment accounts
   */
  const fetchPaymentAccounts = useCallback(async () => {
    try {
      setLoadingAccounts(true);
      setError(null);
      
      const data = await getPaymentAccounts();
      setPaymentAccounts(data.accounts || []);
      
      // Find primary account
      const primary = data.accounts?.find(acc => acc.is_primary);
      setPrimaryAccount(primary || null);
      
      return data.accounts;
    } catch (err) {
      console.error('Failed to fetch payment accounts:', err);
      setError(err.response?.data?.error || 'Failed to load payment accounts');
      throw err;
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  /**
   * Fetch KYC status
   */
  const fetchKYCStatus = useCallback(async () => {
    try {
      setLoadingKYC(true);
      setError(null);
      
      const data = await getKYCStatus();
      setKycStatus(data.kyc_status);
      
      return data.kyc_status;
    } catch (err) {
      console.error('Failed to fetch KYC status:', err);
      // KYC might not exist yet - that's okay
      if (err.response?.status !== 404) {
        setError(err.response?.data?.error || 'Failed to load KYC status');
      }
      return null;
    } finally {
      setLoadingKYC(false);
    }
  }, []);

  /**
   * Fetch earnings summary
   */
  const fetchEarnings = useCallback(async () => {
    try {
      setLoadingEarnings(true);
      setError(null);
      
      const data = await getEarningsSummary();
      setEarnings(data);
      
      return data;
    } catch (err) {
      console.error('Failed to fetch earnings:', err);
      setError(err.response?.data?.error || 'Failed to load earnings');
      throw err;
    } finally {
      setLoadingEarnings(false);
    }
  }, []);

  /**
   * Refresh all payment data
   */
  const refreshPaymentData = useCallback(async () => {
    try {
      await Promise.all([
        fetchWallet(),
        fetchPaymentAccounts(),
        fetchKYCStatus(),
        fetchEarnings()
      ]);
    } catch (err) {
      console.error('Failed to refresh payment data:', err);
    }
  }, [fetchWallet, fetchPaymentAccounts, fetchKYCStatus, fetchEarnings]);

  /**
   * Update wallet balance after transaction
   */
  const updateWalletBalance = useCallback((newBalance) => {
    setWallet(prev => prev ? { ...prev, token_balance: newBalance } : null);
  }, []);

  /**
   * Check if user can withdraw (has verified payment account & KYC)
   */
  const canWithdraw = useCallback(() => {
    const hasVerifiedAccount = paymentAccounts.some(acc => acc.is_verified);
    const isKYCApproved = kycStatus?.status === 'approved';
    return hasVerifiedAccount && isKYCApproved;
  }, [paymentAccounts, kycStatus]);

  /**
   * Get available withdrawal balance
   */
  const getWithdrawableBalance = useCallback(() => {
    const tokenBalance = wallet?.token_balance || 0;
    const gatewayEarnings = earnings?.total_available_for_withdrawal || 0;
    return {
      tokens: tokenBalance,
      earnings: gatewayEarnings,
      total: tokenBalance + gatewayEarnings
    };
  }, [wallet, earnings]);

  /**
   * Check if user needs KYC
   */
  const needsKYC = useCallback(() => {
    return !kycStatus || kycStatus.status === 'rejected';
  }, [kycStatus]);

  /**
   * Check if KYC is pending
   */
  const isKYCPending = useCallback(() => {
    return kycStatus?.status === 'pending';
  }, [kycStatus]);

  // Initial load on mount
  useEffect(() => {
    const token = localStorage.getItem('wewatch_token');
    if (token) {
      refreshPaymentData();
    }
  }, []);

  const value = {
    // Wallet
    wallet,
    walletStats,
    loadingWallet,
    fetchWallet,
    updateWalletBalance,
    
    // Payment Accounts
    paymentAccounts,
    primaryAccount: paymentAccounts.find(acc => acc.is_primary) || null,
    loadingAccounts,
    fetchPaymentAccounts,
    
    // KYC
    kycStatus,
    loadingKYC,
    fetchKYCStatus,
    needsKYC,
    isKYCPending,
    
    // Earnings
    earnings,
    loadingEarnings,
    fetchEarnings,
    
    // Utilities
    canWithdraw,
    getWithdrawableBalance,
    refreshPaymentData,
    
    // Error
    error,
    setError
  };

  return (
    <PaymentContext.Provider value={value}>
      {children}
    </PaymentContext.Provider>
  );
};

export default PaymentContext;
