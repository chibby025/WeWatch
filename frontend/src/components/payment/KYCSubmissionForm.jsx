/**
 * KYC Submission Form
 * Submit identity verification documents for withdrawal approval
 */

import React, { useState, useRef } from 'react';
import { usePayment } from '../../contexts/PaymentContext';
import { submitKYC } from '../../services/paymentApi';

const KYCSubmissionForm = () => {
  const { kycStatus, fetchKYCStatus } = usePayment();
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  const [formData, setFormData] = useState({
    full_name: '',
    date_of_birth: '',
    address: '',
    document_type: 'id_card' // 'id_card', 'passport', 'drivers_license'
  });
  
  const [frontDocument, setFrontDocument] = useState(null);
  const [backDocument, setBackDocument] = useState(null);
  const [frontPreview, setFrontPreview] = useState(null);
  const [backPreview, setBackPreview] = useState(null);
  
  const frontInputRef = useRef(null);
  const backInputRef = useRef(null);

  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  const ACCEPTED_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];

  const documentTypes = [
    { value: 'id_card', label: '🪪 National ID Card', requiresBack: true },
    { value: 'passport', label: '📘 International Passport', requiresBack: false },
    { value: 'drivers_license', label: '🚗 Driver\'s License', requiresBack: true }
  ];

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const validateFile = (file) => {
    if (!file) return 'Please select a file';
    
    if (!ACCEPTED_FORMATS.includes(file.type)) {
      return 'Invalid file format. Please upload JPG, PNG, or PDF';
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 5MB limit';
    }
    
    return null;
  };

  const handleFrontFileChange = (e) => {
    const file = e.target.files[0];
    const error = validateFile(file);
    
    if (error) {
      setError(error);
      return;
    }
    
    setFrontDocument(file);
    setError(null);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFrontPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setFrontPreview(null);
    }
  };

  const handleBackFileChange = (e) => {
    const file = e.target.files[0];
    const error = validateFile(file);
    
    if (error) {
      setError(error);
      return;
    }
    
    setBackDocument(file);
    setError(null);
    
    // Create preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setBackPreview(reader.result);
      };
      reader.readAsDataURL(file);
    } else {
      setBackPreview(null);
    }
  };

  const handleDrop = (e, type) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    
    if (type === 'front') {
      frontInputRef.current.files = e.dataTransfer.files;
      handleFrontFileChange({ target: { files: [file] } });
    } else {
      backInputRef.current.files = e.dataTransfer.files;
      handleBackFileChange({ target: { files: [file] } });
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const currentDocType = documentTypes.find(dt => dt.value === formData.document_type);
  const requiresBack = currentDocType?.requiresBack;

  const canSubmit = () => {
    if (!formData.full_name || !formData.date_of_birth || !formData.address) {
      return false;
    }
    if (!frontDocument) return false;
    if (requiresBack && !backDocument) return false;
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!canSubmit()) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const submitData = new FormData();
      submitData.append('full_name', formData.full_name);
      submitData.append('date_of_birth', formData.date_of_birth);
      submitData.append('address', formData.address);
      submitData.append('document_type', formData.document_type);
      submitData.append('document_front', frontDocument);
      
      if (requiresBack && backDocument) {
        submitData.append('document_back', backDocument);
      }

      await submitKYC(submitData);
      
      setSuccess('KYC documents submitted successfully! We\'ll review your documents within 24-48 hours.');
      
      // Refresh KYC status
      await fetchKYCStatus();
      
      // Reset form
      setFormData({
        full_name: '',
        date_of_birth: '',
        address: '',
        document_type: 'id_card'
      });
      setFrontDocument(null);
      setBackDocument(null);
      setFrontPreview(null);
      setBackPreview(null);

    } catch (err) {
      console.error('KYC submission failed:', err);
      setError(err.response?.data?.error || 'Failed to submit KYC documents');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const statusStyles = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500',
      approved: 'bg-green-500/20 text-green-400 border-green-500',
      rejected: 'bg-red-500/20 text-red-400 border-red-500'
    };
    
    const statusEmojis = {
      pending: '⏳',
      approved: '✅',
      rejected: '❌'
    };

    return (
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 font-medium ${statusStyles[status]}`}>
        <span className="text-2xl">{statusEmojis[status]}</span>
        <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">🔐 KYC Verification</h1>
        <p className="text-gray-400">Complete identity verification to enable withdrawals</p>
      </div>

      {/* Success/Error Messages */}
      {success && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-4 text-green-400">
          ✅ {success}
        </div>
      )}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 text-red-400">
          ❌ {error}
        </div>
      )}

      {/* Current Status */}
      {kycStatus && (
        <div className="bg-gray-800 rounded-xl p-6">
          <h3 className="font-bold text-white mb-3">Current Verification Status</h3>
          <div className="flex items-center justify-between">
            <div>
              {getStatusBadge(kycStatus.status)}
            </div>
            {kycStatus.submitted_at && (
              <div className="text-sm text-gray-400">
                Submitted: {new Date(kycStatus.submitted_at).toLocaleDateString()}
              </div>
            )}
          </div>
          
          {kycStatus.rejection_reason && (
            <div className="mt-4 bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <h4 className="font-bold text-red-400 mb-2">Rejection Reason:</h4>
              <p className="text-red-300 text-sm">{kycStatus.rejection_reason}</p>
              <p className="text-red-300 text-sm mt-2">Please resubmit with corrected documents.</p>
            </div>
          )}

          {kycStatus.status === 'approved' && (
            <div className="mt-4 bg-green-500/10 border border-green-500/50 rounded-lg p-4">
              <p className="text-green-300 text-sm">
                ✅ Your account is verified! You can now request withdrawals.
              </p>
            </div>
          )}

          {kycStatus.status === 'pending' && (
            <div className="mt-4 bg-yellow-500/10 border border-yellow-500/50 rounded-lg p-4">
              <p className="text-yellow-300 text-sm">
                ⏳ Your documents are being reviewed. This usually takes 24-48 hours.
              </p>
            </div>
          )}
        </div>
      )}

      {/* KYC Form */}
      {(!kycStatus || kycStatus.status === 'rejected') && (
        <form onSubmit={handleSubmit} className="bg-gray-800 rounded-xl p-6 space-y-6">
          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/50 rounded-lg p-4 text-sm text-blue-300">
            <div className="font-bold mb-2">Requirements:</div>
            <ul className="space-y-1 ml-4 list-disc">
              <li>Clear, colored photos or scans of your ID document</li>
              <li>All document details must be visible and readable</li>
              <li>File formats: JPG, PNG, or PDF</li>
              <li>Maximum file size: 5MB per file</li>
              <li>Document must be valid (not expired)</li>
            </ul>
          </div>

          {/* Personal Information */}
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Personal Information</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-gray-300 text-sm mb-2">Full Name (as on document) *</label>
                <input
                  type="text"
                  name="full_name"
                  value={formData.full_name}
                  onChange={handleInputChange}
                  placeholder="John Doe"
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-2">Date of Birth *</label>
                <input
                  type="date"
                  name="date_of_birth"
                  value={formData.date_of_birth}
                  onChange={handleInputChange}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-gray-300 text-sm mb-2">Residential Address *</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  placeholder="123 Main Street, City, State/Province, Country"
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
                  required
                />
              </div>
            </div>
          </div>

          {/* Document Type */}
          <div>
            <h3 className="text-xl font-bold text-white mb-4">Document Type</h3>
            <div className="grid grid-cols-1 gap-3">
              {documentTypes.map((docType) => (
                <label
                  key={docType.value}
                  className={`flex items-center p-4 rounded-lg cursor-pointer transition-all border-2 ${
                    formData.document_type === docType.value
                      ? 'bg-blue-600/20 border-blue-500'
                      : 'bg-gray-750 border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="document_type"
                    value={docType.value}
                    checked={formData.document_type === docType.value}
                    onChange={handleInputChange}
                    className="mr-3"
                  />
                  <span className="text-white font-medium">{docType.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Document Upload - Front */}
          <div>
            <h3 className="text-xl font-bold text-white mb-4">
              Upload Document - Front Side *
            </h3>
            
            <div
              onDrop={(e) => handleDrop(e, 'front')}
              onDragOver={handleDragOver}
              onClick={() => frontInputRef.current?.click()}
              className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-750/50 transition-all"
            >
              {frontPreview ? (
                <div className="space-y-4">
                  <img
                    src={frontPreview}
                    alt="Front preview"
                    className="max-h-64 mx-auto rounded-lg"
                  />
                  <div className="text-green-400 font-medium">✓ {frontDocument.name}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFrontDocument(null);
                      setFrontPreview(null);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ) : frontDocument ? (
                <div className="space-y-2">
                  <div className="text-4xl">📄</div>
                  <div className="text-green-400 font-medium">✓ {frontDocument.name}</div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFrontDocument(null);
                    }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl">📤</div>
                  <div className="text-white font-medium">Click or drag to upload</div>
                  <div className="text-gray-400 text-sm">JPG, PNG, or PDF (max 5MB)</div>
                </div>
              )}
            </div>
            
            <input
              ref={frontInputRef}
              type="file"
              onChange={handleFrontFileChange}
              accept=".jpg,.jpeg,.png,.pdf"
              className="hidden"
            />
          </div>

          {/* Document Upload - Back (if required) */}
          {requiresBack && (
            <div>
              <h3 className="text-xl font-bold text-white mb-4">
                Upload Document - Back Side *
              </h3>
              
              <div
                onDrop={(e) => handleDrop(e, 'back')}
                onDragOver={handleDragOver}
                onClick={() => backInputRef.current?.click()}
                className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-750/50 transition-all"
              >
                {backPreview ? (
                  <div className="space-y-4">
                    <img
                      src={backPreview}
                      alt="Back preview"
                      className="max-h-64 mx-auto rounded-lg"
                    />
                    <div className="text-green-400 font-medium">✓ {backDocument.name}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBackDocument(null);
                        setBackPreview(null);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : backDocument ? (
                  <div className="space-y-2">
                    <div className="text-4xl">📄</div>
                    <div className="text-green-400 font-medium">✓ {backDocument.name}</div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setBackDocument(null);
                      }}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-4xl">📤</div>
                    <div className="text-white font-medium">Click or drag to upload</div>
                    <div className="text-gray-400 text-sm">JPG, PNG, or PDF (max 5MB)</div>
                  </div>
                )}
              </div>
              
              <input
                ref={backInputRef}
                type="file"
                onChange={handleBackFileChange}
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
              />
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit() || loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            {loading ? 'Submitting...' : 'Submit for Verification'}
          </button>
        </form>
      )}
    </div>
  );
};

export default KYCSubmissionForm;
