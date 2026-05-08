// frontend/src/components/AdsManagementModal.jsx
import React, { useState, useEffect } from 'react';
import { XMarkIcon, MegaphoneIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import { apiClient, API_BASE_URL } from '../services/api';

const AdsManagementModal = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState('master_switch'); // 'master_switch', 'inquiries' or 'active_ads'
  const [inquiries, setInquiries] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  
  // Ad settings state
  const [adSettings, setAdSettings] = useState({
    global_enabled: false,
    feed_ads: false,
    session_ads: false,
    roomtv_ads: false,
    discover_ads: false
  });
  const [settingsLoading, setSettingsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'master_switch') {
        fetchAdSettings();
      } else if (activeTab === 'inquiries') {
        fetchInquiries();
      } else if (activeTab === 'active_ads') {
        fetchCampaigns();
      }
    }
  }, [isOpen, activeTab]);

  const fetchAdSettings = async () => {
    setSettingsLoading(true);
    try {
      const response = await apiClient.get('/api/ads/settings');
      setAdSettings(response.data);
    } catch (error) {
      console.error('Failed to fetch ad settings:', error);
      toast.error('Failed to load ad settings');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleToggleSetting = async (settingKey, currentValue) => {
    // Show warning when disabling global ads
    if (settingKey === 'global_enabled' && currentValue) {
      if (!window.confirm('⚠️ This will disable ALL ads across the platform and stop all revenue. Are you sure?')) {
        return;
      }
    }

    setSettingsLoading(true);
    try {
      const response = await apiClient.put('/api/ads/settings', {
        setting_key: settingKey,
        enabled: !currentValue
      });
      
      toast.success(`${settingKey.replace('_', ' ')} ${!currentValue ? 'enabled' : 'disabled'}`);
      fetchAdSettings();
    } catch (error) {
      console.error('Failed to update ad setting:', error);
      const errorMessage = error.response?.data?.error || 'Failed to update setting';
      toast.error(errorMessage);
    } finally {
      setSettingsLoading(false);
    }
  };

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ad-inquiries`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setInquiries(data.inquiries || []);
      } else {
        console.error('Failed to fetch inquiries:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch ad inquiries:', error);
      toast.error('Failed to load ad inquiries');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (inquiryId, status, notes = '') => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/ad-inquiries/${inquiryId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, admin_notes: notes })
      });

      if (response.ok) {
        toast.success(`Inquiry ${status}`);
        fetchInquiries();
        setSelectedInquiry(null);
      } else {
        toast.error('Failed to update inquiry');
      }
    } catch (error) {
      console.error('Failed to update inquiry:', error);
      toast.error('Failed to update inquiry');
    }
  };

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/campaigns`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      } else {
        console.error('Failed to fetch campaigns:', response.status);
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCampaignStatusUpdate = async (campaignId, newStatus) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/admin/campaigns/${campaignId}/status`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        toast.success(`Campaign ${newStatus}`);
        fetchCampaigns();
      } else {
        toast.error('Failed to update campaign');
      }
    } catch (error) {
      console.error('Failed to update campaign:', error);
      toast.error('Failed to update campaign');
    }
  };

  if (!isOpen) return null;

  const getStatusBadge = (status) => {
    const styles = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      approved: 'bg-green-500/20 text-green-400 border-green-500/30',
      rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
      contacted: 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs border ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const getBudgetLabel = (budget) => {
    const labels = {
      'under_500': 'Under $500',
      '500_1k': '$500 - $1,000',
      '1k_5k': '$1,000 - $5,000',
      '5k_10k': '$5,000 - $10,000',
      'over_10k': 'Over $10,000'
    };
    return labels[budget] || budget;
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/70 z-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[#1E1E1E] rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden border border-gray-700">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div className="flex items-center gap-3">
              <MegaphoneIcon className="w-7 h-7 text-purple-400" />
              <h2 className="text-2xl font-bold text-white">Ads Management</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-700 bg-[#252525]">
            <button
              onClick={() => setActiveTab('master_switch')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'master_switch'
                  ? 'text-white border-b-2 border-purple-500 bg-[#2A2A2A]'
                  : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              🔧 Master Switch
            </button>
            <button
              onClick={() => setActiveTab('inquiries')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'inquiries'
                  ? 'text-white border-b-2 border-purple-500 bg-[#2A2A2A]'
                  : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              📩 Ad Inquiries {inquiries.filter(i => i.status === 'pending').length > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {inquiries.filter(i => i.status === 'pending').length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('active_ads')}
              className={`flex-1 px-6 py-3 text-sm font-medium transition-colors ${
                activeTab === 'active_ads'
                  ? 'text-white border-b-2 border-purple-500 bg-[#2A2A2A]'
                  : 'text-gray-400 hover:text-white hover:bg-[#2A2A2A]'
              }`}
            >
              🎯 Active Campaigns
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)] custom-sleek-scrollbar">
            {/* Master Switch Tab */}
            {activeTab === 'master_switch' && (
              <div className="space-y-6">
                {settingsLoading ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    Loading settings...
                  </div>
                ) : (
                  <>
                    {/* Global Master Switch */}
                    <div className="bg-gradient-to-r from-purple-900/30 via-blue-900/30 to-purple-900/30 border border-purple-500/50 rounded-xl p-6">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex-1">
                          <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                            🌐 Global Ads Master Switch
                          </h3>
                          <p className="text-gray-300 text-sm">
                            Controls all advertising across the entire platform. When disabled, no ads will be shown anywhere.
                          </p>
                          {!adSettings.global_enabled && (
                            <p className="text-red-400 text-xs mt-2 font-semibold">
                              ⚠️ WARNING: All ads are currently disabled. Revenue generation is stopped.
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => handleToggleSetting('global_enabled', adSettings.global_enabled)}
                          disabled={settingsLoading}
                          className={`relative inline-flex h-12 w-24 min-w-[96px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                            adSettings.global_enabled ? 'bg-green-600' : 'bg-gray-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-10 w-10 transform rounded-full bg-white transition-transform shadow-lg ${
                              adSettings.global_enabled ? 'translate-x-12' : 'translate-x-1'
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Granular Controls */}
                    <div className={`space-y-4 transition-opacity ${!adSettings.global_enabled ? 'opacity-50 pointer-events-none' : ''}`}>
                      <h4 className="text-lg font-semibold text-white mb-4">Granular Ad Controls</h4>
                      
                      {/* Feed Ads */}
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="text-white font-medium mb-1">📰 Feed Ads</h5>
                            <p className="text-gray-400 text-sm">Show ads in Live Sessions feed in Watching Now tab (every 7th session)</p>
                          </div>
                          <button
                            onClick={() => handleToggleSetting('feed_ads', adSettings.feed_ads)}
                            disabled={settingsLoading || !adSettings.global_enabled}
                            className={`relative inline-flex h-8 w-16 min-w-[64px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                              adSettings.feed_ads ? 'bg-purple-600' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                adSettings.feed_ads ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Session Ads */}
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="text-white font-medium mb-1">🎬 Session Ads</h5>
                            <p className="text-gray-400 text-sm">Show ads during watch sessions (pre-roll, mid-roll)</p>
                          </div>
                          <button
                            onClick={() => handleToggleSetting('session_ads', adSettings.session_ads)}
                            disabled={settingsLoading || !adSettings.global_enabled}
                            className={`relative inline-flex h-8 w-16 min-w-[64px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                              adSettings.session_ads ? 'bg-purple-600' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                adSettings.session_ads ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* RoomTV Ads */}
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="text-white font-medium mb-1">📺 RoomTV Ads</h5>
                            <p className="text-gray-400 text-sm">Show ads in room TV banners when idle (1-hour frequency cap per room)</p>
                          </div>
                          <button
                            onClick={() => handleToggleSetting('roomtv_ads', adSettings.roomtv_ads)}
                            disabled={settingsLoading || !adSettings.global_enabled}
                            className={`relative inline-flex h-8 w-16 min-w-[64px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                              adSettings.roomtv_ads ? 'bg-purple-600' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                adSettings.roomtv_ads ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Discover Ads (NEW) */}
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <h5 className="text-white font-medium mb-1">🔍 Discover Ads</h5>
                            <p className="text-gray-400 text-sm">Show sponsored posts in Discover subtab (every 6th post - Instagram-style feed)</p>
                          </div>
                          <button
                            onClick={() => handleToggleSetting('discover_ads', adSettings.discover_ads)}
                            disabled={settingsLoading || !adSettings.global_enabled}
                            className={`relative inline-flex h-8 w-16 min-w-[64px] flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                              adSettings.discover_ads ? 'bg-purple-600' : 'bg-gray-700'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                adSettings.discover_ads ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Status Summary */}
                    <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4 mt-6">
                      <h5 className="text-blue-400 font-medium mb-2">📊 Current Status</h5>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="text-gray-300">Global Ads:</div>
                        <div className={adSettings.global_enabled ? 'text-green-400 font-semibold' : 'text-red-400 font-semibold'}>
                          {adSettings.global_enabled ? '✅ Enabled' : '❌ Disabled'}
                        </div>
                        <div className="text-gray-300">Feed Ads:</div>
                        <div className={adSettings.feed_ads ? 'text-green-400' : 'text-gray-500'}>
                          {adSettings.feed_ads ? '✅ Active' : '⚪ Inactive'}
                        </div>
                        <div className="text-gray-300">Session Ads:</div>
                        <div className={adSettings.session_ads ? 'text-green-400' : 'text-gray-500'}>
                          {adSettings.session_ads ? '✅ Active' : '⚪ Inactive'}
                        </div>
                        <div className="text-gray-300">RoomTV Ads:</div>
                        <div className={adSettings.roomtv_ads ? 'text-green-400' : 'text-gray-500'}>
                          {adSettings.roomtv_ads ? '✅ Active' : '⚪ Inactive'}
                        </div>
                        <div className="text-gray-300">Discover Ads:</div>
                        <div className={adSettings.discover_ads ? 'text-green-400' : 'text-gray-500'}>
                          {adSettings.discover_ads ? '✅ Active' : '⚪ Inactive'}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Inquiries Tab */}
            {activeTab === 'inquiries' && (
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    Loading inquiries...
                  </div>
                ) : inquiries.length === 0 ? (
                  <div className="text-center text-gray-400 py-12">
                    <MegaphoneIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No ad inquiries yet</p>
                    <p className="text-sm mt-2">Advertisers will appear here when they submit the contact form</p>
                  </div>
                ) : (
                  inquiries.map(inquiry => (
                    <div 
                      key={inquiry.id}
                      className="bg-[#252525] border border-gray-700 rounded-lg p-4 hover:border-purple-500/50 transition-all"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-white font-semibold text-lg">{inquiry.company_name}</h3>
                            {getStatusBadge(inquiry.status)}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="text-gray-400">
                              <span className="font-medium">Contact:</span> {inquiry.contact_name}
                            </div>
                            <div className="text-gray-400">
                              <span className="font-medium">Email:</span> {inquiry.email}
                            </div>
                            {inquiry.phone && (
                              <div className="text-gray-400">
                                <span className="font-medium">Phone:</span> {inquiry.phone}
                              </div>
                            )}
                            <div className="text-gray-400">
                              <span className="font-medium">Budget:</span> {getBudgetLabel(inquiry.budget)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-gray-500 ml-4">
                          {new Date(inquiry.created_at).toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </span>
                      </div>

                      {/* Campaign Goals */}
                      <div className="mb-3">
                        <span className="text-xs text-gray-500 font-medium">Goals:</span>
                        <p className="text-sm text-gray-300 mt-1">{inquiry.campaign_goals}</p>
                      </div>

                      {/* Target Audience */}
                      {inquiry.target_audience && (
                        <div className="mb-3">
                          <span className="text-xs text-gray-500 font-medium">Target Audience:</span>
                          <p className="text-sm text-gray-300 mt-1">{inquiry.target_audience}</p>
                        </div>
                      )}

                      {/* Message */}
                      {inquiry.message && (
                        <div className="mb-3">
                          <span className="text-xs text-gray-500 font-medium">Message:</span>
                          <p className="text-sm text-gray-300 mt-1">{inquiry.message}</p>
                        </div>
                      )}

                      {/* Admin Notes */}
                      {inquiry.admin_notes && (
                        <div className="mb-3 bg-blue-500/10 border border-blue-500/30 rounded p-3">
                          <span className="text-xs text-blue-400 font-medium">Admin Notes:</span>
                          <p className="text-sm text-blue-300 mt-1">{inquiry.admin_notes}</p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 mt-4">
                        {inquiry.status === 'pending' && (
                          <>
                            <button
                              onClick={() => handleUpdateStatus(inquiry.id, 'approved', 'Approved for campaign setup')}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleUpdateStatus(inquiry.id, 'rejected', 'Not suitable for our platform')}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        <button
                          onClick={() => handleUpdateStatus(inquiry.id, 'contacted', `Contacted on ${new Date().toLocaleDateString()}`)}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          📧 Mark as Contacted
                        </button>
                        <a
                          href={`mailto:${inquiry.email}?subject=WeWatch Advertising Inquiry - ${inquiry.company_name}`}
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          📨 Send Email
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {activeTab === 'active_ads' && (
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center text-gray-400 py-12">
                    <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                    Loading campaigns...
                  </div>
                ) : campaigns.length === 0 ? (
                  <div className="text-center text-gray-400 py-12">
                    <MegaphoneIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
                    <h3 className="text-lg font-semibold mb-2">No Campaigns Yet</h3>
                    <p className="text-sm">Approved campaigns will appear here</p>
                  </div>
                ) : (
                  campaigns.map((campaign) => (
                    <div key={campaign.id} className="bg-[#2A2A2A] border border-gray-700 rounded-lg p-4 hover:border-purple-500/50 transition-colors">
                      {/* Campaign Header */}
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex-1">
                          <h3 className="text-white font-semibold text-lg mb-1">{campaign.campaign_name}</h3>
                          <div className="flex items-center gap-2 mb-2">
                            {getStatusBadge(campaign.status)}
                            <span className="text-xs text-gray-400">
                              Type: <span className="text-purple-400 font-medium">{campaign.ad_type}</span>
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-400">Advertiser</div>
                          <div className="text-white font-medium">{campaign.advertiser_name || 'User #' + campaign.advertiser_id}</div>
                        </div>
                      </div>

                      {/* Campaign Details */}
                      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
                        <div>
                          <span className="text-gray-500">Budget:</span>
                          <span className="text-white font-semibold ml-2">${campaign.budget || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Spent:</span>
                          <span className="text-green-400 font-semibold ml-2">${(campaign.spent_amount || 0).toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Impressions:</span>
                          <span className="text-blue-400 font-semibold ml-2">{(campaign.impressions_count || 0).toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Clicks:</span>
                          <span className="text-purple-400 font-semibold ml-2">{campaign.clicks_count || 0}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">CTR:</span>
                          <span className="text-yellow-400 font-semibold ml-2">
                            {(campaign.impressions_count || 0) > 0 
                              ? (((campaign.clicks_count || 0) / campaign.impressions_count) * 100).toFixed(2) 
                              : '0.00'}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">CPM:</span>
                          <span className="text-pink-400 font-semibold ml-2">${campaign.cpm}</span>
                        </div>
                      </div>

                      {/* Targeting Info */}
                      <div className="bg-[#1E1E1E] rounded p-3 mb-4 text-xs">
                        <div className="text-gray-500 mb-1">Targeting:</div>
                        <div className="text-gray-300">
                          Ages {campaign.age_min || 13}-{campaign.age_max || 99} • 
                          Rating: {campaign.content_rating || 'All'} • 
                          Countries: {campaign.target_countries || 'All'}
                        </div>
                      </div>

                      {/* Campaign Dates */}
                      <div className="flex items-center gap-4 mb-4 text-xs text-gray-400">
                        <div>
                          <span className="text-gray-500">Start:</span> {new Date(campaign.start_date).toLocaleDateString()}
                        </div>
                        <div>
                          <span className="text-gray-500">End:</span> {new Date(campaign.end_date).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Media Preview */}
                      {campaign.media_url && (
                        <div className="mb-4">
                          {campaign.ad_type === 'video_preroll' ? (
                            <video 
                              src={`http://localhost:8080${campaign.media_url}`}
                              className="w-full max-h-48 rounded object-cover"
                              controls
                            />
                          ) : (
                            <img 
                              src={`http://localhost:8080${campaign.media_url}`}
                              alt={campaign.campaign_name}
                              className="w-full max-h-48 rounded object-cover"
                            />
                          )}
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2 flex-wrap">
                        {campaign.status === 'pending_review' && (
                          <>
                            <button
                              onClick={() => handleCampaignStatusUpdate(campaign.id, 'active')}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✓ Approve
                            </button>
                            <button
                              onClick={() => handleCampaignStatusUpdate(campaign.id, 'rejected')}
                              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                            >
                              ✗ Reject
                            </button>
                          </>
                        )}
                        {campaign.status === 'active' && (
                          <button
                            onClick={() => handleCampaignStatusUpdate(campaign.id, 'paused')}
                            className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            ⏸ Pause
                          </button>
                        )}
                        {campaign.status === 'paused' && (
                          <button
                            onClick={() => handleCampaignStatusUpdate(campaign.id, 'active')}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                          >
                            ▶ Resume
                          </button>
                        )}
                        <a
                          href={campaign.click_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                          🔗 Visit URL
                        </a>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdsManagementModal;
