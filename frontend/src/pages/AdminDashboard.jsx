// frontend/src/pages/AdminDashboard.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient, { 
  getAdminPendingPayouts, 
  getAdminProcessingPayouts,
  approveAdminPayout, 
  rejectAdminPayout,
  completeAdminPayout,
  getAdminKYCs,
  approveKYC,
  rejectKYC
} from '../services/api';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { 
  ArrowDownTrayIcon, 
  ArrowPathIcon, 
  ChartBarIcon,
  XMarkIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import toast, { Toaster } from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [tokenSpendingData, setTokenSpendingData] = useState(null);
  const [topDonorsData, setTopDonorsData] = useState(null);
  const [eventAnalytics, setEventAnalytics] = useState(null);
  const [pendingPayouts, setPendingPayouts] = useState([]);
  const [processingPayouts, setProcessingPayouts] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState({ action: '', admin_id: '', start_date: '', end_date: '' });
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [transferringCommission, setTransferringCommission] = useState(false);
  const [processingPayout, setProcessingPayout] = useState(null);
  
  // KYC Management State
  const [kycSubmissions, setKycSubmissions] = useState([]);
  const [kycStatusFilter, setKycStatusFilter] = useState('pending');
  const [kycSearchTerm, setKycSearchTerm] = useState('');
  const [processingKYC, setProcessingKYC] = useState(null);
  const [selectedKYCDoc, setSelectedKYCDoc] = useState(null);
  const [showDocViewer, setShowDocViewer] = useState(false);

  // Check if user is super admin
  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    
    if (currentUser.role !== 'super_admin') {
      toast.error('Access denied. Super admin only.');
      navigate('/lobby');
    }
  }, [currentUser, navigate]);

  // Fetch audit logs
  const fetchAuditLogs = async (page = 1, filters = {}) => {
    try {
      const params = new URLSearchParams({ page, limit: 20, ...filters });
      const response = await apiClient.get(`/api/admin/audit-logs?${params}`);
      setAuditLogs(response.data.logs || []);
      setAuditTotal(response.data.total || 0);
      setAuditPage(page);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
      toast.error('Failed to load audit logs');
    }
  };

  // Fetch analytics data
  const fetchAnalytics = async () => {
    try {
      const [analyticsRes, tokenSpendingRes, topDonorsRes, eventAnalyticsRes, pendingPayoutsRes, processingPayoutsRes] = await Promise.all([
        apiClient.get('/api/admin/analytics'),
        apiClient.get('/api/admin/token-spending-analytics'),
        apiClient.get('/api/donations/top-donors?limit=20'),
        apiClient.get('/api/admin/event-analytics'),
        getAdminPendingPayouts(),
        getAdminProcessingPayouts()
      ]);
      
      setAnalytics(analyticsRes.data);
      setTokenSpendingData(tokenSpendingRes.data);
      setTopDonorsData(topDonorsRes.data);
      setEventAnalytics(eventAnalyticsRes.data);
      setPendingPayouts(pendingPayoutsRes.payouts || []);
      setProcessingPayouts(processingPayoutsRes.payouts || []);
      setLastUpdated(new Date());
      setLoading(false);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
      toast.error('Failed to load analytics data');
      setLoading(false);
    }
  };

  // Fetch KYC submissions
  const fetchKYCs = async (status = 'pending') => {
    try {
      const response = await getAdminKYCs(status);
      setKycSubmissions(response.kyc_submissions || []);
    } catch (error) {
      console.error('Failed to fetch KYC submissions:', error);
      toast.error('Failed to load KYC submissions');
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchAnalytics();
    fetchAuditLogs();
    fetchKYCs('pending');
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    
    const interval = setInterval(() => {
      fetchAnalytics();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Export audit logs to CSV (separate from analytics export)
  const exportAuditLogsToCSV = async () => {
    try {
      toast.loading('Exporting audit logs...');
      
      // Fetch all logs (up to 1000) for export
      const params = new URLSearchParams({ page: 1, limit: 1000, ...auditFilter });
      const response = await apiClient.get(`/api/admin/audit-logs?${params}`);
      const logs = response.data.logs || [];
      
      if (logs.length === 0) {
        toast.error('No audit logs to export');
        return;
      }

      // CSV headers
      const headers = ['ID', 'Date', 'Admin', 'Action', 'Target Type', 'Target ID', 'IP Address', 'Success', 'Details'];
      
      // CSV rows
      const rows = logs.map(log => [
        log.id,
        new Date(log.created_at).toLocaleString(),
        log.admin?.username || log.admin_id,
        log.action,
        log.target_type || 'N/A',
        log.target_id || 'N/A',
        log.ip_address || 'N/A',
        log.success ? 'Yes' : 'No',
        log.details || ''
      ]);

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `admin-audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success(`Exported ${logs.length} audit logs`);
    } catch (error) {
      console.error('Failed to export audit logs:', error);
      toast.dismiss();
      toast.error('Failed to export audit logs');
    }
  };

  // Export analytics to CSV
  const exportToCSV = () => {
    if (!analytics) return;

    const csvData = [
      ['WeWatch Platform Analytics Export'],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['OVERVIEW METRICS'],
      ['Total Revenue (GMV)', analytics.revenue.all_time.gmv],
      ['Platform Revenue (15%)', analytics.revenue.all_time.platform_revenue],
      ['Total Users', analytics.users.total],
      ['Total Watch Sessions', analytics.sessions.total],
      ['Total Tokens Purchased', analytics.tokens.all_time.purchased],
      ['Total Withdrawn', analytics.payouts.total_withdrawn],
      [''],
      ['TODAY METRICS'],
      ['Revenue Today', analytics.revenue.today.gmv],
      ['New Users Today', analytics.users.new_today],
      ['Sessions Today', analytics.sessions.today],
      ['Tokens Today', analytics.tokens.today.purchased],
      [''],
      ['PLATFORM ACCOUNTING'],
      ['Revenue Account (Your 15%)', analytics.platform_accounting.revenue_balance],
      ['Reserve Account (Host 85%)', analytics.platform_accounting.reserve_balance],
      ['Total Gateway Balance', analytics.platform_accounting.total_gateway_balance],
      ['Pending Payouts', analytics.platform_accounting.pending_payouts],
      ['Available Reserve', analytics.platform_accounting.available_reserve],
      ['Is Balanced', analytics.platform_accounting.is_balanced ? 'Yes' : 'No'],
      [''],
      ['TOP HOSTS'],
      ['Rank', 'Username', 'Revenue', 'Tickets Sold'],
      ...analytics.top_hosts.map((host, i) => [
        i + 1,
        host.username,
        host.revenue,
        host.tickets_sold
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wewatch-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Analytics exported to CSV');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading analytics...</div>
      </div>
    );
  }

  if (!analytics || !tokenSpendingData || !topDonorsData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">Failed to load analytics. Please try again.</div>
      </div>
    );
  }

  // Helper function to format tokens with decimals
  const formatTokens = (amount) => {
    if (!amount && amount !== 0) return '0.00';
    return parseFloat(amount).toFixed(2);
  };

  // Helper function to format currency
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '₦0.00';
    return `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Handle token donation commission transfer
  const handleTransferCommission = async () => {
    if (!analytics?.token_donations?.available_to_transfer || analytics.token_donations.available_to_transfer <= 0) {
      toast.error('No commission available to transfer');
      return;
    }

    if (!window.confirm(`Transfer ${formatCurrency(analytics.token_donations.available_to_transfer)} to Revenue account?\n\nNote: This will log the transfer request. Complete the actual transfer via Paystack Dashboard.`)) {
      return;
    }

    setTransferringCommission(true);
    try {
      const response = await apiClient.post('/api/admin/transfer-donation-commission');
      toast.success(`✅ Transfer logged: ${formatCurrency(response.data.amount)}\nComplete via Paystack Dashboard.`);
      
      // Refresh analytics to show updated balance
      await fetchAnalytics();
    } catch (error) {
      console.error('Transfer failed:', error);
      toast.error(error.response?.data?.error || 'Transfer failed. Please try again.');
    } finally {
      setTransferringCommission(false);
    }
  };

  // Handle withdrawal approval
  const handleApprovePayout = async (payoutId) => {
    if (!window.confirm('Approve this withdrawal? The transfer will be initiated immediately.')) {
      return;
    }

    setProcessingPayout(payoutId);
    try {
      await approveAdminPayout(payoutId);
      toast.success('✅ Withdrawal approved and processing!');
      await fetchAnalytics(); // Refresh to update pending list
    } catch (error) {
      console.error('Approval failed:', error);
      toast.error(error.response?.data?.error || 'Failed to approve withdrawal');
    } finally {
      setProcessingPayout(null);
    }
  };

  // Handle withdrawal rejection
  const handleRejectPayout = async (payoutId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    setProcessingPayout(payoutId);
    try {
      await rejectAdminPayout(payoutId, reason);
      toast.success('❌ Withdrawal rejected');
      await fetchAnalytics(); // Refresh to update pending list
    } catch (error) {
      console.error('Rejection failed:', error);
      toast.error(error.response?.data?.error || 'Failed to reject withdrawal');
    } finally {
      setProcessingPayout(null);
    }
  };

  // Handle manual payout completion (after admin manually transfers via Paystack dashboard)
  const handleCompletePayout = async (payoutId) => {
    const transferReference = window.prompt('Enter Paystack transfer reference (optional):');
    
    if (!window.confirm('Confirm that you have manually transferred the funds via Paystack dashboard and want to mark this payout as completed?')) {
      return;
    }

    setProcessingPayout(payoutId);
    try {
      await completeAdminPayout(payoutId, transferReference);
      toast.success('✅ Payout marked as completed!');
      await fetchAnalytics(); // Refresh to update list
    } catch (error) {
      console.error('Completion failed:', error);
      toast.error(error.response?.data?.error || 'Failed to mark payout as completed');
    } finally {
      setProcessingPayout(null);
    }
  };

  // Handle KYC approval
  const handleApproveKYC = async (kycId) => {
    if (!window.confirm('Approve this KYC submission? User will be verified.')) {
      return;
    }

    setProcessingKYC(kycId);
    try {
      await approveKYC(kycId);
      toast.success('✅ KYC approved successfully!');
      await fetchKYCs(kycStatusFilter); // Refresh KYC list
    } catch (error) {
      console.error('KYC approval failed:', error);
      toast.error(error.response?.data?.error || 'Failed to approve KYC');
    } finally {
      setProcessingKYC(null);
    }
  };

  // Handle KYC rejection
  const handleRejectKYC = async (kycId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;

    setProcessingKYC(kycId);
    try {
      await rejectKYC(kycId, reason);
      toast.success('❌ KYC rejected');
      await fetchKYCs(kycStatusFilter); // Refresh KYC list
    } catch (error) {
      console.error('KYC rejection failed:', error);
      toast.error(error.response?.data?.error || 'Failed to reject KYC');
    } finally {
      setProcessingKYC(null);
    }
  };

  // Open document viewer modal
  const viewDocument = (kyc, docType) => {
    setSelectedKYCDoc({ kyc, docType });
    setShowDocViewer(true);
  };

  // Filter KYC submissions by search term
  const filteredKYCs = kycSubmissions.filter(kyc => {
    if (!kycSearchTerm) return true;
    const searchLower = kycSearchTerm.toLowerCase();
    return (
      kyc.user?.username?.toLowerCase().includes(searchLower) ||
      kyc.user?.email?.toLowerCase().includes(searchLower) ||
      kyc.full_name?.toLowerCase().includes(searchLower)
    );
  });


  // Prepare chart data
  const revenueChartData = [
    { name: 'Today', gmv: analytics.revenue.today.gmv, platform: analytics.revenue.today.platform_revenue },
    { name: 'Week', gmv: analytics.revenue.week.gmv, platform: analytics.revenue.week.platform_revenue },
    { name: 'Month', gmv: analytics.revenue.month.gmv, platform: analytics.revenue.month.platform_revenue },
    { name: 'Quarter', gmv: analytics.revenue.quarter.gmv, platform: analytics.revenue.quarter.platform_revenue },
    { name: 'Year', gmv: analytics.revenue.year.gmv, platform: analytics.revenue.year.platform_revenue },
  ];

  const sessionChartData = [
    { name: 'Today', sessions: analytics.sessions.today },
    { name: 'Week', sessions: analytics.sessions.week },
    { name: 'Month', sessions: analytics.sessions.month },
    { name: 'Quarter', sessions: analytics.sessions.quarter },
    { name: 'Year', sessions: analytics.sessions.year },
  ];

  const tokenChartData = [
    { 
      name: 'Today', 
      purchased: parseFloat(analytics.tokens.today.purchased || 0), 
      spent: parseFloat(analytics.tokens.today.spent || 0) 
    },
    { 
      name: 'Week', 
      purchased: parseFloat(analytics.tokens.week.purchased || 0), 
      spent: parseFloat(analytics.tokens.week.spent || 0) 
    },
    { 
      name: 'Month', 
      purchased: parseFloat(analytics.tokens.month.purchased || 0), 
      spent: parseFloat(analytics.tokens.month.spent || 0) 
    },
  ];

  const accountingPieData = [
    { name: 'Platform Profit (25% - formerly 15%)', value: analytics.platform_accounting.platform_profit, color: '#10b981' },
    { name: 'Host Reserve (75% - formerly 85%)', value: analytics.platform_accounting.reserve_balance, color: '#3b82f6' },
  ];

  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-6">
      <Toaster position="top-center" />

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2">🎯 Admin Dashboard</h1>
            <p className="text-gray-300">
              Last updated: {lastUpdated?.toLocaleTimeString()} • 
              <span className={`ml-2 ${autoRefresh ? 'text-green-400' : 'text-gray-400'}`}>
                Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
              </span>
            </p>
          </div>
          
          <div className="flex gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-4 py-2 rounded-lg font-semibold transition-colors ${
                autoRefresh 
                  ? 'bg-green-600 hover:bg-green-700' 
                  : 'bg-gray-600 hover:bg-gray-700'
              }`}
            >
              {autoRefresh ? '⏸️ Pause' : '▶️ Resume'}
            </button>
            <button
              onClick={fetchAnalytics}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold flex items-center gap-2"
            >
              <ArrowPathIcon className="h-5 w-5" />
              Refresh
            </button>
            <button
              onClick={exportToCSV}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold flex items-center gap-2"
            >
              <ArrowDownTrayIcon className="h-5 w-5" />
              Export CSV
            </button>
            <button
              onClick={() => navigate('/lobby')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold flex items-center gap-2"
            >
              <XMarkIcon className="h-5 w-5" />
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">
        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            title="Total Platform Revenue"
            value={`₦${analytics.revenue.all_time.gmv.toLocaleString()}`}
            subtitle="All NET money that entered"
            color="bg-blue-600"
          />
          <MetricCard
            title="Your Platform Profit"
            value={`₦${analytics.revenue.all_time.platform_revenue.toLocaleString()}`}
            subtitle="15% commission (withdraw safely)"
            color="bg-green-600"
          />
          <MetricCard
            title="Total Minted Tokens"
            value={`${formatTokens(analytics.tokens.total_minted)} 🪙`}
            subtitle="All tokens purchased"
            color="bg-yellow-600"
          />
          <MetricCard
            title="Total Users"
            value={analytics.users.total.toLocaleString()}
            subtitle={`+${analytics.users.new_today} today`}
            color="bg-purple-600"
          />
          <MetricCard
            title="Total Sessions"
            value={analytics.sessions.total.toLocaleString()}
            subtitle={`${analytics.sessions.active} active now`}
            color="bg-orange-600"
          />
        </div>

        {/* Today's Activity */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            📅 Today's Activity
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <TodayMetric label="Revenue" value={`₦${analytics.revenue.today.gmv.toLocaleString()}`} />
            <TodayMetric label="New Users" value={analytics.users.new_today} />
            <TodayMetric label="Sessions" value={analytics.sessions.today} />
            <TodayMetric label="Tokens Purchased" value={`${formatTokens(analytics.tokens.today.purchased)} 🪙`} />
            <TodayMetric label="Tickets" value={analytics.revenue.today.tickets_sold} />
            <TodayMetric label="Platform Revenue" value={`₦${analytics.revenue.today.platform_revenue.toLocaleString()}`} />
          </div>
        </div>

        {/* Platform Accounting - Critical Section */}
        <div className="bg-gradient-to-r from-yellow-600/20 to-red-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-500/50">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            🏦 Platform Accounting {!analytics.platform_accounting.is_balanced && <span className="text-red-500 text-sm">⚠️ IMBALANCED</span>}
          </h2>
          
          {/* Revenue Breakdown */}
          <div className="bg-blue-900/30 rounded-lg p-4 mb-4 border border-blue-500/30">
            <h3 className="text-lg font-semibold mb-3">📊 Revenue Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-400">Total Platform Revenue</div>
                <div className="text-xl font-bold text-green-400">
                  {formatCurrency(analytics.platform_accounting.total_platform_revenue || 0)}
                </div>
                <div className="text-xs text-green-300">All NET money that entered platform</div>
              </div>
              <div>
                <div className="text-gray-400">Your Platform Profit</div>
                <div className="text-xl font-bold text-blue-400">
                  {formatCurrency(analytics.platform_accounting.platform_profit || 0)}
                </div>
                <div className="text-xs text-blue-300">15% commission (withdraw safely)</div>
              </div>
              <div>
                <div className="text-gray-400">Host Reserve Pool</div>
                <div className="text-2xl font-bold text-yellow-400">
                  {formatCurrency(analytics.platform_accounting.reserve_balance || 0)}
                </div>
                <div className="text-xs text-yellow-300">85% owed to hosts (DO NOT TOUCH)</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <AccountingCard
              title="Platform Profit"
              value={`₦${(analytics.platform_accounting.platform_profit || 0).toLocaleString()}`}
              subtitle="✅ Can withdraw safely"
              bgColor="bg-green-700/30"
            />
            <AccountingCard
              title="Reserve Account (Host 85%)"
              value={`₦${analytics.platform_accounting.reserve_balance.toLocaleString()}`}
              subtitle="⚠️ DO NOT TOUCH"
              bgColor="bg-blue-700/30"
            />
            <AccountingCard
              title="Pending Payouts"
              value={`₦${analytics.payouts.pending_amount.toLocaleString()}`}
              subtitle={`${analytics.payouts.pending_count} requests`}
              bgColor="bg-yellow-700/30"
            />
            <AccountingCard
              title="Total Withdrawn"
              value={`₦${analytics.payouts.total_withdrawn.toLocaleString()}`}
              subtitle={`${analytics.payouts.completed_count} payouts`}
              bgColor="bg-purple-700/30"
            />
          </div>
          
          {/* Accounting Pie Chart */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Account Balance Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={accountingPieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value, percent }) => `${name}: ₦${value.toLocaleString()} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {accountingPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₦${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fee Revenue Breakdown Section */}
        <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur-lg rounded-xl p-6 border border-green-500/30 mb-6">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            💰 Platform Fee Revenue Breakdown
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Card className="bg-white/5 border-green-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Ticket Transfer Fees (5%)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">
                  {formatCurrency(analytics.platform_accounting.lifetime_transfer_fee_revenue || 0)}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  From gifted tickets • Additional revenue stream
                </p>
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-blue-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Wallet Gift Commission (5%)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">
                  {formatCurrency(analytics.platform_accounting.lifetime_token_donation_commission || 0)}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  From wallet-to-wallet token gifts
                </p>
                {analytics.platform_accounting.token_donation_commission > 0 && (
                  <button
                    onClick={handleTransferCommission}
                    disabled={transferringCommission}
                    className="mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-xs font-semibold disabled:opacity-50 w-full"
                  >
                    {transferringCommission ? 'Transferring...' : `Transfer ₦${analytics.platform_accounting.token_donation_commission.toLocaleString()}`}
                  </button>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white/5 border-purple-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Early Bird Savings (Informational)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-400">
                  {formatCurrency(analytics.platform_accounting.total_early_bird_savings || 0)}
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Total discounts given to early buyers
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">📊 Revenue Model Summary:</h3>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• <strong>Token Spread Profit:</strong> ₦43 per token (Buy ₦165 - Sell ₦122 = 26% margin)</li>
              <li>• <strong>Transfer Fees:</strong> 5% charged when users gift tickets to others</li>
              <li>• <strong>Gift Commission:</strong> 5% from wallet-to-wallet token gifts</li>
              <li>• <strong>Host Revenue:</strong> 100% of ticket sales (no commission) - hosts keep all tokens spent</li>
              <li>• <strong>Early Bird:</strong> Promotional savings to incentivize early purchases (tracked for analytics)</li>
            </ul>
          </div>
        </div>

        {/* Pending Withdrawals Section */}
        {pendingPayouts.length > 0 && (
          <div className="bg-gradient-to-r from-red-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-red-500/50">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              ⚠️ Pending Withdrawals 
              <span className="text-sm bg-red-600 px-3 py-1 rounded-full">{pendingPayouts.length} Waiting</span>
            </h2>
            
            <div className="bg-white/5 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/10">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold">User</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Amount</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Source</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Bank</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Date</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {pendingPayouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{payout.user?.username || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">ID: {payout.user_id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-yellow-400">
                          {formatCurrency(payout.amount_value || 0)}
                        </div>
                        <div className="text-xs text-gray-400">{payout.amount_currency || 'NGN'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          payout.payout_type === 'tokens' ? 'bg-blue-600/30 text-blue-300' : 'bg-green-600/30 text-green-300'
                        }`}>
                          {payout.payout_type === 'tokens' ? '🪙 Tokens' : '💰 Earnings'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {payout.payment_account ? (
                          <div>
                            <div className="text-white">{payout.payment_account.account_name}</div>
                            <div className="text-xs text-gray-400">{payout.payment_account.bank_name}</div>
                          </div>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {new Date(payout.created_at).toLocaleDateString()}
                        <div className="text-xs text-gray-500">
                          {new Date(payout.created_at).toLocaleTimeString()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleApprovePayout(payout.id)}
                            disabled={processingPayout === payout.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            {processingPayout === payout.id ? (
                              <>
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                Processing...
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Approve
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectPayout(payout.id)}
                            disabled={processingPayout === payout.id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                          >
                            <XCircleIcon className="h-4 w-4" />
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Manual Processing Payouts Section - Starter Account Workaround */}
        {processingPayouts.length > 0 && (
          <div className="bg-gradient-to-r from-yellow-600/20 to-blue-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-500/50 mt-6">
            <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
              ⏳ Manual Processing Required
              <span className="text-sm bg-yellow-600 px-3 py-1 rounded-full">{processingPayouts.length} Waiting</span>
            </h2>
            <p className="text-sm text-gray-300 mb-4">
              These payouts failed auto-transfer due to Paystack starter account limitation. 
              <span className="font-semibold text-yellow-300"> Manually transfer via Paystack dashboard, then mark as completed here.</span>
            </p>
            
            <div className="bg-white/5 rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-white/10">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold">User</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Amount</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Bank Details</th>
                    <th className="text-left px-4 py-3 text-sm font-semibold">Date Requested</th>
                    <th className="text-right px-4 py-3 text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {processingPayouts.map((payout) => (
                    <tr key={payout.id} className="hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{payout.user?.username || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">ID: {payout.user_id}</div>
                        <div className="text-xs text-gray-500">Payout #{payout.id}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-yellow-400 text-lg">
                          {formatCurrency(payout.amount_value || 0)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {payout.payout_type === 'tokens' ? '🪙 Token Withdrawal' : '💰 Earnings Withdrawal'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {payout.payment_account ? (
                          <div className="bg-white/5 p-2 rounded border border-white/10">
                            <div className="text-white font-semibold">{payout.payment_account.account_name}</div>
                            <div className="text-xs text-gray-400">{payout.payment_account.bank_name}</div>
                            <div className="text-xs text-blue-300 font-mono">{payout.payment_account.account_number}</div>
                          </div>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-300">
                        {new Date(payout.created_at).toLocaleDateString()}
                        <div className="text-xs text-gray-500">
                          {new Date(payout.created_at).toLocaleTimeString()}
                        </div>
                        <div className="text-xs text-yellow-400 mt-1">
                          ⏱ {Math.floor((Date.now() - new Date(payout.created_at)) / (1000 * 60 * 60))}h ago
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex flex-col items-end gap-2">
                          <button
                            onClick={() => handleCompletePayout(payout.id)}
                            disabled={processingPayout === payout.id}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 w-full justify-center"
                          >
                            {processingPayout === payout.id ? (
                              <>
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                Updating...
                              </>
                            ) : (
                              <>
                                <CheckCircleIcon className="h-4 w-4" />
                                Mark Completed
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectPayout(payout.id)}
                            disabled={processingPayout === payout.id}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 w-full justify-center"
                          >
                            <XCircleIcon className="h-4 w-4" />
                            Fail & Refund
                          </button>
                          <a
                            href="https://dashboard.paystack.com/#/transfers"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-400 hover:text-blue-300 underline"
                          >
                            Open Paystack Dashboard →
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            <div className="mt-4 bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-300 mb-2">📝 Manual Transfer Steps:</h3>
              <ol className="text-xs text-gray-300 space-y-1 list-decimal list-inside">
                <li>Log in to <a href="https://dashboard.paystack.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 underline">Paystack Dashboard</a></li>
                <li>Go to Transfers → Single Transfer</li>
                <li>Copy bank details from table above (Account Name, Bank, Account Number)</li>
                <li>Enter the exact amount shown above</li>
                <li>Complete the transfer</li>
                <li>Copy the Paystack transfer reference and click "Mark Completed" above</li>
              </ol>
            </div>
          </div>
        )}

        {/* Revenue Chart */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">📈 Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={revenueChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                formatter={(value) => `₦${value.toLocaleString()}`}
              />
              <Legend />
              <Line type="monotone" dataKey="gmv" stroke="#3b82f6" strokeWidth={2} name="GMV (Total)" />
              <Line type="monotone" dataKey="platform" stroke="#10b981" strokeWidth={2} name="Platform Revenue (15%)" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Session Activity Chart */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">🎬 Session Activity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={sessionChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
              />
              <Area type="monotone" dataKey="sessions" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.6} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Token Flow Chart */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">🪙 Token Flow</h2>
          <div className="mb-4 grid grid-cols-3 gap-4 text-sm">
            <div className="bg-green-600/20 rounded-lg p-3 border border-green-500/30">
              <div className="text-gray-300">Total Minted</div>
              <div className="text-2xl font-bold text-green-400">{formatTokens(analytics.tokens.total_minted)} 🪙</div>
            </div>
            <div className="bg-blue-600/20 rounded-lg p-3 border border-blue-500/30">
              <div className="text-gray-300">Total Spent</div>
              <div className="text-2xl font-bold text-blue-400">{formatTokens(analytics.tokens.all_time.spent)} 🪙</div>
            </div>
            <div className="bg-yellow-600/20 rounded-lg p-3 border border-yellow-500/30">
              <div className="text-gray-300">In Circulation</div>
              <div className="text-2xl font-bold text-yellow-400">
                {formatTokens((analytics.tokens.total_minted || 0) - (analytics.tokens.all_time.spent || 0))} 🪙
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={tokenChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                formatter={(value) => `${parseFloat(value).toFixed(2)} tokens`}
              />
              <Legend />
              <Bar dataKey="purchased" fill="#10b981" name="Purchased (Minted)" />
              <Bar dataKey="spent" fill="#ef4444" name="Spent (Tickets/Donations)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Token Spending Analytics Section */}
        {tokenSpendingData && (
          <>
            {/* Token Spending Summary */}
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-purple-500/50">
              <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
                🪙 Token Spending Analytics
              </h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard
                  title="Total Tokens Spent"
                  value={`${formatTokens(tokenSpendingData.summary.total_tokens_display)} 🪙`}
                  subtitle={`${tokenSpendingData.summary.total_tickets.toLocaleString()} tickets sold`}
                  color="bg-purple-600"
                />
                <MetricCard
                  title="Revenue from Tokens"
                  value={formatCurrency(tokenSpendingData.summary.total_revenue_ngn)}
                  subtitle="All token ticket sales"
                  color="bg-pink-600"
                />
                <MetricCard
                  title="Average Ticket Price"
                  value={`${formatTokens(tokenSpendingData.summary.avg_ticket_price_tokens)} 🪙`}
                  subtitle="Per ticket"
                  color="bg-indigo-600"
                />
                <MetricCard
                  title="Active Economy"
                  value={`${tokenSpendingData.summary.unique_rooms}`}
                  subtitle={`${tokenSpendingData.summary.unique_hosts} hosts earning`}
                  color="bg-blue-600"
                />
              </div>

              {/* Daily Spending Trend (Last 30 Days) */}
              {tokenSpendingData.daily_trends && tokenSpendingData.daily_trends.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">📊 Token Spending Trend (Last 30 Days)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={tokenSpendingData.daily_trends.reverse()}>
                      <defs>
                        <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
                      <XAxis 
                        dataKey="date" 
                        stroke="#fff" 
                        tick={{ fontSize: 12 }}
                        tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      />
                      <YAxis stroke="#fff" />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                        formatter={(value, name) => {
                          if (name === 'tokens_display') return [`${parseFloat(value).toFixed(2)} tokens`, 'Tokens Spent'];
                          if (name === 'ticket_count') return [value, 'Tickets'];
                          if (name === 'revenue_ngn') return [`₦${parseFloat(value).toLocaleString()}`, 'Revenue'];
                          return value;
                        }}
                        labelFormatter={(label) => new Date(label).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      />
                      <Legend />
                      <Area 
                        type="monotone" 
                        dataKey="tokens_display" 
                        stroke="#a855f7" 
                        fill="url(#tokenGradient)"
                        name="Tokens Spent"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Top Rooms by Token Spending */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4">🎬 Top Rooms by Token Spending</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-3 px-4">Rank</th>
                      <th className="text-left py-3 px-4">Room</th>
                      <th className="text-left py-3 px-4">Host</th>
                      <th className="text-right py-3 px-4">Tokens Spent</th>
                      <th className="text-right py-3 px-4">Tickets</th>
                      <th className="text-right py-3 px-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tokenSpendingData.top_rooms || []).map((room, index) => (
                      <tr key={room.room_id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 px-4">
                          <span className="text-xl">
                            {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-purple-300">{room.room_name}</div>
                          <div className="text-xs text-gray-400">ID: {room.room_id}</div>
                        </td>
                        <td className="py-3 px-4 text-blue-300">{room.host_name}</td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-yellow-400">{formatTokens(room.tokens_display)} 🪙</div>
                        </td>
                        <td className="py-3 px-4 text-right text-gray-300">{room.ticket_count}</td>
                        <td className="py-3 px-4 text-right text-green-400">
                          {formatCurrency(room.revenue_ngn)}
                        </td>
                      </tr>
                    ))}
                    {(!tokenSpendingData.top_rooms || tokenSpendingData.top_rooms.length === 0) && (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-gray-400">
                          No token spending data yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Hosts by Token Earnings */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4">💰 Top Hosts by Token Earnings</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/20">
                      <th className="text-left py-3 px-4">Rank</th>
                      <th className="text-left py-3 px-4">Host</th>
                      <th className="text-right py-3 px-4">Tokens Earned (85%)</th>
                      <th className="text-right py-3 px-4">Tickets Sold</th>
                      <th className="text-right py-3 px-4">Rooms</th>
                      <th className="text-right py-3 px-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tokenSpendingData.top_hosts || []).map((host, index) => (
                      <tr key={host.host_id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 px-4">
                          <span className="text-xl">
                            {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-blue-300">{host.host_name}</div>
                          <div className="text-xs text-gray-400">ID: {host.host_id}</div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="font-bold text-green-400">{formatTokens(host.tokens_display)} 🪙</div>
                          <div className="text-xs text-gray-400">85% of {formatTokens(host.tokens_display / 0.85)}</div>
                        </td>
                        <td className="py-3 px-4 text-right text-purple-300">{host.tickets_sold}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{host.room_count}</td>
                        <td className="py-3 px-4 text-right text-yellow-400">
                          {formatCurrency(host.revenue_ngn)}
                        </td>
                      </tr>
                    ))}
                    {(!tokenSpendingData.top_hosts || tokenSpendingData.top_hosts.length === 0) && (
                      <tr>
                        <td colSpan="6" className="py-8 text-center text-gray-400">
                          No host earnings data yet
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Token Economy Visualization */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4">🔄 Token Economy Flow</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Tokens Purchased (Minted) */}
                <div className="bg-green-600/20 rounded-lg p-4 border border-green-500/30">
                  <div className="text-center">
                    <div className="text-4xl mb-2">💰</div>
                    <div className="text-sm text-gray-300 mb-1">Tokens Purchased</div>
                    <div className="text-3xl font-bold text-green-400">
                      {formatTokens(analytics.tokens.total_minted)} 🪙
                    </div>
                    <div className="text-xs text-green-300 mt-2">Revenue: {formatCurrency(analytics.revenue.all_time.gmv)}</div>
                  </div>
                </div>

                {/* Tokens Spent (Consumed) */}
                <div className="bg-purple-600/20 rounded-lg p-4 border border-purple-500/30">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🎟️</div>
                    <div className="text-sm text-gray-300 mb-1">Tokens Spent on Tickets</div>
                    <div className="text-3xl font-bold text-purple-400">
                      {formatTokens(tokenSpendingData.summary.total_tokens_display)} 🪙
                    </div>
                    <div className="text-xs text-purple-300 mt-2">{tokenSpendingData.summary.total_tickets.toLocaleString()} tickets sold</div>
                  </div>
                </div>

                {/* Token Velocity */}
                <div className="bg-blue-600/20 rounded-lg p-4 border border-blue-500/30">
                  <div className="text-center">
                    <div className="text-4xl mb-2">📊</div>
                    <div className="text-sm text-gray-300 mb-1">Token Velocity</div>
                    <div className="text-3xl font-bold text-blue-400">
                      {((tokenSpendingData.summary.total_tokens_spent / (analytics.tokens.total_minted * 100 || 1)) * 100).toFixed(1)}%
                    </div>
                    <div className="text-xs text-blue-300 mt-2">Spent / Minted ratio</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Token Donation Commission Section */}
            <div className="bg-gradient-to-br from-yellow-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border border-yellow-500/30">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold flex items-center gap-2">
                  💝 Token Donation Commissions (Wallet-to-Wallet Gifts)
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                {/* Total Gifts */}
                <Card className="bg-white/10 border-yellow-500/30 hover:bg-white/15 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-300">Total Gifts Sent (Wallet-to-Wallet)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-400">
                      {analytics.token_donations?.total_gifts_count?.toLocaleString() || '0'}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {formatTokens(analytics.token_donations?.total_value_tokens || 0)} tokens gifted
                    </p>
                  </CardContent>
                </Card>

                {/* Total Value */}
                <Card className="bg-white/10 border-orange-500/30 hover:bg-white/15 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-300">Total Gift Value</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-400">
                      {formatCurrency(analytics.token_donations?.total_value_ngn || 0)}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      ₦140.25 per token (85% backing)
                    </p>
                  </CardContent>
                </Card>

                {/* Lifetime Commission */}
                <Card className="bg-white/10 border-green-500/30 hover:bg-white/15 transition-colors">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-300">Lifetime Commission (5%)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-400">
                      {formatCurrency(analytics.token_donations?.commission_earned_ngn || 0)}
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      All-time earnings from gifts
                    </p>
                  </CardContent>
                </Card>

                {/* Available to Transfer */}
                <Card className="bg-gradient-to-br from-green-600/30 to-emerald-600/30 border-2 border-green-500/50 hover:from-green-600/40 hover:to-emerald-600/40 transition-all">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-300">💰 Available to Transfer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-300">
                      {formatCurrency(analytics.token_donations?.available_to_transfer || 0)}
                    </div>
                    <p className="text-xs text-green-200 mt-1">
                      Ready for Reserve → Revenue
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Transfer Button */}
              {(analytics.token_donations?.available_to_transfer || 0) > 0 && (
                  <div className="bg-green-600/20 rounded-lg p-4 border border-green-500/30">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-semibold text-white mb-1">
                          💸 Transfer Commission to Revenue Account
                        </div>
                        <div className="text-sm text-gray-300">
                          Move {formatCurrency(analytics.token_donations.available_to_transfer)} from Reserve Subaccount to Revenue Subaccount
                        </div>
                        <div className="text-xs text-yellow-300 mt-2">
                          ⚠️ Note: This logs the transfer request. Complete the actual transfer via Paystack Dashboard.
                        </div>
                      </div>
                      <button
                        onClick={handleTransferCommission}
                        disabled={transferringCommission}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 shadow-lg hover:shadow-green-500/50 flex items-center gap-2"
                      >
                        {transferringCommission ? (
                          <>
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <ArrowDownTrayIcon className="h-5 w-5" />
                            Transfer to Revenue
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}

              {(analytics.token_donations?.available_to_transfer || 0) <= 0 && (
                  <div className="bg-gray-600/20 rounded-lg p-4 border border-gray-500/30 text-center">
                    <div className="text-gray-400">
                      💡 No commission available yet. Commission accumulates when users send wallet-to-wallet token gifts to each other (not in-session tips).
                    </div>
                  </div>
                )}

                {/* Info Box */}
                <div className="mt-4 bg-blue-600/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="text-sm text-blue-200">
                    <strong>ℹ️ Wallet-to-Wallet Gifts vs In-Session Tips:</strong>
                    <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                      <li><strong>Wallet-to-Wallet Gifts:</strong> User A sends tokens directly to User B's wallet (tracked here)</li>
                      <li><strong>In-Session Tips:</strong> Users tip hosts during watch parties (tracked in "Top Donors" section below)</li>
                      <li>When users send wallet gifts, 5% goes to platform commission, 95% to recipient</li>
                      <li>Commissions are valued at ₦140.25 per token (85% of ₦165 purchase price)</li>
                      <li>Commission funds stay in Reserve Subaccount (OPay) until manually transferred to Revenue</li>
                    </ul>
                  </div>
                </div>
            </div>

            {/* Event Analytics Section - Ticket Sales & RSVPs */}
            {eventAnalytics && (
              <div className="bg-gradient-to-br from-purple-600/20 to-indigo-600/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold flex items-center gap-2">
                      🎟️ Event Ticketing Analytics
                    </h2>
                    <p className="text-sm text-gray-400 mt-1">Scheduled events, ticket sales, and RSVPs</p>
                  </div>
                </div>

                {/* Statistics Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  {/* Total Tickets Sold */}
                  <Card className="bg-gradient-to-br from-purple-500 to-purple-700 border-purple-400 hover:from-purple-600 hover:to-purple-800 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white">Tickets Sold</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Paid event tickets</p>
                    </CardContent>
                  </Card>

                  {/* Total RSVPs */}
                  <Card className="bg-gradient-to-br from-green-500 to-emerald-700 border-green-400 hover:from-green-600 hover:to-emerald-800 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white">Free RSVPs</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {eventAnalytics.total_rsvps?.toLocaleString() || '0'}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Free event bookings</p>
                    </CardContent>
                  </Card>

                  {/* Total Revenue */}
                  <Card className="bg-gradient-to-br from-yellow-500 to-orange-600 border-yellow-400 hover:from-yellow-600 hover:to-orange-700 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white">Ticket Revenue</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {formatTokens(eventAnalytics.ticket_revenue || 0)}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        ≈ {formatCurrency((eventAnalytics.ticket_revenue || 0) * 1.65)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Transfer Fee Revenue */}
                  <Card className="bg-gradient-to-br from-pink-500 to-rose-700 border-pink-400 hover:from-pink-600 hover:to-rose-800 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white">Gift Transfer Fees (5%)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {formatTokens(eventAnalytics.transfer_fee_revenue || 0)}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">From gifted tickets</p>
                    </CardContent>
                  </Card>

                  {/* Gifted Tickets */}
                  <Card className="bg-gradient-to-br from-pink-500 to-fuchsia-700 border-pink-400 hover:from-pink-600 hover:to-fuchsia-800 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white flex items-center gap-1">
                        <span>🎁</span> Gifted Tickets
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {eventAnalytics.total_gifted_tickets?.toLocaleString() || '0'}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Tickets sent as gifts</p>
                    </CardContent>
                  </Card>

                  {/* Early Bird Tickets */}
                  <Card className="bg-gradient-to-br from-orange-500 to-red-600 border-orange-400 hover:from-orange-600 hover:to-red-700 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white flex items-center gap-1">
                        <span>🎉</span> Early Bird Sales
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {eventAnalytics.early_bird_tickets?.toLocaleString() || '0'}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">
                        Saved: {formatTokens(eventAnalytics.early_bird_savings || 0)}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Upcoming Paid Events */}
                  <Card className="bg-gradient-to-br from-blue-500 to-indigo-700 border-blue-400 hover:from-blue-600 hover:to-indigo-800 transition-all shadow-lg">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white flex items-center gap-1">
                        <span>📅</span> Upcoming Paid Events
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {eventAnalytics.upcoming_paid_events?.toLocaleString() || '0'}
                      </div>
                      <p className="text-xs text-gray-400 mt-1">Future scheduled events</p>
                    </CardContent>
                  </Card>

                  {/* Total Revenue (Ticket + Fees) */}
                  <Card className="bg-gradient-to-br from-emerald-500 to-green-700 border-2 border-emerald-400 hover:from-emerald-600 hover:to-green-800 transition-all shadow-xl">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-white flex items-center gap-1">
                        <span>💰</span> Total Revenue
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-white">
                        {formatTokens(eventAnalytics.total_revenue || 0)}
                      </div>
                      <p className="text-xs text-green-200 mt-1">Tickets + transfer fees</p>
                    </CardContent>
                  </Card>
                </div>

                {/* Revenue by Watch Type */}
                {eventAnalytics.revenue_by_watch_type && eventAnalytics.revenue_by_watch_type.length > 0 && (
                  <Card className="bg-white/5 border-purple-500/20 mb-4">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-white">Revenue by Watch Type</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {eventAnalytics.revenue_by_watch_type.map((type) => (
                          <Card key={type.watch_type} className="bg-white/5 border-purple-500/10 hover:bg-white/10 transition-colors">
                            <CardHeader className="pb-2">
                              <CardTitle className="text-sm font-medium text-gray-300">
                                {type.watch_type === '3d_cinema' ? '🎬 3D Cinema' : 
                                 type.watch_type === 'classroom' ? '🎓 Classroom' : '📺 Video Watch'}
                              </CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="text-xl font-bold text-purple-400">
                                {formatTokens(type.revenue)}
                              </div>
                              <p className="text-xs text-gray-400 mt-1">
                                {type.ticket_count} tickets sold
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Top Events */}
                {eventAnalytics.top_events && eventAnalytics.top_events.length > 0 && (
                  <Card className="bg-white/5 border-yellow-500/20">
                    <CardHeader>
                      <CardTitle className="text-lg font-bold text-white">🏆 Top Selling Events</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {eventAnalytics.top_events.slice(0, 5).map((event, index) => (
                          <Card key={event.event_id} className="bg-white/5 border-yellow-500/10 hover:bg-white/10 transition-colors">
                            <CardContent className="pt-3">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="text-lg font-bold text-purple-400 border-purple-500/30">
                                    #{index + 1}
                                  </Badge>
                                  <div>
                                    <div className="font-medium text-white">{event.title}</div>
                                    <div className="text-xs text-gray-400">
                                      Room ID: {event.room_id} • {event.watch_type === '3d_cinema' ? '🎬 Cinema' : event.watch_type === 'classroom' ? '🎓 Classroom' : '📺 Video'}
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-lg font-bold text-yellow-400">
                                    {event.tickets_sold} tickets
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {formatTokens(event.revenue)} revenue
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Top Donors Section - In-Session Tips */}
            <div className="bg-gradient-to-br from-pink-600/20 to-purple-600/20 backdrop-blur-lg rounded-xl p-6 border border-pink-500/30">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-bold flex items-center gap-2">
                    🎁 Top Donors - In-Session Tips
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">Users who tip during watch parties (not wallet-to-wallet gifts)</p>
                </div>
              </div>
              
              {topDonorsData ? (
                <div>
                  {/* Statistics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                    <Card className="bg-white/10 border-yellow-500/30 hover:bg-white/15 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-300">Total Tips (In-Session)</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-yellow-400">
                          {formatTokens(topDonorsData.statistics.total_donated_tokens)} 🪙
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          ≈ {formatCurrency(topDonorsData.statistics.total_donated_tokens * 1.65)}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="bg-white/10 border-pink-500/30 hover:bg-white/15 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-300">Total Tippers</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-pink-400">
                          {topDonorsData.statistics.total_donors}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Users who tip hosts</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-white/10 border-purple-500/30 hover:bg-white/15 transition-colors">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium text-gray-300">Sessions with Tips</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-purple-400">
                          {topDonorsData.statistics.total_sessions}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Watch parties tipped</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Top Donors Table */}
                  <div className="bg-white/5 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-white/10">
                        <tr>
                          <th className="text-left px-4 py-3 text-sm font-semibold">Rank</th>
                          <th className="text-left px-4 py-3 text-sm font-semibold">Tipper</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold">Total Tipped</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold">Times Tipped</th>
                          <th className="text-right px-4 py-3 text-sm font-semibold">Sessions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {topDonorsData?.top_donors?.length > 0 ? (
                          topDonorsData.top_donors.map((donor, index) => (
                            <tr key={donor.donor_id} className="hover:bg-white/5 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {index === 0 && <span className="text-2xl">👑</span>}
                                  {index === 1 && <span className="text-2xl">🥈</span>}
                                  {index === 2 && <span className="text-2xl">🥉</span>}
                                  {index > 2 && <span className="text-gray-400">#{index + 1}</span>}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <img
                                    src={donor.avatar_url || '/default-avatar.png'}
                                    alt={donor.username}
                                    className="w-10 h-10 rounded-full object-cover"
                                  />
                                  <div>
                                    <div className="font-semibold">{donor.username}</div>
                                    <div className="text-xs text-gray-400">User ID: {donor.donor_id}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-bold text-yellow-400">
                                  {formatTokens(donor.total_donated)} 🪙
                                </div>
                                <div className="text-xs text-gray-400">
                                  {formatCurrency(donor.total_donated * 1.65)}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-semibold text-pink-400">{donor.donation_count}</div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-semibold text-purple-400">{donor.session_count}</div>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="5" className="px-4 py-8 text-center text-gray-400">
                              No in-session tips yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-400">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
                  Loading donors data...
                </div>
              )}
            </div>
          </>
        )}

        {/* Event Analytics Section */}
        {eventAnalytics && (
          <div className="bg-gradient-to-r from-blue-600/20 to-indigo-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-blue-500/50">
            <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
              🎫 Event Ticketing Analytics
            </h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard
                title="Total Tickets Sold"
                value={eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}
                subtitle="Paid event tickets"
                color="bg-blue-600"
              />
              <MetricCard
                title="Free RSVPs"
                value={eventAnalytics.total_rsvps?.toLocaleString() || '0'}
                subtitle="Free event bookings"
                color="bg-green-600"
              />
              <MetricCard
                title="Ticket Revenue"
                value={`${formatTokens(eventAnalytics.ticket_revenue || 0)} 🪙`}
                subtitle="From paid tickets"
                color="bg-purple-600"
              />
              <MetricCard
                title="Gifted Tickets"
                value={eventAnalytics.total_gifted_tickets?.toLocaleString() || '0'}
                subtitle={`${formatTokens(eventAnalytics.transfer_fee_revenue || 0)} 🪙 fees (5%)`}
                color="bg-pink-600"
              />
            </div>

            {/* Top Events Table */}
            {eventAnalytics.top_events && eventAnalytics.top_events.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">🔥 Top 10 Events by Tickets</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/20">
                        <th className="text-left py-3 px-4">Event</th>
                        <th className="text-left py-3 px-4">Room</th>
                        <th className="text-right py-3 px-4">Tickets</th>
                        <th className="text-right py-3 px-4">RSVPs</th>
                        <th className="text-right py-3 px-4">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {eventAnalytics.top_events.map((event, index) => (
                        <tr key={event.event_id} className="border-b border-white/10 hover:bg-white/5">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              <span className="text-lg">
                                {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : ''}
                              </span>
                              <div>
                                <div className="font-semibold">{event.event_name || 'Untitled Event'}</div>
                                <div className="text-xs text-gray-400">
                                  {new Date(event.scheduled_time).toLocaleDateString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  })}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {event.watch_type === 'movie' && '🎬'}
                              {event.watch_type === 'tv' && '📺'}
                              {event.watch_type === 'lecture' && '🎓'}
                              {event.watch_type === '3dcinema' && '🎪'}
                              <span className="text-gray-300">{event.room_name || 'Unknown Room'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-semibold text-blue-400">{event.ticket_count || 0}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-semibold text-green-400">{event.rsvp_count || 0}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="font-semibold text-purple-400">
                              {formatTokens(event.total_revenue || 0)} 🪙
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Revenue by Watch Type */}
            {eventAnalytics.revenue_by_watch_type && eventAnalytics.revenue_by_watch_type.length > 0 && (
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">📊 Revenue by Watch Type</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {eventAnalytics.revenue_by_watch_type.map((item) => (
                    <div key={item.watch_type} className="bg-white/10 rounded-lg p-4 border border-white/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">
                          {item.watch_type === 'movie' && '🎬'}
                          {item.watch_type === 'tv' && '📺'}
                          {item.watch_type === 'lecture' && '🎓'}
                          {item.watch_type === '3dcinema' && '🎪'}
                        </span>
                        <span className="font-semibold capitalize">{item.watch_type}</span>
                      </div>
                      <div className="text-2xl font-bold text-purple-400 mb-1">
                        {formatTokens(item.total_revenue)} 🪙
                      </div>
                      <div className="text-xs text-gray-400">
                        {item.ticket_count} tickets • {item.rsvp_count} RSVPs
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Early Bird Stats */}
            {eventAnalytics.early_bird_tickets > 0 && (
              <div className="mt-6 bg-yellow-600/20 rounded-lg p-4 border border-yellow-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🐦</span>
                  <span className="font-semibold text-yellow-300">Early Bird Tickets</span>
                </div>
                <div className="text-sm text-gray-300">
                  {eventAnalytics.early_bird_tickets} tickets sold at early bird pricing 
                  {eventAnalytics.early_bird_revenue > 0 && (
                    <span className="ml-2">
                      • {formatTokens(eventAnalytics.early_bird_revenue)} 🪙 revenue
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Hosts Leaderboard */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">🏆 Top Hosts Leaderboard (All Revenue)</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4">Rank</th>
                  <th className="text-left py-3 px-4">Host</th>
                  <th className="text-right py-3 px-4">Revenue</th>
                  <th className="text-right py-3 px-4">Tickets Sold</th>
                </tr>
              </thead>
              <tbody>
                {(analytics.top_hosts || []).map((host, index) => (
                  <tr key={host.user_id} className="border-b border-white/10 hover:bg-white/5">
                    <td className="py-3 px-4">
                      <span className="text-2xl">
                        {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold">{host.username}</td>
                    <td className="py-3 px-4 text-right text-green-400">₦{host.revenue.toLocaleString()}</td>
                    <td className="py-3 px-4 text-right">{host.tickets_sold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Additional Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatsCard
            title="Rooms"
            stats={[
              { label: 'Total', value: analytics.rooms.total },
              { label: 'Public', value: analytics.rooms.public },
              { label: 'Private', value: analytics.rooms.private },
            ]}
          />
          <StatsCard
            title="Donations"
            stats={[
              { label: 'All-time', value: `₦${analytics.donations.all_time.total.toLocaleString()}` },
              { label: 'This Week', value: `₦${analytics.donations.week.total.toLocaleString()}` },
              { label: 'Count', value: analytics.donations.all_time.count },
            ]}
          />
          <StatsCard
            title="Events"
            stats={[
              { label: 'Total', value: analytics.events.total },
              { label: 'Upcoming', value: analytics.events.upcoming },
              { label: 'Past', value: analytics.events.past },
            ]}
          />
        </div>

        {/* KYC Management Section */}
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-indigo-500/50">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">
                🆔 KYC Management
                <span className="text-sm bg-indigo-600 px-3 py-1 rounded-full">
                  {filteredKYCs.length} {kycStatusFilter}
                </span>
              </h2>
              <p className="text-sm text-gray-400 mt-1">Manage user identity verification submissions</p>
            </div>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Status Filter</label>
              <select
                value={kycStatusFilter}
                onChange={(e) => {
                  setKycStatusFilter(e.target.value);
                  fetchKYCs(e.target.value);
                }}
                className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
              >
                <option value="all">All Submissions</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            <div className="sm:col-span-3">
              <label className="block text-sm font-medium mb-2">Search by Name, Username, or Email</label>
              <input
                type="text"
                value={kycSearchTerm}
                onChange={(e) => setKycSearchTerm(e.target.value)}
                placeholder="Type to search..."
                className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white placeholder-gray-400"
              />
            </div>
          </div>

          {/* KYC Submissions Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4">User</th>
                  <th className="text-left py-3 px-4">Full Name</th>
                  <th className="text-left py-3 px-4">Documents</th>
                  <th className="text-left py-3 px-4">Submitted</th>
                  <th className="text-center py-3 px-4">Status</th>
                  <th className="text-right py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredKYCs.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-gray-400">
                      {kycSearchTerm ? 'No matching KYC submissions found' : `No ${kycStatusFilter} KYC submissions`}
                    </td>
                  </tr>
                ) : (
                  filteredKYCs.map((kyc) => (
                    <tr key={kyc.id} className="border-b border-white/10 hover:bg-white/5">
                      <td className="py-3 px-4">
                        <div className="font-semibold">{kyc.user?.username || 'Unknown'}</div>
                        <div className="text-xs text-gray-400">{kyc.user?.email || 'N/A'}</div>
                        <div className="text-xs text-gray-500">ID: {kyc.user_id}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{kyc.full_name || 'N/A'}</div>
                        {kyc.date_of_birth && (
                          <div className="text-xs text-gray-400">
                            DOB: {new Date(kyc.date_of_birth).toLocaleDateString()}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          {kyc.id_front_url && (
                            <button
                              onClick={() => viewDocument(kyc, 'front')}
                              className="text-xs text-blue-400 hover:text-blue-300 underline text-left"
                            >
                              📄 ID Front
                            </button>
                          )}
                          {kyc.id_back_url && (
                            <button
                              onClick={() => viewDocument(kyc, 'back')}
                              className="text-xs text-blue-400 hover:text-blue-300 underline text-left"
                            >
                              📄 ID Back
                            </button>
                          )}
                          {kyc.selfie_url && (
                            <button
                              onClick={() => viewDocument(kyc, 'selfie')}
                              className="text-xs text-green-400 hover:text-green-300 underline text-left"
                            >
                              🤳 Selfie
                            </button>
                          )}
                          {/* Open in new tab links */}
                          {kyc.id_front_url && (
                            <a
                              href={kyc.id_front_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-gray-400 hover:text-gray-300"
                            >
                              ↗ Open Front
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-xs">
                          {new Date(kyc.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(kyc.created_at).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs font-semibold ${
                            kyc.status === 'approved'
                              ? 'bg-green-600/30 text-green-300'
                              : kyc.status === 'rejected'
                              ? 'bg-red-600/30 text-red-300'
                              : 'bg-yellow-600/30 text-yellow-300'
                          }`}
                        >
                          {kyc.status}
                        </span>
                        {kyc.rejection_reason && (
                          <div className="text-xs text-red-300 mt-1" title={kyc.rejection_reason}>
                            Reason: {kyc.rejection_reason.substring(0, 30)}...
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {kyc.status === 'pending' ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApproveKYC(kyc.id)}
                              disabled={processingKYC === kyc.id}
                              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              {processingKYC === kyc.id ? (
                                <>
                                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                  Processing...
                                </>
                              ) : (
                                <>
                                  <CheckCircleIcon className="h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => handleRejectKYC(kyc.id)}
                              disabled={processingKYC === kyc.id}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                            >
                              <XCircleIcon className="h-4 w-4" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-400">
                            {kyc.status === 'approved' ? '✅ Verified' : '❌ Rejected'}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Info Box */}
          <div className="mt-6 bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">📝 KYC Verification Guidelines:</h3>
            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
              <li>Verify ID document matches the user's full name and date of birth</li>
              <li>Check that selfie photo matches the ID photo</li>
              <li>Ensure all documents are clear, readable, and not expired</li>
              <li>KYC verification is required for payouts exceeding ₦5,000</li>
              <li>Rejected submissions can be resubmitted by the user</li>
            </ul>
          </div>
        </div>

        {/* Document Viewer Modal */}
        {showDocViewer && selectedKYCDoc && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setShowDocViewer(false)}>
            <div className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {selectedKYCDoc.docType === 'front' ? '📄 ID Front' : 
                     selectedKYCDoc.docType === 'back' ? '📄 ID Back' : 
                     '🤳 Selfie Photo'}
                  </h3>
                  <p className="text-sm text-gray-400">
                    User: {selectedKYCDoc.kyc.user?.username} ({selectedKYCDoc.kyc.full_name})
                  </p>
                </div>
                <button
                  onClick={() => setShowDocViewer(false)}
                  className="text-white hover:text-gray-300 transition-colors"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <div className="bg-black rounded-lg p-4 flex items-center justify-center">
                <img
                  src={
                    selectedKYCDoc.docType === 'front' ? selectedKYCDoc.kyc.id_front_url :
                    selectedKYCDoc.docType === 'back' ? selectedKYCDoc.kyc.id_back_url :
                    selectedKYCDoc.kyc.selfie_url
                  }
                  alt={`${selectedKYCDoc.docType} document`}
                  className="max-w-full max-h-[70vh] object-contain cursor-zoom-in"
                  onClick={(e) => {
                    // Toggle zoom on click
                    if (e.target.style.transform === 'scale(2)') {
                      e.target.style.transform = 'scale(1)';
                      e.target.style.cursor = 'zoom-in';
                    } else {
                      e.target.style.transform = 'scale(2)';
                      e.target.style.cursor = 'zoom-out';
                    }
                  }}
                />
              </div>
              
              <div className="mt-4 flex gap-3">
                <a
                  href={
                    selectedKYCDoc.docType === 'front' ? selectedKYCDoc.kyc.id_front_url :
                    selectedKYCDoc.docType === 'back' ? selectedKYCDoc.kyc.id_back_url :
                    selectedKYCDoc.kyc.selfie_url
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                >
                  ↗ Open in New Tab
                </a>
                {selectedKYCDoc.kyc.status === 'pending' && (
                  <>
                    <button
                      onClick={() => {
                        setShowDocViewer(false);
                        handleApproveKYC(selectedKYCDoc.kyc.id);
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                    >
                      <CheckCircleIcon className="h-5 w-5" />
                      Approve KYC
                    </button>
                    <button
                      onClick={() => {
                        setShowDocViewer(false);
                        handleRejectKYC(selectedKYCDoc.kyc.id);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                    >
                      <XCircleIcon className="h-5 w-5" />
                      Reject KYC
                    </button>
                  </>
                )}
                <button
                  onClick={() => setShowDocViewer(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Admin Audit Logs Section */}
        <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-amber-500/50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              🔒 Admin Audit Logs
            </h2>
            <button
              onClick={exportAuditLogsToCSV}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Export CSV
            </button>
          </div>

          {/* Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium mb-2">Action</label>
              <select
                value={auditFilter.action}
                onChange={(e) => {
                  setAuditFilter({ ...auditFilter, action: e.target.value });
                  fetchAuditLogs(1, { ...auditFilter, action: e.target.value });
                }}
                className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
              >
                <option value="">All Actions</option>
                <option value="approve_kyc">Approve KYC</option>
                <option value="reject_kyc">Reject KYC</option>
                <option value="approve_payout">Approve Payout</option>
                <option value="reject_payout">Reject Payout</option>
                <option value="complete_payout">Complete Payout</option>
                <option value="transfer_commission">Transfer Commission</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Start Date</label>
              <input
                type="date"
                value={auditFilter.start_date}
                onChange={(e) => {
                  setAuditFilter({ ...auditFilter, start_date: e.target.value });
                  fetchAuditLogs(1, { ...auditFilter, start_date: e.target.value });
                }}
                className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">End Date</label>
              <input
                type="date"
                value={auditFilter.end_date}
                onChange={(e) => {
                  setAuditFilter({ ...auditFilter, end_date: e.target.value });
                  fetchAuditLogs(1, { ...auditFilter, end_date: e.target.value });
                }}
                className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setAuditFilter({ action: '', admin_id: '', start_date: '', end_date: '' });
                  fetchAuditLogs(1, {});
                }}
                className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
              >
                Clear Filters
              </button>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/20">
                  <th className="text-left py-3 px-4">Date</th>
                  <th className="text-left py-3 px-4">Admin</th>
                  <th className="text-left py-3 px-4">Action</th>
                  <th className="text-left py-3 px-4">Target</th>
                  <th className="text-left py-3 px-4">IP Address</th>
                  <th className="text-center py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="py-8 text-center text-gray-400">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-white/10 hover:bg-white/5">
                      <td className="py-3 px-4">
                        <div className="text-xs">
                          {new Date(log.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                          <br />
                          {new Date(log.created_at).toLocaleTimeString('en-US', { 
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-semibold">
                        {log.admin?.username || log.admin_id}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-1 bg-blue-600/30 rounded text-xs">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-300">
                        {log.target_type || 'N/A'} #{log.target_id || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400">
                        {log.ip_address || 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {log.success ? (
                          <CheckCircleIcon className="w-5 h-5 text-green-400 inline-block" />
                        ) : (
                          <XCircleIcon className="w-5 h-5 text-red-400 inline-block" />
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 max-w-xs truncate">
                        {log.details || 'N/A'}
                        {log.error_msg && (
                          <span className="block text-red-400 mt-1">
                            Error: {log.error_msg}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {auditTotal > 20 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-300">
                Showing {Math.min((auditPage - 1) * 20 + 1, auditTotal)} - {Math.min(auditPage * 20, auditTotal)} of {auditTotal} logs
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchAuditLogs(auditPage - 1, auditFilter)}
                  disabled={auditPage === 1}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Previous
                </button>
                <span className="px-4 py-2 bg-black/30 border border-white/20 rounded-lg">
                  Page {auditPage} of {Math.ceil(auditTotal / 20)}
                </span>
                <button
                  onClick={() => fetchAuditLogs(auditPage + 1, auditFilter)}
                  disabled={auditPage >= Math.ceil(auditTotal / 20)}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper Components
const MetricCard = ({ title, value, subtitle, color }) => (
  <Card className={`${color} border-white/20 shadow-lg`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-semibold opacity-90">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-3xl font-bold mb-1">{value}</p>
      <p className="text-sm opacity-75">{subtitle}</p>
    </CardContent>
  </Card>
);

const TodayMetric = ({ label, value }) => (
  <div className="text-center">
    <div className="text-2xl font-bold text-white">{value}</div>
    <div className="text-sm text-gray-300">{label}</div>
  </div>
);

const AccountingCard = ({ title, value, subtitle, bgColor }) => (
  <Card className={`${bgColor} border-white/20`}>
    <CardHeader className="pb-2">
      <CardTitle className="text-sm font-semibold opacity-90">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <p className="text-2xl font-bold mb-1">{value}</p>
      <p className="text-xs opacity-75">{subtitle}</p>
    </CardContent>
  </Card>
);

const StatsCard = ({ title, stats }) => (
  <Card className="bg-white/10 backdrop-blur-lg border-white/20">
    <CardHeader>
      <CardTitle className="text-xl font-bold">{title}</CardTitle>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        {stats.map((stat, index) => (
          <div key={index} className="flex justify-between items-center">
            <span className="text-gray-300">{stat.label}</span>
            <span className="font-semibold text-lg">{stat.value}</span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
);

export default AdminDashboard;
