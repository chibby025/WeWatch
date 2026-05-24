import React, { useState, useEffect } from 'react';
import { getAdminKYCs, approveKYC, rejectKYC } from '../../services/api';
import { ArrowPathIcon, CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

export default function AdminKYCSection() {
  const [kycSubmissions, setKycSubmissions] = useState([]);
  const [kycStatusFilter, setKycStatusFilter] = useState('pending');
  const [kycSearchTerm, setKycSearchTerm] = useState('');
  const [processingKYC, setProcessingKYC] = useState(null);
  const [selectedKYCDoc, setSelectedKYCDoc] = useState(null);
  const [showDocViewer, setShowDocViewer] = useState(false);

  const fetchKYCs = async (status = 'pending') => {
    try {
      const response = await getAdminKYCs(status);
      setKycSubmissions(response.kyc_submissions || []);
    } catch {
      toast.error('Failed to load KYC submissions');
    }
  };

  useEffect(() => { fetchKYCs('pending'); }, []);

  const handleApproveKYC = async (kycId) => {
    if (!window.confirm('Approve this KYC submission? User will be verified.')) return;
    setProcessingKYC(kycId);
    try {
      await approveKYC(kycId);
      toast.success('✅ KYC approved successfully!');
      fetchKYCs(kycStatusFilter);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve KYC');
    } finally { setProcessingKYC(null); }
  };

  const handleRejectKYC = async (kycId) => {
    const reason = window.prompt('Enter rejection reason:');
    if (!reason) return;
    setProcessingKYC(kycId);
    try {
      await rejectKYC(kycId, reason);
      toast.success('❌ KYC rejected');
      fetchKYCs(kycStatusFilter);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reject KYC');
    } finally { setProcessingKYC(null); }
  };

  const filteredKYCs = kycSubmissions.filter(kyc => {
    if (!kycSearchTerm) return true;
    const s = kycSearchTerm.toLowerCase();
    return (
      kyc.user?.username?.toLowerCase().includes(s) ||
      kyc.user?.email?.toLowerCase().includes(s) ||
      kyc.full_name?.toLowerCase().includes(s)
    );
  });

  const docUrl = (kyc, type) =>
    type === 'front' ? kyc.id_front_url : type === 'back' ? kyc.id_back_url : kyc.selfie_url;

  return (
    <>
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={kycStatusFilter}
              onChange={(e) => { setKycStatusFilter(e.target.value); fetchKYCs(e.target.value); }}
              className="w-full px-3 py-2 bg-black/30 border border-white/20 rounded-lg text-white"
            >
              <option value="all">All</option>
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

        {/* Table */}
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
                    {kycSearchTerm ? 'No matching submissions' : `No ${kycStatusFilter} KYC submissions`}
                  </td>
                </tr>
              ) : filteredKYCs.map((kyc) => (
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
                        <button onClick={() => { setSelectedKYCDoc({ kyc, docType: 'front' }); setShowDocViewer(true); }}
                          className="text-xs text-blue-400 hover:text-blue-300 underline text-left">
                          📄 ID Front
                        </button>
                      )}
                      {kyc.id_back_url && (
                        <button onClick={() => { setSelectedKYCDoc({ kyc, docType: 'back' }); setShowDocViewer(true); }}
                          className="text-xs text-blue-400 hover:text-blue-300 underline text-left">
                          📄 ID Back
                        </button>
                      )}
                      {kyc.selfie_url && (
                        <button onClick={() => { setSelectedKYCDoc({ kyc, docType: 'selfie' }); setShowDocViewer(true); }}
                          className="text-xs text-green-400 hover:text-green-300 underline text-left">
                          🤳 Selfie
                        </button>
                      )}
                      {kyc.id_front_url && (
                        <a href={kyc.id_front_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-gray-400 hover:text-gray-300">↗ Open Front</a>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="text-xs">
                      {new Date(kyc.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(kyc.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${
                      kyc.status === 'approved' ? 'bg-green-600/30 text-green-300' :
                      kyc.status === 'rejected' ? 'bg-red-600/30 text-red-300' :
                      'bg-yellow-600/30 text-yellow-300'
                    }`}>
                      {kyc.status}
                    </span>
                    {kyc.rejection_reason && (
                      <div className="text-xs text-red-300 mt-1" title={kyc.rejection_reason}>
                        {kyc.rejection_reason.substring(0, 30)}…
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {kyc.status === 'pending' ? (
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleApproveKYC(kyc.id)} disabled={processingKYC === kyc.id}
                          className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                          {processingKYC === kyc.id
                            ? <><ArrowPathIcon className="h-4 w-4 animate-spin" />Processing...</>
                            : <><CheckCircleIcon className="h-4 w-4" />Approve</>}
                        </button>
                        <button onClick={() => handleRejectKYC(kyc.id)} disabled={processingKYC === kyc.id}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-semibold disabled:opacity-50 flex items-center gap-1">
                          <XCircleIcon className="h-4 w-4" />Reject
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400">
                        {kyc.status === 'approved' ? '✅ Verified' : '❌ Rejected'}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-6 bg-blue-900/30 border border-blue-500/30 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-300 mb-2">📝 KYC Verification Guidelines:</h3>
          <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
            <li>Verify ID document matches the user's full name and date of birth</li>
            <li>Check that the selfie photo matches the ID photo</li>
            <li>Ensure all documents are clear, readable, and not expired</li>
            <li>KYC verification is required for payouts exceeding ₦5,000</li>
            <li>Rejected submissions can be resubmitted by the user</li>
          </ul>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {showDocViewer && selectedKYCDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={() => setShowDocViewer(false)}
        >
          <div
            className="bg-gray-900 rounded-xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-xl font-bold text-white">
                  {selectedKYCDoc.docType === 'front' ? '📄 ID Front' :
                   selectedKYCDoc.docType === 'back' ? '📄 ID Back' : '🤳 Selfie Photo'}
                </h3>
                <p className="text-sm text-gray-400">
                  User: {selectedKYCDoc.kyc.user?.username} ({selectedKYCDoc.kyc.full_name})
                </p>
              </div>
              <button onClick={() => setShowDocViewer(false)} className="text-white hover:text-gray-300">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
            <div className="bg-black rounded-lg p-4 flex items-center justify-center">
              <img
                src={docUrl(selectedKYCDoc.kyc, selectedKYCDoc.docType)}
                alt={`${selectedKYCDoc.docType} document`}
                className="max-w-full max-h-[70vh] object-contain cursor-zoom-in"
                onClick={(e) => {
                  e.target.style.transform = e.target.style.transform === 'scale(2)' ? 'scale(1)' : 'scale(2)';
                  e.target.style.cursor = e.target.style.transform === 'scale(2)' ? 'zoom-out' : 'zoom-in';
                }}
              />
            </div>
            <div className="mt-4 flex gap-3">
              <a
                href={docUrl(selectedKYCDoc.kyc, selectedKYCDoc.docType)}
                target="_blank" rel="noopener noreferrer"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold"
              >
                ↗ Open in New Tab
              </a>
              {selectedKYCDoc.kyc.status === 'pending' && (
                <>
                  <button
                    onClick={() => { setShowDocViewer(false); handleApproveKYC(selectedKYCDoc.kyc.id); }}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                  >
                    <CheckCircleIcon className="h-5 w-5" />Approve KYC
                  </button>
                  <button
                    onClick={() => { setShowDocViewer(false); handleRejectKYC(selectedKYCDoc.kyc.id); }}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-2"
                  >
                    <XCircleIcon className="h-5 w-5" />Reject KYC
                  </button>
                </>
              )}
              <button onClick={() => setShowDocViewer(false)}
                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
