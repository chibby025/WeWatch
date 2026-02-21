import React, { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import apiClient from '../services/api';
import toast from 'react-hot-toast';

const PollMessage = ({ poll, currentUserId, roomId }) => {
  const [votes, setVotes] = useState(poll.votes || []);
  const [userVotes, setUserVotes] = useState([]);
  const [isVoting, setIsVoting] = useState(false);

  useEffect(() => {
    // Extract user's current votes
    const myVotes = votes
      .filter(v => v.user_id === currentUserId)
      .map(v => v.option_index);
    setUserVotes(myVotes);
  }, [votes, currentUserId]);

  const totalVotes = votes.length;
  
  // Calculate vote counts per option
  const optionVotes = poll.options.map((_, index) => {
    return votes.filter(v => v.option_index === index).length;
  });

  const handleVote = async (optionIndex) => {
    if (isVoting) return;

    setIsVoting(true);
    try {
      // Check if already voted for this option
      const alreadyVoted = userVotes.includes(optionIndex);

      if (alreadyVoted) {
        // Remove vote
        await apiClient.delete(`/api/rooms/${roomId}/polls/${poll.id}/vote`, {
          data: { option_index: optionIndex }
        });
        setUserVotes(userVotes.filter(v => v !== optionIndex));
        setVotes(votes.filter(v => !(v.user_id === currentUserId && v.option_index === optionIndex)));
      } else {
        // Add vote
        if (!poll.allow_multiple && userVotes.length > 0) {
          // Remove previous vote if single choice
          await apiClient.delete(`/api/rooms/${roomId}/polls/${poll.id}/vote`, {
            data: { option_index: userVotes[0] }
          });
          setVotes(votes.filter(v => v.user_id !== currentUserId));
          setUserVotes([]);
        }

        const response = await apiClient.post(`/api/rooms/${roomId}/polls/${poll.id}/vote`, {
          option_index: optionIndex
        });
        
        setUserVotes(poll.allow_multiple ? [...userVotes, optionIndex] : [optionIndex]);
        setVotes([...votes.filter(v => poll.allow_multiple || v.user_id !== currentUserId), response.data.vote]);
      }
    } catch (error) {
      console.error('Failed to vote:', error);
      toast.error('Failed to submit vote');
    } finally {
      setIsVoting(false);
    }
  };

  return (
    <div className="bg-gray-700 rounded-lg p-4 space-y-3 min-w-[280px] max-w-md">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <span className="text-orange-400 text-xs font-semibold uppercase tracking-wide">Poll</span>
            <p className="text-xs text-gray-400">
              {poll.created_by_username} • {new Date(poll.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </p>
          </div>
        </div>
        
        {poll.is_closed && (
          <span className="bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded">Closed</span>
        )}
      </div>

      {/* Question */}
      <h3 className="text-white font-medium text-base leading-snug">{poll.question}</h3>

      {/* Options */}
      <div className="space-y-2">
        {poll.options.map((option, index) => {
          const voteCount = optionVotes[index];
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const isSelected = userVotes.includes(index);

          return (
            <button
              key={index}
              onClick={() => !poll.is_closed && handleVote(index)}
              disabled={poll.is_closed || isVoting}
              className={`w-full text-left rounded-lg transition-all duration-200 relative overflow-hidden ${
                poll.is_closed
                  ? 'cursor-not-allowed opacity-75'
                  : 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
              } ${
                isSelected
                  ? 'ring-2 ring-blue-500'
                  : 'ring-1 ring-gray-600 hover:ring-gray-500'
              }`}
            >
              {/* Progress bar background */}
              <div
                className={`absolute inset-0 transition-all duration-500 ${
                  isSelected ? 'bg-blue-600 bg-opacity-30' : 'bg-gray-600 bg-opacity-30'
                }`}
                style={{ width: `${percentage}%` }}
              />

              {/* Content */}
              <div className="relative px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {/* Checkbox */}
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isSelected
                        ? 'bg-blue-500 border-blue-500'
                        : 'border-gray-400'
                    }`}
                  >
                    {isSelected && <CheckIcon className="w-4 h-4 text-white" />}
                  </div>
                  
                  {/* Option text */}
                  <span className="text-white text-sm font-medium truncate">{option}</span>
                </div>

                {/* Vote count and percentage */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-gray-300 font-medium">{percentage}%</span>
                  <span className="text-xs text-gray-400">({voteCount})</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-2 border-t border-gray-600">
        <span>
          {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
          {poll.allow_multiple && ' • Multiple choice'}
        </span>
        {!poll.is_closed && userVotes.length > 0 && (
          <span className="text-blue-400">✓ You voted</span>
        )}
      </div>
    </div>
  );
};

export default PollMessage;
