// frontend/src/components/payment/DonateTokenToMember.jsx
import { useState, useEffect, useRef } from 'react';
import apiClient from '../../services/api';
import Confetti from 'react-confetti';
import { FaTimes, FaGift, FaUser, FaCoins } from 'react-icons/fa';
import { useAuth } from '../../contexts/AuthContext';

const DonateTokenToMember = ({ isOpen, onClose, onDonationSuccess }) => {
  const { currentUser, loading: authLoading } = useAuth();
  const [roomMembers, setRoomMembers] = useState([]);
  const [selectedMember, setSelectedMember] = useState(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [windowDimensions, setWindowDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });
  const giftAudioRef = useRef(null);

  const PRESET_AMOUNTS = [10, 25, 50, 100];
  const TOKEN_VALUE_NGN = 122; // Token withdrawal rate (host can withdraw at ₦122 per token)

  // Initialize audio
  useEffect(() => {
    giftAudioRef.current = new Audio('/sounds/gift.mp3');
    giftAudioRef.current.volume = 0.5;
  }, []);

  // Update window dimensions for confetti
  useEffect(() => {
    const handleResize = () => {
      setWindowDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Fetch all room members the user shares rooms with
  useEffect(() => {
    console.log('🔍 [DonateModal] useEffect triggered - isOpen:', isOpen, 'currentUser:', currentUser, 'authLoading:', authLoading);
    if (isOpen && currentUser && !authLoading) {
      console.log('✅ [DonateModal] Calling fetchRoomMembers...');
      fetchRoomMembers();
    } else {
      console.log('⏸️ [DonateModal] Not fetching - waiting for conditions');
    }
  }, [isOpen, currentUser, authLoading]);

  const fetchRoomMembers = async () => {
    try {
      // Fetch all rooms the user is a member of
      const roomsResponse = await apiClient.get('/api/rooms');

      console.log('📥 Rooms response:', roomsResponse.data);

      // Collect all unique members from all rooms
      const memberMap = new Map();
      
      for (const room of roomsResponse.data.rooms || []) {
        console.log(`📥 Fetching members for room ${room.id}: ${room.name}`);
        // Fetch members for each room
        const membersResponse = await apiClient.get(`/api/rooms/${room.id}/members`);

        console.log(`👥 Room ${room.id} members:`, membersResponse.data.members);

        (membersResponse.data.members || []).forEach(member => {
          // Exclude current user and demo users (ensure number comparison)
          const memberId = typeof member.id === 'string' ? parseInt(member.id) : member.id;
          const currentUserId = typeof currentUser?.id === 'string' ? parseInt(currentUser.id) : currentUser?.id;
          
          if (memberId !== currentUserId && !member.is_demo) {
            memberMap.set(member.id, {
              id: member.id,
              username: member.username,
              avatar_url: member.avatar_url || '/default-avatar.png',
              email: member.email
            });
          }
        });
      }

      const uniqueMembers = Array.from(memberMap.values());
      console.log('✅ Unique members found:', uniqueMembers);
      setRoomMembers(uniqueMembers);
      setError(''); // Clear any previous errors on successful fetch

      if (uniqueMembers.length === 0) {
        setError('No other members found in your rooms. Join a room with other users to send gifts!');
      }
    } catch (err) {
      console.error('❌ Error fetching room members:', err);
      setError('Failed to load room members. Please try again.');
      setRoomMembers([]); // Clear members on error
    }
  };

  const handleDonate = async () => {
    if (!selectedMember) {
      setError('Please select a member to donate to');
      return;
    }

    const donationAmount = parseInt(amount);
    if (!donationAmount || donationAmount < 1) {
      setError('Please enter a valid amount (minimum 1 token)');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Convert tokens to cents for backend (1 token = 100 cents)
      const amountInCents = Math.floor(donationAmount * 100);
      
      const response = await apiClient.post('/api/donations/gift', {
        recipient_id: selectedMember.id,
        amount_tokens: amountInCents
      });

      // Play gift sound
      if (giftAudioRef.current) {
        giftAudioRef.current.currentTime = 0;
        giftAudioRef.current.play().catch(e => console.log('Audio play failed:', e));
      }

      // Show confetti
      setShowConfetti(true);
      setSuccess(true);

      // Hide confetti after 5 seconds
      setTimeout(() => {
        setShowConfetti(false);
      }, 5000);

      // Call success callback with updated balance
      if (onDonationSuccess) {
        onDonationSuccess(response.data.donor_balance);
      }

      // Reset form after delay
      setTimeout(() => {
        setSelectedMember(null);
        setAmount('');
        setSuccess(false);
        onClose();
      }, 3000);

    } catch (err) {
      console.error('Error sending gift:', err);
      console.error('Error response:', err.response?.data);
      console.error('Error status:', err.response?.status);
      const errorMsg = err.response?.data?.error || err.response?.data?.message || 'Failed to send gift';
      if (err.response?.status === 401) {
        setError('Authentication required. Please refresh the page and try again.');
      } else {
        setError(errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (presetAmount) => {
    setAmount(presetAmount.toString());
  };

  const formatTokens = (tokens) => {
    return (tokens / 100).toFixed(2);
  };

  if (!isOpen) return null;

  return (
    <>
      {showConfetti && (
        <Confetti
          width={windowDimensions.width}
          height={windowDimensions.height}
          numberOfPieces={500}
          recycle={false}
          gravity={0.3}
        />
      )}

      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-4 flex justify-between items-center rounded-t-lg">
            <div className="flex items-center gap-3">
              <FaGift className="text-2xl" />
              <h2 className="text-xl font-bold">Donate Tokens</h2>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-200 transition-colors"
            >
              <FaTimes className="text-xl" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {success ? (
              <div className="text-center py-8">
                <div className="text-6xl mb-4">🎉</div>
                <h3 className="text-2xl font-bold text-green-600 mb-2">Gift Sent!</h3>
                <p className="text-gray-600">
                  You donated {formatTokens(parseInt(amount))} tokens to {selectedMember?.username}
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  (≈ ₦{(parseInt(amount) * TOKEN_VALUE_NGN).toFixed(2)} NGN value)
                </p>
              </div>
            ) : (
              <>
                {/* Error Message */}
                {error && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                    {error}
                  </div>
                )}

                {/* Member Selection */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Select Member
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                    {roomMembers.map((member) => (
                      <button
                        key={member.id}
                        onClick={() => setSelectedMember(member)}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-all ${
                          selectedMember?.id === member.id
                            ? 'border-purple-500 bg-purple-50'
                            : 'border-gray-200 hover:border-purple-300'
                        }`}
                      >
                        <img
                          src={member.avatar_url}
                          alt={member.username}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/avatars/default.png';
                          }}
                          className="w-12 h-12 rounded-full object-cover bg-gray-200"
                        />
                        <div className="flex-1 text-left">
                          <p className="font-semibold text-gray-900">{member.username}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                        {selectedMember?.id === member.id && (
                          <div className="text-purple-500">✓</div>
                        )}
                      </button>
                    ))}
                  </div>
                  {roomMembers.length === 0 && !error && (
                    <p className="text-center text-gray-500 py-4">Loading members...</p>
                  )}
                </div>

                {/* Amount Selection */}
                {selectedMember && (
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Select Amount
                    </label>
                    
                    {/* Preset Amounts */}
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {PRESET_AMOUNTS.map((preset) => (
                        <button
                          key={preset}
                          onClick={() => handlePresetClick(preset)}
                          className={`py-3 px-4 rounded-lg border-2 font-semibold transition-all ${
                            amount === preset.toString()
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-gray-300 hover:border-purple-300 text-gray-700'
                          }`}
                        >
                          <div className="text-lg">{preset}</div>
                          <div className="text-xs text-gray-500">tokens</div>
                        </button>
                      ))}
                    </div>

                    {/* Custom Amount Input */}
                    <div className="relative">
                      <FaCoins className="absolute left-3 top-1/2 transform -translate-y-1/2 text-yellow-500" />
                      <input
                        type="number"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="Custom amount"
                        min="1"
                        className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none"
                      />
                    </div>

                    {/* NGN Equivalent */}
                    {amount && parseInt(amount) > 0 && (
                      <p className="text-sm text-gray-600 mt-2 text-center">
                        ≈ ₦{(parseInt(amount) * TOKEN_VALUE_NGN).toFixed(2)} NGN value
                        <span className="text-xs text-gray-500 ml-2">
                          (Recipient gets 95%, 5% platform fee)
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                    disabled={loading}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDonate}
                    disabled={!selectedMember || !amount || parseInt(amount) < 1 || loading}
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg hover:from-purple-700 hover:to-pink-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-semibold"
                  >
                    {loading ? 'Sending...' : 'Send Gift 🎁'}
                  </button>
                </div>

                {/* Info Text */}
                <p className="text-xs text-gray-500 text-center mt-4">
                  Recipient receives 95% of tokens. 5% platform fee applies.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default DonateTokenToMember;
