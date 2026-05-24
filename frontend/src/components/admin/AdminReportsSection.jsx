import React, { useState, useEffect } from 'react';
import apiClient from '../../services/api';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function AdminReportsSection() {
  const [reports, setReports] = useState([]);
  const [reportCounts, setReportCounts] = useState({ pending: 0, reviewed: 0, dismissed: 0 });
  const [statusFilter, setStatusFilter] = useState('pending');
  const [processingReport, setProcessingReport] = useState(null);

  const fetchReports = async (status = 'pending') => {
    try {
      const response = await apiClient.get(`/api/admin/reports?status=${status}`);
      setReports(response.data.reports || []);
      setReportCounts(response.data.counts || { pending: 0, reviewed: 0, dismissed: 0 });
    } catch {
      toast.error('Failed to load reports');
    }
  };

  useEffect(() => { fetchReports('pending'); }, []);

  const handleUpdateReport = async (reportId, status) => {
    setProcessingReport(reportId);
    try {
      await apiClient.patch(`/api/admin/reports/${reportId}`, { status });
      toast.success(status === 'reviewed' ? '✅ Report marked as reviewed' : '❌ Report dismissed');
      fetchReports(statusFilter);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update report');
    } finally { setProcessingReport(null); }
  };

  return (
    <div className="bg-gradient-to-r from-red-600/20 to-rose-600/20 backdrop-blur-lg rounded-xl p-6 border-2 border-red-500/50">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🚩 User Reports
          {reportCounts.pending > 0 && (
            <span className="ml-2 px-2.5 py-0.5 rounded-full bg-red-600 text-white text-sm font-semibold">
              {reportCounts.pending} pending
            </span>
          )}
        </h2>
        <button
          onClick={() => fetchReports(statusFilter)}
          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
        >
          <ArrowPathIcon className="w-5 h-5" />Refresh
        </button>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {['pending', 'reviewed', 'dismissed'].map(s => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); fetchReports(s); }}
            className={`px-4 py-2 rounded-lg font-medium capitalize transition-colors ${
              statusFilter === s
                ? 'bg-red-600 text-white'
                : 'bg-black/30 border border-white/20 text-gray-300 hover:bg-white/10'
            }`}
          >
            {s}
            <span className="ml-2 text-xs opacity-75">({reportCounts[s] ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/20">
              <th className="text-left py-3 px-4">Reporter</th>
              <th className="text-left py-3 px-4">Target</th>
              <th className="text-left py-3 px-4">Reason</th>
              <th className="text-left py-3 px-4">Details</th>
              <th className="text-left py-3 px-4">Date</th>
              {statusFilter === 'pending' && <th className="text-left py-3 px-4">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 ? (
              <tr>
                <td colSpan={statusFilter === 'pending' ? 6 : 5} className="text-center py-8 text-gray-400">
                  No {statusFilter} reports
                </td>
              </tr>
            ) : reports.map(report => (
              <tr key={report.id} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                <td className="py-3 px-4">
                  <div className="font-medium">{report.reporter?.username || `User #${report.reporter_id}`}</div>
                  <div className="text-xs text-gray-400">{report.reporter?.email}</div>
                </td>
                <td className="py-3 px-4">
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-white/10 capitalize">
                    {report.target_type}
                  </span>
                  <span className="ml-2 text-gray-400">#{report.target_id}</span>
                </td>
                <td className="py-3 px-4">
                  <span className="capitalize text-yellow-300">{report.reason?.replace(/_/g, ' ')}</span>
                </td>
                <td className="py-3 px-4 max-w-xs">
                  <p className="text-gray-300 text-xs truncate" title={report.description}>
                    {report.description || <span className="text-gray-500 italic">No details</span>}
                  </p>
                </td>
                <td className="py-3 px-4 text-gray-400 text-xs whitespace-nowrap">
                  {new Date(report.created_at).toLocaleDateString()}
                </td>
                {statusFilter === 'pending' && (
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateReport(report.id, 'reviewed')}
                        disabled={processingReport === report.id}
                        className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium flex items-center gap-1"
                      >
                        <CheckCircleIcon className="h-4 w-4" />Reviewed
                      </button>
                      <button
                        onClick={() => handleUpdateReport(report.id, 'dismissed')}
                        disabled={processingReport === report.id}
                        className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium flex items-center gap-1"
                      >
                        <XCircleIcon className="h-4 w-4" />Dismiss
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
