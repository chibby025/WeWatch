import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import apiClient, {
  getAdminPendingPayouts,
  getAdminProcessingPayouts,
  approveAdminPayout,
  rejectAdminPayout,
  completeAdminPayout,
} from '../services/api';
import {
  BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import toast, { Toaster } from 'react-hot-toast';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MetricCard, TodayMetric, AccountingCard, StatsCard } from '../components/admin/AdminCards';
import { formatTokens, formatCurrency } from '../components/admin/adminFormatters';
import AdminPayoutsSection from '../components/admin/AdminPayoutsSection';
import AdminKYCSection from '../components/admin/AdminKYCSection';
import AdminReportsSection from '../components/admin/AdminReportsSection';
import AdminAuditSection from '../components/admin/AdminAuditSection';

const AdminDashboard = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState(null);
  const [tokenSpendingData, setTokenSpendingData] = useState(null);
  const [topDonorsData, setTopDonorsData] = useState(null);
  const [eventAnalytics, setEventAnalytics] = useState(null);
  const [pendingPayouts, setPendingPayouts] = useState([]);
  const [processingPayouts, setProcessingPayouts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [transferringCommission, setTransferringCommission] = useState(false);
  const [processingPayout, setProcessingPayout] = useState(null);
  const [splitProfit, setSplitProfit] = useState(null);
  const [transferringSplitProfit, setTransferringSplitProfit] = useState(false);
  const [sweepingWithdrawalFees, setSweepingWithdrawalFees] = useState(false);
  const [communityAnalytics, setCommunityAnalytics] = useState(null);

  useEffect(() => {
    if (!currentUser) { navigate('/'); return; }
    if (currentUser.role !== 'super_admin') {
      toast.error('Access denied. Super admin only.');
      navigate('/lobby');
    }
  }, [currentUser, navigate]);

  const fetchAnalytics = async () => {
    try {
      const [analyticsRes, tokenSpendingRes, topDonorsRes, eventAnalyticsRes, pendingPayoutsRes, processingPayoutsRes, splitProfitRes, communityRes] = await Promise.all([
        apiClient.get('/api/admin/analytics'),
        apiClient.get('/api/admin/token-spending-analytics'),
        apiClient.get('/api/donations/top-donors?limit=20'),
        apiClient.get('/api/admin/event-analytics'),
        getAdminPendingPayouts(),
        getAdminProcessingPayouts(),
        apiClient.get('/api/admin/split-profit-analytics').catch(() => ({ data: null })),
        apiClient.get('/api/admin/community-analytics').catch(() => ({ data: null })),
      ]);

      setAnalytics(analyticsRes.data);
      setTokenSpendingData(tokenSpendingRes.data);
      setTopDonorsData(topDonorsRes.data);
      setEventAnalytics(eventAnalyticsRes.data);
      setPendingPayouts(pendingPayoutsRes.payouts || []);
      setProcessingPayouts(processingPayoutsRes.payouts || []);
      setSplitProfit(splitProfitRes.data);
      setCommunityAnalytics(communityRes.data);
      setLastUpdated(new Date());
      setLoading(false);
    } catch {
      toast.error('Failed to load analytics data');
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchAnalytics, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const exportToCSV = () => {
    if (!analytics) return;
    const csvData = [
      ['LetsWatchOut Platform Analytics Export'],
      ['Generated:', new Date().toLocaleString()],
      [''],
      ['OVERVIEW METRICS'],
      ['Total Revenue (GMV)', analytics.revenue.all_time.gmv],
      ['Platform Revenue (25%)', analytics.revenue.all_time.platform_revenue],
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
      ['Revenue Account (Your 25%)', analytics.platform_accounting.revenue_balance],
      ['Reserve Account (Host 75%)', analytics.platform_accounting.reserve_balance],
      ['Total Gateway Balance', analytics.platform_accounting.total_gateway_balance],
      ['Pending Payouts', analytics.platform_accounting.pending_payouts],
      ['Available Reserve', analytics.platform_accounting.available_reserve],
      ['Is Balanced', analytics.platform_accounting.is_balanced ? 'Yes' : 'No'],
      [''],
      ['TOP HOSTS'],
      ['Rank', 'Username', 'Revenue', 'Tickets Sold'],
      ...analytics.top_hosts.map((host, i) => [i + 1, host.username, host.revenue, host.tickets_sold])
    ];
    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `letswatchout-analytics-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success('Analytics exported to CSV');
  };

  const handleTransferCommission = async () => {
    if (!analytics?.token_donations?.available_to_transfer || analytics.token_donations.available_to_transfer <= 0) {
      toast.error('No commission available to transfer');
      return;
    }
    if (!window.confirm(`Transfer ${formatCurrency(analytics.token_donations.available_to_transfer)} to Revenue account?\n\nNote: This logs the transfer request. Complete the actual transfer via Paystack Dashboard.`)) return;
    setTransferringCommission(true);
    try {
      const response = await apiClient.post('/api/admin/transfer-donation-commission');
      toast.success(`✅ Transfer logged: ${formatCurrency(response.data.amount)}\nComplete via Paystack Dashboard.`);
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Transfer failed. Please try again.');
    } finally { setTransferringCommission(false); }
  };

  const handleSweepWithdrawalFees = async () => {
    const available = analytics?.platform_accounting?.withdrawal_fee_revenue || 0;
    if (available <= 0) { toast.error('No withdrawal fees accumulated yet'); return; }
    if (!window.confirm(`Sweep ₦${available.toLocaleString()} withdrawal fees to Revenue account?\n\nYou must complete the actual transfer via Paystack Dashboard after this.`)) return;
    setSweepingWithdrawalFees(true);
    try {
      const response = await apiClient.post('/api/admin/sweep-withdrawal-fees');
      toast.success(`✅ Sweep logged: ₦${response.data.amount.toLocaleString()}\nRef: ${response.data.sweep_ref}\nComplete via Paystack Dashboard.`);
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Sweep failed. Please try again.');
    } finally { setSweepingWithdrawalFees(false); }
  };

  const handleTransferSplitProfit = async () => {
    if (!window.confirm('Sweep accumulated platform split profit (25% of post sales) into the super-admin wallet?')) return;
    setTransferringSplitProfit(true);
    try {
      const response = await apiClient.post('/api/admin/transfer-split-profit');
      toast.success(`✅ Split profit transferred:\n${formatTokens(response.data.amount_tokens)} tokens (${formatCurrency(response.data.amount_ngn)})`);
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to transfer split profit. Please try again.');
    } finally { setTransferringSplitProfit(false); }
  };

  const handleApprovePayout = async (payoutId) => {
    if (!window.confirm('Approve this withdrawal? The transfer will be initiated immediately.')) return;
    setProcessingPayout(payoutId);
    try {
      await approveAdminPayout(payoutId);
      toast.success('✅ Withdrawal approved and processing!');
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve withdrawal');
    } finally { setProcessingPayout(null); }
  };

  const handleRejectPayout = async (payoutId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;
    setProcessingPayout(payoutId);
    try {
      await rejectAdminPayout(payoutId, reason);
      toast.success('❌ Withdrawal rejected');
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reject withdrawal');
    } finally { setProcessingPayout(null); }
  };

  const handleCompletePayout = async (payoutId) => {
    const transferReference = window.prompt('Enter Paystack transfer reference (optional):');
    if (!window.confirm('Confirm you have manually transferred funds via Paystack dashboard?')) return;
    setProcessingPayout(payoutId);
    try {
      await completeAdminPayout(payoutId, transferReference);
      toast.success('✅ Payout marked as completed!');
      await fetchAnalytics();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to mark payout as completed');
    } finally { setProcessingPayout(null); }
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

  // Chart data
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
    { name: 'Today', purchased: parseFloat(analytics.tokens.today.purchased || 0), spent: parseFloat(analytics.tokens.today.spent || 0) },
    { name: 'Week', purchased: parseFloat(analytics.tokens.week.purchased || 0), spent: parseFloat(analytics.tokens.week.spent || 0) },
    { name: 'Month', purchased: parseFloat(analytics.tokens.month.purchased || 0), spent: parseFloat(analytics.tokens.month.spent || 0) },
  ];

  const adImpressionChartData = analytics.ads ? [
    { name: 'Today', impressions: analytics.ads.impressions_today, clicks: analytics.ads.clicks_today },
    { name: 'Week', impressions: analytics.ads.impressions_week, clicks: analytics.ads.clicks_week },
    { name: 'All Time', impressions: analytics.ads.total_impressions, clicks: analytics.ads.total_clicks },
  ] : [];

  const accountingPieData = [
    { name: 'Platform (25%)', value: analytics.platform_accounting.platform_profit, color: '#10b981' },
    { name: 'Host Reserve (75%)', value: analytics.platform_accounting.reserve_balance, color: '#3b82f6' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white p-4 sm:p-6">
      <Toaster position="top-center" />

      {/* Header */}
      <div className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl sm:text-4xl font-bold mb-2">🎯 Admin Dashboard</h1>
            <p className="text-gray-300">
              Last updated: {lastUpdated?.toLocaleTimeString()} •
              <span className={`ml-2 ${autoRefresh ? 'text-green-400' : 'text-gray-400'}`}>
                Auto-refresh: {autoRefresh ? 'ON' : 'OFF'}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 sm:px-4 py-2 rounded-lg font-semibold text-sm sm:text-base transition-colors ${autoRefresh ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'}`}
            >
              {autoRefresh ? '⏸️ Pause' : '▶️ Resume'}
            </button>
            <button onClick={fetchAnalytics} className="px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold text-sm sm:text-base flex items-center gap-2">
              <ArrowPathIcon className="h-5 w-5" />Refresh
            </button>
            <button onClick={exportToCSV} className="px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold text-sm sm:text-base flex items-center gap-2">
              <ArrowDownTrayIcon className="h-5 w-5" />Export CSV
            </button>
            <button onClick={() => navigate('/lobby')} className="px-3 sm:px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold text-sm sm:text-base flex items-center gap-2">
              <XMarkIcon className="h-5 w-5" />Close
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto space-y-6">

        {/* Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard title="Total Platform Revenue" value={`₦${analytics.revenue.all_time.gmv.toLocaleString()}`} subtitle="All NET money that entered" color="bg-blue-600" />
          <MetricCard title="Your Platform Profit" value={`₦${analytics.revenue.all_time.platform_revenue.toLocaleString()}`} subtitle="25% commission (withdraw safely)" color="bg-green-600" />
          <MetricCard title="Total Minted Tokens" value={`${formatTokens(analytics.tokens.total_minted)} 🪙`} subtitle="All tokens purchased" color="bg-yellow-600" />
          <MetricCard title="Total Users" value={analytics.users.total.toLocaleString()} subtitle={`+${analytics.users.new_today} today`} color="bg-purple-600" />
          <MetricCard title="Total Sessions" value={analytics.sessions.total.toLocaleString()} subtitle={`${analytics.sessions.active} active now`} color="bg-orange-600" />
        </div>

        {/* Today's Activity */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">📅 Today's Activity</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <TodayMetric label="Revenue" value={`₦${analytics.revenue.today.gmv.toLocaleString()}`} />
            <TodayMetric label="New Users" value={analytics.users.new_today} />
            <TodayMetric label="Sessions" value={analytics.sessions.today} />
            <TodayMetric label="Tokens Purchased" value={`${formatTokens(analytics.tokens.today.purchased)} 🪙`} />
            <TodayMetric label="Tickets" value={analytics.revenue.today.tickets_sold} />
            <TodayMetric label="Platform Revenue" value={`₦${analytics.revenue.today.platform_revenue.toLocaleString()}`} />
          </div>
        </div>

        {/* Download Analytics */}
        {analytics.downloads && (
          <div className="bg-gradient-to-r from-cyan-600/20 to-blue-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-cyan-500/50">
            <h2 className="text-2xl font-bold mb-4">📥 Video Downloads Analytics</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard title="Total Downloads" value={analytics.downloads.total.toLocaleString()} subtitle="All-time" color="bg-gradient-to-br from-cyan-500 to-blue-600 text-white" />
              <MetricCard title="Today" value={analytics.downloads.today.toLocaleString()} subtitle="Last 24 hours" color="bg-gradient-to-br from-blue-500 to-indigo-600 text-white" />
              <MetricCard title="This Week" value={analytics.downloads.week.toLocaleString()} subtitle="Last 7 days" color="bg-gradient-to-br from-indigo-500 to-purple-600 text-white" />
              <MetricCard title="This Month" value={analytics.downloads.month.toLocaleString()} subtitle="Last 30 days" color="bg-gradient-to-br from-purple-500 to-pink-600 text-white" />
            </div>
            {analytics.downloads.top_posts && analytics.downloads.top_posts.length > 0 && (
              <div className="bg-white/5 rounded-lg p-4">
                <h3 className="text-lg font-semibold mb-3">🏆 Top Downloaded Videos</h3>
                <div className="space-y-2">
                  {analytics.downloads.top_posts.slice(0, 10).map((post, index) => (
                    <div key={post.post_id} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg hover:bg-white/10 transition-colors">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0 ? 'bg-yellow-500 text-black' :
                        index === 1 ? 'bg-gray-400 text-black' :
                        index === 2 ? 'bg-amber-700 text-white' : 'bg-gray-600 text-white'
                      }`}>{index + 1}</div>
                      <div className="flex-1">
                        <div className="font-semibold text-white truncate">{post.title}</div>
                        <div className="text-xs text-gray-400">by @{post.username}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold text-cyan-400">{post.downloads_count.toLocaleString()}</div>
                        <div className="text-xs text-gray-400">downloads</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Platform Accounting */}
        <div className="bg-gradient-to-r from-yellow-600/20 to-red-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-yellow-500/50">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            🏦 Platform Accounting
            {!analytics.platform_accounting.is_balanced && <span className="text-red-500 text-sm">⚠️ IMBALANCED</span>}
          </h2>

          <div className="bg-blue-900/30 rounded-lg p-4 mb-4 border border-blue-500/30">
            <h3 className="text-lg font-semibold mb-3">📊 Revenue Breakdown</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
              <div>
                <div className="text-gray-400">Total Platform Revenue</div>
                <div className="text-xl font-bold text-green-400">{formatCurrency(analytics.platform_accounting.total_platform_revenue || 0)}</div>
                <div className="text-xs text-green-300">All NET money that entered platform</div>
              </div>
              <div>
                <div className="text-gray-400">Your Platform Profit</div>
                <div className="text-xl font-bold text-blue-400">{formatCurrency(analytics.platform_accounting.platform_profit || 0)}</div>
                <div className="text-xs text-blue-300">25% commission (withdraw safely)</div>
              </div>
              <div>
                <div className="text-gray-400">Host Reserve Pool</div>
                <div className="text-2xl font-bold text-yellow-400">{formatCurrency(analytics.platform_accounting.reserve_balance || 0)}</div>
                <div className="text-xs text-yellow-300">75% owed to hosts (DO NOT TOUCH)</div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <AccountingCard title="Platform Profit" value={`₦${(analytics.platform_accounting.platform_profit || 0).toLocaleString()}`} subtitle="✅ Can withdraw safely" bgColor="bg-green-700/30" />
            <AccountingCard title="Reserve Account (Host 75%)" value={`₦${analytics.platform_accounting.reserve_balance.toLocaleString()}`} subtitle="⚠️ DO NOT TOUCH" bgColor="bg-blue-700/30" />
            <AccountingCard title="Pending Payouts" value={`₦${analytics.payouts.pending_amount.toLocaleString()}`} subtitle={`${analytics.payouts.pending_count} requests`} bgColor="bg-yellow-700/30" />
            <AccountingCard title="Total Withdrawn" value={`₦${analytics.payouts.total_withdrawn.toLocaleString()}`} subtitle={`${analytics.payouts.completed_count} payouts`} bgColor="bg-purple-700/30" />
          </div>

          {/* Accounting Donut Chart */}
          <div className="mt-6">
            <h3 className="text-lg font-semibold mb-3">Account Balance Distribution</h3>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={accountingPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  dataKey="value"
                >
                  {accountingPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => `₦${value.toLocaleString()}`} contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fee Revenue Breakdown */}
        <div className="bg-gradient-to-r from-green-600/20 to-emerald-600/20 backdrop-blur-lg rounded-xl p-6 border border-green-500/30">
          <h2 className="text-2xl font-bold mb-4">💰 Platform Fee Revenue Breakdown</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <Card className="bg-white/5 border-green-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Ticket Transfer Fees (5%)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-400">{formatCurrency(analytics.platform_accounting.lifetime_transfer_fee_revenue || 0)}</div>
                <p className="text-xs text-gray-400 mt-1">From gifted tickets • Additional revenue stream</p>
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-blue-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Wallet Gift Commission (25%)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-400">{formatCurrency(analytics.platform_accounting.lifetime_token_donation_commission || 0)}</div>
                <p className="text-xs text-gray-400 mt-1">From wallet-to-wallet token gifts</p>
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
            <Card className="bg-white/5 border-amber-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Withdrawal Fees (₦100 flat)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-400">{formatCurrency(analytics.platform_accounting.lifetime_withdrawal_fee_revenue || 0)}</div>
                <p className="text-xs text-gray-400 mt-1">All-time · Sweep quarterly from Reserve</p>
                {(analytics.platform_accounting.withdrawal_fee_revenue || 0) > 0 && (
                  <button
                    onClick={handleSweepWithdrawalFees}
                    disabled={sweepingWithdrawalFees}
                    className="mt-2 px-3 py-1 bg-amber-600 hover:bg-amber-700 rounded text-xs font-semibold disabled:opacity-50 w-full"
                  >
                    {sweepingWithdrawalFees ? 'Sweeping...' : `Sweep ₦${(analytics.platform_accounting.withdrawal_fee_revenue || 0).toLocaleString()}`}
                  </button>
                )}
                {(analytics.platform_accounting.withdrawal_fee_revenue || 0) === 0 && (
                  <p className="text-xs text-gray-500 mt-1">All fees swept ✓</p>
                )}
              </CardContent>
            </Card>
            <Card className="bg-white/5 border-purple-500/20 hover:bg-white/10 transition-colors">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs text-gray-400 uppercase">Early Bird Savings (Informational)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-400">{formatCurrency(analytics.platform_accounting.total_early_bird_savings || 0)}</div>
                <p className="text-xs text-gray-400 mt-1">Total discounts given to early buyers</p>
              </CardContent>
            </Card>
          </div>
          <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-300 mb-2">📊 Revenue Model Summary:</h3>
            <ul className="text-xs text-gray-300 space-y-1">
              <li>• <strong>Token Spread Profit:</strong> ₦43 per token (Buy ₦165 - Sell ₦122 = 26% margin) — captured via Paystack Split Code at purchase</li>
              <li>• <strong>Donation Commission:</strong> 25% kept when users tip hosts during sessions (host gets 75%)</li>
              <li>• <strong>Withdrawal Fee:</strong> ₦100 flat per withdrawal — stays in Reserve, sweep quarterly to Revenue</li>
              <li>• <strong>Transfer Fees:</strong> 5% charged when users gift tickets to others</li>
              <li>• <strong>Post Split:</strong> 25% platform share when users buy paid posts/recordings</li>
              <li>• <strong>Host Revenue:</strong> 100% of token ticket sales — hosts keep all tokens spent on their events</li>
            </ul>
          </div>
        </div>

        {/* Payouts */}
        <AdminPayoutsSection
          pendingPayouts={pendingPayouts}
          processingPayouts={processingPayouts}
          processingPayout={processingPayout}
          handleApprovePayout={handleApprovePayout}
          handleRejectPayout={handleRejectPayout}
          handleCompletePayout={handleCompletePayout}
          formatCurrency={formatCurrency}
        />

        {/* Revenue Trend — AreaChart with gradients */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">📈 Revenue Trend</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={revenueChartData}>
              <defs>
                <linearGradient id="gmvGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="platformGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} formatter={(value) => `₦${value.toLocaleString()}`} />
              <Legend />
              <Area type="monotone" dataKey="gmv" stroke="#3b82f6" fill="url(#gmvGradient)" name="GMV (Total)" strokeWidth={2} />
              <Area type="monotone" dataKey="platform" stroke="#10b981" fill="url(#platformGradient)" name="Platform Revenue (25%)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Session Activity */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">🎬 Session Activity</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={sessionChartData}>
              <defs>
                <linearGradient id="sessionGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
              <XAxis dataKey="name" stroke="#fff" />
              <YAxis stroke="#fff" />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
              <Legend />
              <Area type="monotone" dataKey="sessions" stroke="#f59e0b" fill="url(#sessionGradient)" name="Watch Sessions" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Token Flow */}
        <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
          <h2 className="text-2xl font-bold mb-4">🪙 Token Flow</h2>
          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
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
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} formatter={(value) => `${parseFloat(value).toFixed(2)} tokens`} />
              <Legend />
              <Bar dataKey="purchased" fill="#10b981" name="Purchased (Minted)" />
              <Bar dataKey="spent" fill="#ef4444" name="Spent (Tickets/Donations)" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Token Spending Analytics */}
        {tokenSpendingData && (
          <>
            <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-purple-500/50">
              <h2 className="text-2xl font-bold mb-4">🪙 Token Spending Analytics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <MetricCard title="Total Tokens Spent" value={`${formatTokens(tokenSpendingData.summary.total_tokens_display)} 🪙`} subtitle={`${tokenSpendingData.summary.total_tickets.toLocaleString()} tickets sold`} color="bg-purple-600" />
                <MetricCard title="Revenue from Tokens" value={formatCurrency(tokenSpendingData.summary.total_revenue_ngn)} subtitle="All token ticket sales" color="bg-pink-600" />
                <MetricCard title="Average Ticket Price" value={`${formatTokens(tokenSpendingData.summary.avg_ticket_price_tokens)} 🪙`} subtitle="Per ticket" color="bg-indigo-600" />
                <MetricCard title="Active Economy" value={`${tokenSpendingData.summary.unique_rooms}`} subtitle={`${tokenSpendingData.summary.unique_hosts} hosts earning`} color="bg-blue-600" />
              </div>

              {tokenSpendingData.daily_trends && tokenSpendingData.daily_trends.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-lg font-semibold mb-3">📊 Token Spending Trend (Last 30 Days)</h3>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={tokenSpendingData.daily_trends.reverse()}>
                      <defs>
                        <linearGradient id="tokenGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.8} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0.1} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#ffffff30" />
                      <XAxis dataKey="date" stroke="#fff" tick={{ fontSize: 12 }} tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} />
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
                      <Area type="monotone" dataKey="tokens_display" stroke="#a855f7" fill="url(#tokenGradient)" name="Tokens Spent" />
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
                        <td className="py-3 px-4"><span className="text-xl">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span></td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-purple-300">{room.room_name}</div>
                          <div className="text-xs text-gray-400">ID: {room.room_id}</div>
                        </td>
                        <td className="py-3 px-4 text-blue-300">{room.host_name}</td>
                        <td className="py-3 px-4 text-right"><div className="font-bold text-yellow-400">{formatTokens(room.tokens_display)} 🪙</div></td>
                        <td className="py-3 px-4 text-right text-gray-300">{room.ticket_count}</td>
                        <td className="py-3 px-4 text-right text-green-400">{formatCurrency(room.revenue_ngn)}</td>
                      </tr>
                    ))}
                    {(!tokenSpendingData.top_rooms || tokenSpendingData.top_rooms.length === 0) && (
                      <tr><td colSpan="6" className="py-8 text-center text-gray-400">No token spending data yet</td></tr>
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
                      <th className="text-right py-3 px-4">Tokens Earned</th>
                      <th className="text-right py-3 px-4">Tickets Sold</th>
                      <th className="text-right py-3 px-4">Rooms</th>
                      <th className="text-right py-3 px-4">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(tokenSpendingData.top_hosts || []).map((host, index) => (
                      <tr key={host.host_id} className="border-b border-white/10 hover:bg-white/5">
                        <td className="py-3 px-4"><span className="text-xl">{index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span></td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-blue-300">{host.host_name}</div>
                          <div className="text-xs text-gray-400">ID: {host.host_id}</div>
                        </td>
                        <td className="py-3 px-4 text-right"><div className="font-bold text-green-400">{formatTokens(host.tokens_display)} 🪙</div></td>
                        <td className="py-3 px-4 text-right text-purple-300">{host.tickets_sold}</td>
                        <td className="py-3 px-4 text-right text-gray-300">{host.room_count}</td>
                        <td className="py-3 px-4 text-right text-yellow-400">{formatCurrency(host.revenue_ngn)}</td>
                      </tr>
                    ))}
                    {(!tokenSpendingData.top_hosts || tokenSpendingData.top_hosts.length === 0) && (
                      <tr><td colSpan="6" className="py-8 text-center text-gray-400">No host earnings data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Token Economy Flow */}
            <div className="bg-white/10 backdrop-blur-lg rounded-xl p-6 border border-white/20">
              <h2 className="text-2xl font-bold mb-4">🔄 Token Economy Flow</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-green-600/20 rounded-lg p-4 border border-green-500/30 text-center">
                  <div className="text-4xl mb-2">💰</div>
                  <div className="text-sm text-gray-300 mb-1">Tokens Purchased</div>
                  <div className="text-3xl font-bold text-green-400">{formatTokens(analytics.tokens.total_minted)} 🪙</div>
                  <div className="text-xs text-green-300 mt-2">Revenue: {formatCurrency(analytics.revenue.all_time.gmv)}</div>
                </div>
                <div className="bg-purple-600/20 rounded-lg p-4 border border-purple-500/30 text-center">
                  <div className="text-4xl mb-2">🎟️</div>
                  <div className="text-sm text-gray-300 mb-1">Tokens Spent on Tickets</div>
                  <div className="text-3xl font-bold text-purple-400">{formatTokens(tokenSpendingData.summary.total_tokens_display)} 🪙</div>
                  <div className="text-xs text-purple-300 mt-2">{tokenSpendingData.summary.total_tickets.toLocaleString()} tickets sold</div>
                </div>
                <div className="bg-blue-600/20 rounded-lg p-4 border border-blue-500/30 text-center">
                  <div className="text-4xl mb-2">📊</div>
                  <div className="text-sm text-gray-300 mb-1">Token Velocity</div>
                  <div className="text-3xl font-bold text-blue-400">
                    {((tokenSpendingData.summary.total_tokens_spent / (analytics.tokens.total_minted * 100 || 1)) * 100).toFixed(1)}%
                  </div>
                  <div className="text-xs text-blue-300 mt-2">Spent / Minted ratio</div>
                </div>
              </div>
            </div>

            {/* Token Donation Commissions */}
            <div className="bg-gradient-to-br from-yellow-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border border-yellow-500/30">
              <h2 className="text-2xl font-bold mb-6">💝 Token Donation Commissions (Wallet-to-Wallet Gifts)</h2>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <Card className="bg-white/10 border-yellow-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Gifts Sent</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-400">{analytics.token_donations?.total_gifts_count?.toLocaleString() || '0'}</div>
                    <p className="text-xs text-gray-400 mt-1">{formatTokens(analytics.token_donations?.total_value_tokens || 0)} tokens gifted</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/10 border-orange-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Gift Value</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-orange-400">{formatCurrency(analytics.token_donations?.total_value_ngn || 0)}</div>
                    <p className="text-xs text-gray-400 mt-1">₦122 per token (withdrawal rate)</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/10 border-green-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Lifetime Commission (5%)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-400">{formatCurrency(analytics.token_donations?.commission_earned_ngn || 0)}</div>
                    <p className="text-xs text-gray-400 mt-1">All-time earnings from gifts</p>
                  </CardContent>
                </Card>
                <Card className="bg-gradient-to-br from-green-600/30 to-emerald-600/30 border-2 border-green-500/50">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">💰 Available to Transfer</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-green-300">{formatCurrency(analytics.token_donations?.available_to_transfer || 0)}</div>
                    <p className="text-xs text-green-200 mt-1">Ready for Reserve → Revenue</p>
                  </CardContent>
                </Card>
              </div>

              {(analytics.token_donations?.available_to_transfer || 0) > 0 ? (
                <div className="bg-green-600/20 rounded-lg p-4 border border-green-500/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-white mb-1">💸 Transfer Commission to Revenue Account</div>
                      <div className="text-sm text-gray-300">Move {formatCurrency(analytics.token_donations.available_to_transfer)} from Reserve to Revenue Subaccount</div>
                      <div className="text-xs text-yellow-300 mt-2">⚠️ This logs the request. Complete the actual transfer via Paystack Dashboard.</div>
                    </div>
                    <button
                      onClick={handleTransferCommission}
                      disabled={transferringCommission}
                      className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"
                    >
                      {transferringCommission ? <><ArrowPathIcon className="h-5 w-5 animate-spin" />Processing...</> : <><ArrowDownTrayIcon className="h-5 w-5" />Transfer to Revenue</>}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-600/20 rounded-lg p-4 border border-gray-500/30 text-center text-gray-400">
                  💡 No commission available yet. Accumulates when users send wallet-to-wallet token gifts.
                </div>
              )}

              <div className="mt-4 bg-blue-600/10 border border-blue-500/30 rounded-lg p-4 text-sm text-blue-200">
                <strong>ℹ️ Wallet-to-Wallet Gifts vs In-Session Tips:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-xs">
                  <li><strong>Wallet-to-Wallet Gifts:</strong> User A sends tokens directly to User B's wallet (tracked here)</li>
                  <li><strong>In-Session Tips:</strong> Users tip hosts during watch parties (tracked in "Top Donors" below)</li>
                  <li>Wallet gifts: 5% goes to platform, 95% to recipient</li>
                  <li>Commissions are valued at ₦122 per token. Stay in Reserve until manually transferred.</li>
                </ul>
              </div>
            </div>

            {/* Paid Post Split Profit */}
            {splitProfit?.summary && (
              <div className="bg-gradient-to-br from-purple-600/20 to-pink-600/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold">🎬 Paid Post Split Profit (25% Platform Share)</h2>
                  <p className="text-sm text-gray-400 mt-1">Accumulates as users buy paid posts/recordings — sweep into super-admin wallet to settle.</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                  <Card className="bg-white/10 border-purple-500/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Post Sales</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-purple-400">{formatTokens(splitProfit.summary.total_sales_tokens || 0)}</div>
                      <p className="text-xs text-gray-400 mt-1">≈ {formatCurrency(splitProfit.summary.total_sales_ngn || 0)} at ₦165/token</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white/10 border-pink-500/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Lifetime Profit (25%)</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-pink-400">{formatTokens(splitProfit.summary.total_platform_profit_tokens || 0)}</div>
                      <p className="text-xs text-gray-400 mt-1">{formatCurrency(splitProfit.summary.total_platform_profit_ngn || 0)} at ₦122/token</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white/10 border-gray-500/30">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Already Transferred</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-gray-300">{formatTokens(splitProfit.summary.transferred_tokens || 0)}</div>
                      <p className="text-xs text-gray-400 mt-1">Logged in split_profit_transfers</p>
                    </CardContent>
                  </Card>
                  <Card className="bg-gradient-to-br from-green-600/30 to-emerald-600/30 border-2 border-green-500/50">
                    <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">💰 Available to Transfer</CardTitle></CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold text-green-300">{formatTokens(splitProfit.summary.available_tokens || 0)}</div>
                      <p className="text-xs text-green-200 mt-1">Pending sweep to super admin</p>
                    </CardContent>
                  </Card>
                </div>

                {(splitProfit.summary.available_tokens || 0) > 0 ? (
                  <div className="bg-green-600/20 rounded-lg p-4 border border-green-500/30">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="font-semibold text-white mb-1">💸 Sweep Split Profit into Super-Admin Wallet</div>
                        <div className="text-sm text-gray-300">
                          Move {formatTokens(splitProfit.summary.available_tokens)} (≈ {formatCurrency((splitProfit.summary.available_tokens || 0) * 122 / 100)}) into super-admin wallet (user&nbsp;id&nbsp;7).
                        </div>
                        <div className="text-xs text-yellow-300 mt-2">ℹ️ Logs a row in <code>split_profit_transfers</code> + a <code>token_transactions</code> entry.</div>
                      </div>
                      <button
                        onClick={handleTransferSplitProfit}
                        disabled={transferringSplitProfit}
                        className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2"
                      >
                        {transferringSplitProfit ? <><ArrowPathIcon className="h-5 w-5 animate-spin" />Transferring…</> : <><ArrowDownTrayIcon className="h-5 w-5" />Transfer to Super Admin</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-600/20 rounded-lg p-4 border border-gray-500/30 text-center text-gray-400">
                    💡 No split profit available yet. The 25% platform cut accumulates as users purchase paid posts/recordings.
                  </div>
                )}

                {Array.isArray(splitProfit.sales_by_rating) && splitProfit.sales_by_rating.length > 0 && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-300 mb-3">Sales by Content Rating</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {splitProfit.sales_by_rating.map((row) => (
                        <div key={row.rating} className="bg-white/5 border border-white/10 rounded-lg p-3">
                          <div className="text-xs text-gray-400 mb-1">{row.rating}</div>
                          <div className="text-lg font-bold text-white">{(row.sales || 0).toLocaleString()} <span className="text-xs text-gray-400">sales</span></div>
                          <div className="text-xs text-gray-400 mt-1">{formatTokens(row.revenue_tokens || 0)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* Event Ticketing Analytics */}
        {eventAnalytics && (
          <div className="bg-gradient-to-br from-purple-600/20 to-indigo-600/20 backdrop-blur-lg rounded-xl p-6 border border-purple-500/30">
            <div className="mb-6">
              <h2 className="text-2xl font-bold">🎟️ Event Ticketing Analytics</h2>
              <p className="text-sm text-gray-400 mt-1">Scheduled events, ticket sales, and RSVPs</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-gradient-to-br from-purple-500 to-purple-700 border-purple-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">Tickets Sold</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{eventAnalytics.total_tickets_sold?.toLocaleString() || '0'}</div>
                  <p className="text-xs text-purple-200 mt-1">Paid event tickets</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-green-500 to-emerald-700 border-green-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">Free RSVPs</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{eventAnalytics.total_rsvps?.toLocaleString() || '0'}</div>
                  <p className="text-xs text-green-200 mt-1">Free event bookings</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-yellow-500 to-orange-600 border-yellow-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">Ticket Revenue</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{formatTokens(eventAnalytics.ticket_revenue || 0)}</div>
                  <p className="text-xs text-yellow-100 mt-1">≈ {formatCurrency((eventAnalytics.ticket_revenue || 0) * 1.65)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-pink-500 to-rose-700 border-pink-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">Gift Transfer Fees (5%)</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{formatTokens(eventAnalytics.transfer_fee_revenue || 0)}</div>
                  <p className="text-xs text-pink-200 mt-1">From gifted tickets</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-pink-500 to-fuchsia-700 border-pink-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">🎁 Gifted Tickets</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{eventAnalytics.total_gifted_tickets?.toLocaleString() || '0'}</div>
                  <p className="text-xs text-fuchsia-200 mt-1">Tickets sent as gifts</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-orange-500 to-red-600 border-orange-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">🎉 Early Bird Sales</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{eventAnalytics.early_bird_tickets?.toLocaleString() || '0'}</div>
                  <p className="text-xs text-orange-200 mt-1">Saved: {formatTokens(eventAnalytics.early_bird_savings || 0)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-500 to-indigo-700 border-blue-400 shadow-lg">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">📅 Upcoming Paid Events</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{eventAnalytics.upcoming_paid_events?.toLocaleString() || '0'}</div>
                  <p className="text-xs text-blue-200 mt-1">Future scheduled events</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-emerald-500 to-green-700 border-2 border-emerald-400 shadow-xl">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-white">💰 Total Revenue</CardTitle></CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-white">{formatTokens(eventAnalytics.total_revenue || 0)}</div>
                  <p className="text-xs text-green-200 mt-1">Tickets + transfer fees</p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue by Watch Type */}
            {eventAnalytics.revenue_by_watch_type && eventAnalytics.revenue_by_watch_type.length > 0 && (
              <Card className="bg-white/5 border-purple-500/20 mb-4">
                <CardHeader><CardTitle className="text-lg font-bold text-white">Revenue by Watch Type</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {eventAnalytics.revenue_by_watch_type.map((type) => (
                      <Card key={type.watch_type} className="bg-white/5 border-purple-500/10 hover:bg-white/10 transition-colors">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium text-gray-300">
                            {type.watch_type === '3d_cinema' ? '🎬 3D Cinema' : type.watch_type === 'classroom' ? '🎓 Classroom' : '📺 Video Watch'}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="text-xl font-bold text-purple-400">{formatTokens(type.revenue)}</div>
                          <p className="text-xs text-gray-400 mt-1">{type.ticket_count} tickets • {type.rsvp_count || 0} RSVPs</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Top Selling Events */}
            {eventAnalytics.top_events && eventAnalytics.top_events.length > 0 && (
              <Card className="bg-white/5 border-yellow-500/20">
                <CardHeader><CardTitle className="text-lg font-bold text-white">🏆 Top Selling Events</CardTitle></CardHeader>
                <CardContent>
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
                        {eventAnalytics.top_events.slice(0, 10).map((event, index) => (
                          <tr key={event.event_id} className="border-b border-white/10 hover:bg-white/5">
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-lg font-bold text-purple-400 border-purple-500/30">
                                  #{index + 1}
                                </Badge>
                                <div>
                                  <div className="font-medium text-white">{event.title || event.event_name || 'Untitled Event'}</div>
                                  {event.scheduled_time && (
                                    <div className="text-xs text-gray-400">
                                      {new Date(event.scheduled_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-1 text-gray-300">
                                {event.watch_type === '3d_cinema' || event.watch_type === '3dcinema' ? '🎬' : event.watch_type === 'classroom' || event.watch_type === 'lecture' ? '🎓' : '📺'}
                                <span>{event.room_name || `Room ${event.room_id}`}</span>
                              </div>
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-yellow-400">
                              {event.ticket_count || event.tickets_sold || 0}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-green-400">
                              {event.rsvp_count || 0}
                            </td>
                            <td className="py-3 px-4 text-right font-semibold text-purple-400">
                              {formatTokens(event.total_revenue || event.revenue || 0)} 🪙
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Early Bird Stats */}
            {eventAnalytics.early_bird_tickets > 0 && (
              <div className="mt-4 bg-yellow-600/20 rounded-lg p-4 border border-yellow-500/30">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-2xl">🐦</span>
                  <span className="font-semibold text-yellow-300">Early Bird Tickets</span>
                </div>
                <div className="text-sm text-gray-300">
                  {eventAnalytics.early_bird_tickets} tickets sold at early bird pricing
                  {eventAnalytics.early_bird_revenue > 0 && <span className="ml-2">• {formatTokens(eventAnalytics.early_bird_revenue)} 🪙 revenue</span>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Community Requests Analytics */}
        {communityAnalytics && (
          <div className="bg-gradient-to-br from-indigo-600/20 to-purple-600/20 backdrop-blur-lg rounded-xl p-6 border border-indigo-500/30">
            <h2 className="text-2xl font-bold mb-6">📅 Community Requests Analytics</h2>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-white/10 rounded-xl p-4 border border-white/10 text-center">
                <div className="text-3xl font-black text-white">{communityAnalytics.totals.total}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Total Requests</div>
              </div>
              <div className="bg-green-600/20 rounded-xl p-4 border border-green-500/30 text-center">
                <div className="text-3xl font-black text-green-400">{communityAnalytics.totals.open}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Open</div>
              </div>
              <div className="bg-blue-600/20 rounded-xl p-4 border border-blue-500/30 text-center">
                <div className="text-3xl font-black text-blue-400">{communityAnalytics.totals.claimed}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Claimed (Host Found)</div>
              </div>
              <div className="bg-gray-600/20 rounded-xl p-4 border border-gray-500/30 text-center">
                <div className="text-3xl font-black text-gray-400">{communityAnalytics.totals.closed}</div>
                <div className="text-xs text-gray-400 mt-1 uppercase tracking-wide">Closed (Event Done)</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-yellow-600/20 rounded-xl p-4 border border-yellow-500/30 flex items-center gap-4">
                <span className="text-4xl">👍</span>
                <div>
                  <div className="text-2xl font-bold text-yellow-400">{(communityAnalytics.total_upvotes || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Total upvotes across all requests</div>
                </div>
              </div>
              <div className="bg-purple-600/20 rounded-xl p-4 border border-purple-500/30 flex items-center gap-4">
                <span className="text-4xl">🙋</span>
                <div>
                  <div className="text-2xl font-bold text-purple-400">{(communityAnalytics.total_claims || 0).toLocaleString()}</div>
                  <div className="text-xs text-gray-400 mt-0.5">Total host claims made</div>
                </div>
              </div>
            </div>

            {/* Top requested items */}
            {communityAnalytics.top_requests?.length > 0 && (
              <div className="bg-white/5 rounded-xl overflow-hidden mb-4">
                <div className="px-4 py-3 border-b border-white/10">
                  <h3 className="font-semibold text-white">🏆 Most Upvoted Requests</h3>
                </div>
                <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left">
                      <th className="px-4 py-2 text-gray-400 font-medium">#</th>
                      <th className="px-4 py-2 text-gray-400 font-medium">Title</th>
                      <th className="px-4 py-2 text-gray-400 font-medium">Rating</th>
                      <th className="px-4 py-2 text-right text-gray-400 font-medium">Upvotes</th>
                      <th className="px-4 py-2 text-right text-gray-400 font-medium">Claims</th>
                      <th className="px-4 py-2 text-right text-gray-400 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {communityAnalytics.top_requests.map((req, i) => (
                      <tr key={req.id} className="hover:bg-white/5">
                        <td className="px-4 py-2.5 text-gray-400">{i + 1}</td>
                        <td className="px-4 py-2.5 text-white font-medium max-w-[200px] truncate">{req.title}</td>
                        <td className="px-4 py-2.5 text-gray-300">{req.content_rating}</td>
                        <td className="px-4 py-2.5 text-right text-yellow-400 font-bold">{req.upvote_count}</td>
                        <td className="px-4 py-2.5 text-right text-purple-400">{req.claim_count}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            req.status === 'open' ? 'bg-green-500/20 text-green-300' :
                            req.status === 'claimed' ? 'bg-blue-500/20 text-blue-300' :
                            'bg-gray-500/20 text-gray-400'
                          }`}>{req.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* By content rating */}
            {communityAnalytics.by_rating?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Requests by Content Rating</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {communityAnalytics.by_rating.map(r => (
                    <div key={r.content_rating} className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
                      <div className="text-lg font-bold text-white">{r.count}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{r.content_rating}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Top Donors — In-Session Tips */}
        <div className="bg-gradient-to-br from-pink-600/20 to-purple-600/20 backdrop-blur-lg rounded-xl p-6 border border-pink-500/30">
          <div className="mb-6">
            <h2 className="text-2xl font-bold">🎁 Top Donors — In-Session Tips</h2>
            <p className="text-sm text-gray-400 mt-1">Users who tip during watch parties (not wallet-to-wallet gifts)</p>
          </div>
          {topDonorsData ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <Card className="bg-white/10 border-yellow-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Tips (In-Session)</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-yellow-400">{formatTokens(topDonorsData.statistics.total_donated_tokens)} 🪙</div>
                    <p className="text-xs text-gray-400 mt-1">≈ {formatCurrency(topDonorsData.statistics.total_donated_tokens * 1.65)}</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/10 border-pink-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Total Tippers</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-pink-400">{topDonorsData.statistics.total_donors}</div>
                    <p className="text-xs text-gray-400 mt-1">Users who tip hosts</p>
                  </CardContent>
                </Card>
                <Card className="bg-white/10 border-purple-500/30">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-gray-300">Sessions with Tips</CardTitle></CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-purple-400">{topDonorsData.statistics.total_sessions}</div>
                    <p className="text-xs text-gray-400 mt-1">Watch parties tipped</p>
                  </CardContent>
                </Card>
              </div>
              <div className="bg-white/5 rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/10">
                    <tr>
                      <th className="text-left px-4 py-3 text-sm font-semibold">Rank</th>
                      <th className="text-left px-4 py-3 text-sm font-semibold">Tipper</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold">Total Tipped</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold">Times</th>
                      <th className="text-right px-4 py-3 text-sm font-semibold">Sessions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {topDonorsData?.top_donors?.length > 0 ? topDonorsData.top_donors.map((donor, index) => (
                      <tr key={donor.donor_id} className="hover:bg-white/5 transition-colors">
                        <td className="px-4 py-3">
                          {index === 0 ? '👑' : index === 1 ? '🥈' : index === 2 ? '🥉' : <span className="text-gray-400">#{index + 1}</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <img src={donor.avatar_url || '/default-avatar.png'} alt={donor.username} className="w-10 h-10 rounded-full object-cover" />
                            <div>
                              <div className="font-semibold">{donor.username}</div>
                              <div className="text-xs text-gray-400">ID: {donor.donor_id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="font-bold text-yellow-400">{formatTokens(donor.total_donated)} 🪙</div>
                          <div className="text-xs text-gray-400">{formatCurrency(donor.total_donated * 1.65)}</div>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-pink-400">{donor.donation_count}</td>
                        <td className="px-4 py-3 text-right font-semibold text-purple-400">{donor.session_count}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan="5" className="px-4 py-8 text-center text-gray-400">No in-session tips yet</td></tr>
                    )}
                  </tbody>
                </table>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-400">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-pink-500 mx-auto mb-4"></div>
              Loading donors data...
            </div>
          )}
        </div>

        {/* Ad Campaign Analytics */}
        {analytics.ads && (
          <div className="bg-gradient-to-r from-purple-600/20 to-pink-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-purple-500/50">
            <h2 className="text-2xl font-bold mb-6">📢 Ad Campaign Analytics</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <MetricCard title="Active Campaigns" value={analytics.ads.active_campaigns} subtitle={`${analytics.ads.total_campaigns} total campaigns`} color="bg-gradient-to-br from-purple-500/20 to-purple-700/20" />
              <MetricCard title="Total Impressions" value={analytics.ads.total_impressions.toLocaleString()} subtitle={`${analytics.ads.impressions_today} today`} color="bg-gradient-to-br from-blue-500/20 to-blue-700/20" />
              <MetricCard title="Total Clicks" value={analytics.ads.total_clicks.toLocaleString()} subtitle={`${analytics.ads.clicks_today} today`} color="bg-gradient-to-br from-green-500/20 to-green-700/20" />
              <MetricCard title="Click-Through Rate" value={`${analytics.ads.ctr.toFixed(2)}%`} subtitle="Overall CTR" color="bg-gradient-to-br from-yellow-500/20 to-yellow-700/20" />
            </div>

            {adImpressionChartData.length > 0 && (
              <div className="bg-white/5 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold mb-4">Ad Performance Trends</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={adImpressionChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="name" stroke="#9ca3af" />
                    <YAxis stroke="#9ca3af" />
                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }} labelStyle={{ color: '#f3f4f6' }} />
                    <Legend />
                    <Bar dataKey="impressions" fill="#8b5cf6" name="Impressions" />
                    <Bar dataKey="clicks" fill="#10b981" name="Clicks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <Card className="bg-white/10 border-white/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold opacity-90">Pending Inquiries</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold mb-1">{analytics.ads.pending_inquiries}</p>
                  <p className="text-sm opacity-75">{analytics.ads.approved_inquiries} approved</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 border-white/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold opacity-90">Estimated Revenue</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold mb-1">₦{analytics.ads.estimated_revenue.toFixed(2)}</p>
                  <p className="text-sm opacity-75">From ad spends</p>
                </CardContent>
              </Card>
              <Card className="bg-white/10 border-white/20">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold opacity-90">This Week</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-xl font-bold mb-1">{analytics.ads.impressions_week.toLocaleString()} impressions</p>
                  <p className="text-sm opacity-75">{analytics.ads.clicks_week} clicks</p>
                </CardContent>
              </Card>
            </div>

            {analytics.ads.top_campaigns && analytics.ads.top_campaigns.length > 0 && (
              <div className="bg-white/5 rounded-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Top Performing Campaigns</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="border-b border-gray-700">
                      <tr>
                        <th className="pb-3 text-gray-400 font-medium">Campaign</th>
                        <th className="pb-3 text-gray-400 font-medium">Impressions</th>
                        <th className="pb-3 text-gray-400 font-medium">Clicks</th>
                        <th className="pb-3 text-gray-400 font-medium">CTR</th>
                        <th className="pb-3 text-gray-400 font-medium">CPM</th>
                        <th className="pb-3 text-gray-400 font-medium">Spent</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.ads.top_campaigns.map((campaign, index) => (
                        <tr key={index} className="border-b border-gray-800">
                          <td className="py-3 font-medium">{campaign.CampaignName}</td>
                          <td className="py-3">{campaign.Impressions.toLocaleString()}</td>
                          <td className="py-3">{campaign.Clicks}</td>
                          <td className="py-3">{campaign.CTR.toFixed(2)}%</td>
                          <td className="py-3">₦{campaign.CPM.toFixed(2)}</td>
                          <td className="py-3">₦{campaign.SpentAmount.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                      <span className="text-2xl">{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}</span>
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
          <StatsCard title="Rooms" stats={[
            { label: 'Total', value: analytics.rooms.total },
            { label: 'Public', value: analytics.rooms.public },
            { label: 'Private', value: analytics.rooms.private },
          ]} />
          <StatsCard title="Donations" stats={[
            { label: 'All-time', value: `₦${analytics.donations.all_time.total.toLocaleString()}` },
            { label: 'This Week', value: `₦${analytics.donations.week.total.toLocaleString()}` },
            { label: 'Count', value: analytics.donations.all_time.count },
          ]} />
          <StatsCard title="Events" stats={[
            { label: 'Total', value: analytics.events.total },
            { label: 'Upcoming', value: analytics.events.upcoming },
            { label: 'Past', value: analytics.events.past },
          ]} />
        </div>

        {/* KYC, Reports, Audit — self-contained sub-components */}
        <AdminKYCSection />
        <AdminReportsSection />
        <AdminAuditSection />
      </div>
    </div>
  );
};

export default AdminDashboard;
