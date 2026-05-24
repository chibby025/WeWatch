import React, { useState, useEffect } from 'react';
import apiClient from '../../services/api';
import { ArrowDownTrayIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function AdminAuditSection() {
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditFilter, setAuditFilter] = useState({ action: '', admin_id: '', start_date: '', end_date: '' });

  const fetchAuditLogs = async (page = 1, filters = {}) => {
    try {
      const params = new URLSearchParams({ page, limit: 20, ...filters });
      const response = await apiClient.get(`/api/admin/audit-logs?${params}`);
      setAuditLogs(response.data.logs || []);
      setAuditTotal(response.data.total || 0);
      setAuditPage(page);
    } catch {
      toast.error('Failed to load audit logs');
    }
  };

  useEffect(() => { fetchAuditLogs(); }, []);

  const exportAuditLogsToCSV = async () => {
    try {
      toast.loading('Exporting audit logs...');
      const params = new URLSearchParams({ page: 1, limit: 1000, ...auditFilter });
      const response = await apiClient.get(`/api/admin/audit-logs?${params}`);
      const logs = response.data.logs || [];

      if (logs.length === 0) {
        toast.dismiss();
        toast.error('No audit logs to export');
        return;
      }

      const headers = ['ID', 'Date', 'Admin', 'Action', 'Target Type', 'Target ID', 'IP Address', 'Success', 'Details'];
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

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

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
    } catch {
      toast.dismiss();
      toast.error('Failed to export audit logs');
    }
  };

  const updateFilter = (key, value) => {
    const next = { ...auditFilter, [key]: value };
    setAuditFilter(next);
    fetchAuditLogs(1, next);
  };

  const totalPages = Math.ceil(auditTotal / 20);

  return (
    <div className="bg-gradient-to-r from-amber-600/20 to-orange-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-amber-500/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">🔒 Admin Audit Logs</h2>
        <button
          onClick={exportAuditLogsToCSV}
          className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors"
        >
          <ArrowDownTrayIcon className="w-5 h-5" />Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-2">Action</label>
          <select
            value={auditFilter.action}
            onChange={(e) => updateFilter('action', e.target.value)}
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
            onChange={(e) => updateFilter('start_date', e.target.value)}
            className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">End Date</label>
          <input
            type="date"
            value={auditFilter.end_date}
            onChange={(e) => updateFilter('end_date', e.target.value)}
            className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => {
              const cleared = { action: '', admin_id: '', start_date: '', end_date: '' };
              setAuditFilter(cleared);
              fetchAuditLogs(1, {});
            }}
            className="w-full px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded-lg transition-colors"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Table */}
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
                <td colSpan="7" className="py-8 text-center text-gray-400">No audit logs found</td>
              </tr>
            ) : auditLogs.map((log) => (
              <tr key={log.id} className="border-b border-white/10 hover:bg-white/5">
                <td className="py-3 px-4">
                  <div className="text-xs">
                    {new Date(log.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    <br />
                    {new Date(log.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </td>
                <td className="py-3 px-4 font-semibold">{log.admin?.username || log.admin_id}</td>
                <td className="py-3 px-4">
                  <span className="px-2 py-1 bg-blue-600/30 rounded text-xs">{log.action}</span>
                </td>
                <td className="py-3 px-4 text-gray-300">
                  {log.target_type || 'N/A'} #{log.target_id || 'N/A'}
                </td>
                <td className="py-3 px-4 text-xs text-gray-400">{log.ip_address || 'N/A'}</td>
                <td className="py-3 px-4 text-center">
                  {log.success
                    ? <CheckCircleIcon className="w-5 h-5 text-green-400 inline-block" />
                    : <XCircleIcon className="w-5 h-5 text-red-400 inline-block" />
                  }
                </td>
                <td className="py-3 px-4 text-xs text-gray-400 max-w-xs truncate">
                  {log.details || 'N/A'}
                  {log.error_msg && (
                    <span className="block text-red-400 mt-1">Error: {log.error_msg}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {auditTotal > 20 && (
        <div className="mt-6 flex items-center justify-between">
          <div className="text-sm text-gray-300">
            Showing {Math.min((auditPage - 1) * 20 + 1, auditTotal)}–{Math.min(auditPage * 20, auditTotal)} of {auditTotal} logs
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
              Page {auditPage} of {totalPages}
            </span>
            <button
              onClick={() => fetchAuditLogs(auditPage + 1, auditFilter)}
              disabled={auditPage >= totalPages}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
