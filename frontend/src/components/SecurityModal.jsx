// frontend/src/components/SecurityModal.jsx
import React, { useState, useEffect } from 'react';
import {
  XMarkIcon,
  ShieldCheckIcon,
  KeyIcon,
  QrCodeIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClipboardDocumentIcon,
  CheckIcon
} from '@heroicons/react/24/outline';
import axios from 'axios';

const SecurityModal = ({ isOpen, onClose, currentUser }) => {
  const [activeTab, setActiveTab] = useState('2fa'); // '2fa' or 'password'
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // 2FA Setup State
  const [setup2FAStep, setSetup2FAStep] = useState(null); // null, 'scan', 'verify'
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [totpCode, setTotpCode] = useState('');
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (isOpen && currentUser) {
      setTwoFactorEnabled(currentUser.two_factor_enabled || false);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

  // === 2FA Functions ===
  const handleSetup2FA = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await axios.post(
        `${apiUrl}/api/auth/setup-2fa`,
        { password: currentPassword },
        { withCredentials: true }
      );

      setQrCodeUrl(response.data.qr_code_url);
      setSecret(response.data.secret);
      setBackupCodes(response.data.backup_codes);
      setSetup2FAStep('scan');
      setCurrentPassword('');
      setSuccess('QR code generated! Scan with Google Authenticator.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to setup 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async () => {
    if (totpCode.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    setLoading(true);
    setError('');
    try {
      await axios.post(
        `${apiUrl}/api/auth/verify-2fa-setup`,
        { code: totpCode },
        { withCredentials: true }
      );

      setTwoFactorEnabled(true);
      setSuccess('2FA enabled successfully! 🎉');
      setSetup2FAStep(null);
      setTotpCode('');
      
      // Update current user in parent component
      if (currentUser) {
        currentUser.two_factor_enabled = true;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (!window.confirm('Are you sure you want to disable 2FA? This will reduce your account security.')) {
      return;
    }

    setLoading(true);
    setError('');
    try {
      await axios.post(
        `${apiUrl}/api/auth/disable-2fa`,
        { password: currentPassword, code: totpCode },
        { withCredentials: true }
      );

      setTwoFactorEnabled(false);
      setSuccess('2FA disabled successfully');
      setCurrentPassword('');
      setTotpCode('');
      
      // Update current user
      if (currentUser) {
        currentUser.two_factor_enabled = false;
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disable 2FA');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    try {
      await axios.post(
        `${apiUrl}/api/auth/change-password`,
        {
          current_password: currentPassword,
          new_password: newPassword
        },
        { withCredentials: true }
      );

      setSuccess('Password changed successfully! 🎉');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const copyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  const generateQRCodeImage = (url) => {
    // Use an external QR code generator API
    return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(url)}`;
  };

  return (
    <>
      {/* Overlay */}
      <div 
        className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        {/* Modal */}
        <div 
          className="bg-[#2B2B2B] rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-sleek-scrollbar"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-[#2B2B2B] border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <ShieldCheckIcon className="h-6 w-6 text-purple-500" />
              <h2 className="text-xl font-bold text-white">Security Settings</h2>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('2fa')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === '2fa'
                  ? 'text-purple-500 border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <QrCodeIcon className="h-5 w-5" />
                Two-Factor Authentication
              </div>
            </button>
            <button
              onClick={() => setActiveTab('password')}
              className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                activeTab === 'password'
                  ? 'text-purple-500 border-b-2 border-purple-500'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <KeyIcon className="h-5 w-5" />
                Change Password
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {/* Error/Success Messages */}
            {error && (
              <div className="mb-4 p-4 bg-red-500/10 border border-red-500 rounded-lg flex items-center gap-2 text-red-400">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}
            {success && (
              <div className="mb-4 p-4 bg-green-500/10 border border-green-500 rounded-lg flex items-center gap-2 text-green-400">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                <span className="text-sm">{success}</span>
              </div>
            )}

            {/* 2FA Tab */}
            {activeTab === '2fa' && (
              <div className="space-y-6">
                {/* Current Status */}
                <div className="bg-gray-800/50 rounded-lg p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <ShieldCheckIcon className={`h-8 w-8 ${twoFactorEnabled ? 'text-green-500' : 'text-gray-500'}`} />
                    <div>
                      <p className="text-white font-medium">Two-Factor Authentication</p>
                      <p className="text-sm text-gray-400">
                        {twoFactorEnabled ? 'Enabled - Your account is protected' : 'Disabled - Enable for better security'}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    twoFactorEnabled 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {twoFactorEnabled ? 'ACTIVE' : 'INACTIVE'}
                  </span>
                </div>

                {/* Enable 2FA Flow */}
                {!twoFactorEnabled && !setup2FAStep && (
                  <div className="space-y-4">
                    <div className="text-gray-300 text-sm space-y-2">
                      <p>🔐 Protect your account with Two-Factor Authentication:</p>
                      <ul className="list-disc list-inside space-y-1 text-gray-400 ml-2">
                        <li>Adds an extra layer of security</li>
                        <li>Requires your phone to login</li>
                        <li>Prevents unauthorized access even if password is stolen</li>
                      </ul>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Enter your password to continue:
                      </label>
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    <button
                      onClick={handleSetup2FA}
                      disabled={!currentPassword || loading}
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:cursor-not-allowed"
                    >
                      {loading ? 'Setting up...' : 'Enable 2FA'}
                    </button>
                  </div>
                )}

                {/* Scan QR Code Step */}
                {setup2FAStep === 'scan' && (
                  <div className="space-y-4">
                    <div className="bg-gray-800/50 rounded-lg p-6">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">1</span>
                        Scan QR Code with Google Authenticator
                      </h3>
                      
                      <div className="flex flex-col items-center space-y-4">
                        {/* QR Code */}
                        <div className="bg-white p-4 rounded-lg">
                          <img 
                            src={generateQRCodeImage(qrCodeUrl)} 
                            alt="2FA QR Code"
                            className="w-64 h-64"
                          />
                        </div>

                        {/* Manual Entry Option */}
                        <div className="w-full">
                          <p className="text-sm text-gray-400 text-center mb-2">Can't scan? Enter this key manually:</p>
                          <div className="bg-gray-800 p-3 rounded-lg flex items-center justify-between">
                            <code className="text-purple-400 text-sm font-mono">{secret}</code>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(secret);
                                setSuccess('Secret key copied!');
                                setTimeout(() => setSuccess(''), 2000);
                              }}
                              className="text-gray-400 hover:text-white transition-colors"
                            >
                              <ClipboardDocumentIcon className="h-5 w-5" />
                            </button>
                          </div>
                        </div>

                        {/* Backup Codes */}
                        <div className="w-full bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-yellow-400 font-semibold text-sm">⚠️ Save Your Backup Codes</p>
                            <button
                              onClick={copyBackupCodes}
                              className="flex items-center gap-1 px-2 py-1 bg-yellow-500/20 hover:bg-yellow-500/30 rounded text-yellow-400 text-xs transition-colors"
                            >
                              {copiedCodes ? (
                                <>
                                  <CheckIcon className="h-4 w-4" />
                                  Copied!
                                </>
                              ) : (
                                <>
                                  <ClipboardDocumentIcon className="h-4 w-4" />
                                  Copy All
                                </>
                              )}
                            </button>
                          </div>
                          <p className="text-xs text-yellow-300/80 mb-2">Use these if you lose access to your authenticator app (one-time use only):</p>
                          <div className="grid grid-cols-2 gap-2 text-xs font-mono text-yellow-200">
                            {backupCodes.map((code, idx) => (
                              <div key={idx} className="bg-gray-800/50 px-2 py-1 rounded">
                                {code}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSetup2FAStep('verify')}
                      className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition-all"
                    >
                      Next: Verify Code
                    </button>
                  </div>
                )}

                {/* Verify Code Step */}
                {setup2FAStep === 'verify' && (
                  <div className="space-y-4">
                    <div className="bg-gray-800/50 rounded-lg p-6">
                      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                        <span className="bg-purple-500 text-white w-6 h-6 rounded-full flex items-center justify-center text-sm">2</span>
                        Enter 6-Digit Code
                      </h3>
                      
                      <p className="text-gray-400 text-sm mb-4">
                        Open Google Authenticator and enter the 6-digit code for WeWatch:
                      </p>

                      <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="000000"
                        maxLength={6}
                        className="w-full px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-center text-2xl font-mono tracking-widest placeholder-gray-600 focus:outline-none focus:border-purple-500"
                      />

                      <p className="text-xs text-gray-500 mt-2 text-center">
                        Code changes every 30 seconds
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={() => setSetup2FAStep('scan')}
                        className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-semibold py-3 px-4 rounded-lg transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleVerify2FA}
                        disabled={totpCode.length !== 6 || loading}
                        className="flex-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:cursor-not-allowed"
                      >
                        {loading ? 'Verifying...' : 'Enable 2FA'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Disable 2FA */}
                {twoFactorEnabled && (
                  <div className="space-y-4 border-t border-gray-700 pt-6">
                    <h3 className="text-white font-semibold">Disable Two-Factor Authentication</h3>
                    <p className="text-sm text-gray-400">
                      ⚠️ Disabling 2FA will reduce your account security. You'll need to enter your password and current 2FA code.
                    </p>

                    <div className="space-y-3">
                      <input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
                      />
                      <input
                        type="text"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="6-digit code from authenticator"
                        maxLength={6}
                        className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-center font-mono tracking-widest placeholder-gray-500 focus:outline-none focus:border-red-500"
                      />
                    </div>

                    <button
                      onClick={handleDisable2FA}
                      disabled={!currentPassword || totpCode.length !== 6 || loading}
                      className="w-full bg-red-600 hover:bg-red-700 disabled:bg-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:cursor-not-allowed"
                    >
                      {loading ? 'Disabling...' : 'Disable 2FA'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Password Tab */}
            {activeTab === 'password' && (
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="text-gray-300 text-sm mb-4">
                  <p>🔑 Change your account password</p>
                  <p className="text-gray-400 text-xs mt-1">Password must be at least 8 characters</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    required
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    New Password
                  </label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    required
                    minLength={8}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={!currentPassword || !newPassword || !confirmPassword || loading}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white font-semibold py-3 px-4 rounded-lg transition-all disabled:cursor-not-allowed"
                >
                  {loading ? 'Changing Password...' : 'Change Password'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SecurityModal;
