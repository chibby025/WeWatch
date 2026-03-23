// WeWatch/frontend/src/components/RoomMembersModal.jsx
// Enhanced modal to display room members with shadcn components
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription,
  DialogHeader, 
  DialogTitle 
} from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { 
  Search, 
  UserPlus, 
  Crown, 
  Users,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { 
  getBatchFriendshipStatuses, 
  sendFriendRequest,
  getFriendsList
} from '../services/api';
import UserProfileModal from './UserProfileModal';

const RoomMembersModal = ({ isOpen, onClose, members, onAddMembers, loading = false, onRequestReopen }) => {
  const navigate = useNavigate();
  const { currentUser, refreshUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  
  // Profile modal state
  const [selectedMember, setSelectedMember] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [shouldReopenMembersModal, setShouldReopenMembersModal] = useState(false);
  const [friendshipsMap, setFriendshipsMap] = useState({}); // { userId: { status, is_requester } }
  const [friendshipLoading, setFriendshipLoading] = useState(false);
  const [friendsList, setFriendsList] = useState([]);
  
  // Friendship status for selected member
  const selectedFriendship = selectedMember ? friendshipsMap[selectedMember.id] : null;

  // Separate hosts and regular members
  const { hosts, regularMembers } = useMemo(() => {
    const filtered = members.filter(member => 
      member.username?.toLowerCase().includes(searchQuery.toLowerCase())
    );
    
    return {
      hosts: filtered.filter(m => m.is_host || m.user_role === 'host'),
      regularMembers: filtered.filter(m => !m.is_host && m.user_role !== 'host')
    };
  }, [members, searchQuery]);

  const totalFiltered = hosts.length + regularMembers.length;
  
  // ✅ Batch fetch friendships when modal opens
  useEffect(() => {
    if (!isOpen || !currentUser || members.length === 0) return;
    
    const fetchFriendships = async () => {
      setFriendshipLoading(true);
      try {
        // Get all member IDs except current user
        const memberIds = members
          .filter(m => m.id !== currentUser.id && m.user_id !== currentUser.id)
          .map(m => m.id || m.user_id);
        
        if (memberIds.length === 0) {
          setFriendshipLoading(false);
          return;
        }
        
        // Batch fetch friendship statuses
        const statuses = await getBatchFriendshipStatuses(memberIds);
        const statusesMap = {};
        
        // getBatchFriendshipStatuses returns { userId: { status, can_request, ... } }
        Object.entries(statuses).forEach(([userId, friendshipData]) => {
          statusesMap[Number(userId)] = {
            status: friendshipData.status || 'none',
            is_requester: friendshipData.is_requester || false
          };
        });
        
        setFriendshipsMap(statusesMap);
        
        // Also fetch friends list for messaging check
        const friendsResponse = await getFriendsList();
        setFriendsList(friendsResponse.data.friends || []);
      } catch (err) {
        console.error('Failed to fetch friendships:', err);
      } finally {
        setFriendshipLoading(false);
      }
    };
    
    fetchFriendships();
  }, [isOpen, currentUser, members]);
  
  // ✅ Handle member card click
  const handleMemberClick = (member) => {
    const memberId = member.id || member.user_id;
    const currentUserId = currentUser?.id;
    
    // If clicking own profile, open in edit mode
    if (memberId === currentUserId) {
      setSelectedMember({
        ...member,
        ...currentUser // Merge to ensure we have all user data
      });
      setShouldReopenMembersModal(true);
      onClose(); // Close RoomMembersModal first to avoid overlay conflicts
      setIsProfileModalOpen(true);
      return;
    }
    
    // Open profile for other members
    setSelectedMember(member);
    setShouldReopenMembersModal(true);
    onClose(); // Close RoomMembersModal first to avoid overlay conflicts
    setIsProfileModalOpen(true);
  };
  
  // ✅ Handle Add Friend button
  const handleAddFriend = async () => {
    if (!selectedMember) return;
    
    const memberId = selectedMember.id || selectedMember.user_id;
    const friendship = friendshipsMap[memberId];
    
    try {
      if (friendship?.status === 'pending' && friendship?.is_requester) {
        // TODO: Cancel request - needs backend endpoint
        toast('Cancel request feature coming soon', { icon: 'ℹ️' });
        return;
      } else {
        // Send friend request
        await sendFriendRequest(memberId);
        
        // Update local friendships map
        setFriendshipsMap(prev => ({
          ...prev,
          [memberId]: {
            status: 'pending',
            is_requester: true
          }
        }));
        
        toast.success(`Friend request sent to ${selectedMember.username}`);
      }
    } catch (err) {
      console.error('Friend request error:', err);
      if (err.response?.status === 409) {
        toast.error(err.response.data.error || 'Request already exists');
      } else {
        toast.error('Failed to send friend request');
      }
    }
  };
  
  // ✅ Handle Message button - navigate to LobbyPage chat
  const handleMessage = () => {
    if (!selectedMember) return;
    
    const memberId = selectedMember.id || selectedMember.user_id;
    const friendship = friendshipsMap[memberId];
    
    // Check if they're friends
    if (friendship?.status !== 'accepted') {
      toast.error('You must be friends to send messages');
      return;
    }
    
    // Navigate to LobbyPage with chat tab open
    navigate('/lobby', { 
      state: { 
        openChatWith: selectedMember,
        activeTab: 'chats'
      } 
    });
    
    // Close modals
    setIsProfileModalOpen(false);
    onClose();
  };
  
  // ✅ Handle save profile (for own profile edit)
  const handleSaveProfile = async (updatedData) => {
    try {
      // Profile update logic handled by UserProfileModal's parent
      // Just refresh user data
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (err) {
      console.error('Failed to update profile:', err);
      toast.error('Failed to update profile');
    }
  };
  
  // Check if selected member is current user
  const isOwnProfile = selectedMember && 
    (selectedMember.id === currentUser?.id || selectedMember.user_id === currentUser?.id);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[500px] max-h-[85vh] flex flex-col p-0 gap-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-gray-900 dark:text-white">
                <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Room Members
              </DialogTitle>
              <Badge variant="secondary" className="font-semibold">
                {members.length}
              </Badge>
            </div>
            <Button
              onClick={onAddMembers}
              size="sm"
              variant="ghost"
              className="h-9 gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              title="Share room to invite members"
            >
              <UserPlus className="w-4 h-4" />
              Invite
            </Button>
          </div>
          <DialogDescription className="text-sm text-gray-500 mt-2">
            {searchQuery ? `Found ${totalFiltered} member${totalFiltered !== 1 ? 's' : ''}` : 'View and manage room members'}
          </DialogDescription>
        </DialogHeader>

        {/* Search Bar */}
        {members.length > 5 && (
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10 bg-white dark:bg-gray-800"
              />
            </div>
          </div>
        )}

        {/* Members List */}
        <ScrollArea className="flex-1 px-6 py-4 h-[400px] max-h-[60vh] overflow-y-auto scrollbar-hide">
          <style dangerouslySetInnerHTML={{__html: `
            .scrollbar-hide::-webkit-scrollbar {
              display: none;
            }
            .scrollbar-hide {
              -ms-overflow-style: none;
              scrollbar-width: none;
            }
          `}} />
          {loading ? (
            <div className="flex flex-col gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg animate-pulse">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-gray-700 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24" />
                    <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-16" />
                  </div>
                </div>
              ))}
            </div>
          ) : totalFiltered === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center mb-4">
                <Search className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">
                {searchQuery ? 'No members found' : 'No members yet'}
              </p>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {searchQuery ? 'Try a different search term' : 'Invite people to join your room'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Hosts Section */}
              {hosts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <Crown className="w-3.5 h-3.5 text-yellow-600" />
                    Host{hosts.length > 1 ? 's' : ''} ({hosts.length})
                  </div>
                  <div className="space-y-2">
                    {hosts.map((member) => (
                      <MemberCard 
                        key={member.id || member.user_id} 
                        member={member} 
                        isHost={true}
                        onClick={() => handleMemberClick(member)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Regular Members Section */}
              {regularMembers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    <UserCheck className="w-3.5 h-3.5 text-blue-600" />
                    Members ({regularMembers.length})
                  </div>
                  <div className="space-y-2">
                    {regularMembers.map((member) => (
                      <MemberCard 
                        key={member.id || member.user_id} 
                        member={member} 
                        isHost={false}
                        onClick={() => handleMemberClick(member)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
      
      {/* UserProfileModal - Rendered outside Dialog for proper z-index stacking */}
      {selectedMember && (
        <UserProfileModal
          user={selectedMember}
          isOpen={isProfileModalOpen}
          onClose={() => {
            setIsProfileModalOpen(false);
            setSelectedMember(null);
            // Reopen RoomMembersModal if user was browsing members
            if (shouldReopenMembersModal && onRequestReopen) {
              setShouldReopenMembersModal(false);
              // Delay reopen to ensure clean modal transition
              setTimeout(() => {
                onRequestReopen();
              }, 150);
            }
          }}
          onMessage={handleMessage}
          onAddFriend={handleAddFriend}
          isOwnProfile={isOwnProfile}
          isInWatchSession={true}
          friendshipStatus={selectedFriendship?.status || 'none'}
          isRequester={selectedFriendship?.is_requester || false}
          onSaveProfile={isOwnProfile ? handleSaveProfile : undefined}
        />
      )}
    </>
  );
};

// Member Card Component
const MemberCard = ({ member, isHost, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="flex items-center gap-3 p-3 bg-gradient-to-r from-gray-50 to-white dark:from-gray-800 dark:to-gray-800/50 rounded-lg hover:shadow-md hover:scale-[1.02] transition-all duration-200 border border-gray-100 dark:border-gray-700 cursor-pointer"
    >
      {/* Avatar with shadcn */}
      <div className="relative">
        <Avatar className="w-12 h-12 border-2 border-gray-200 dark:border-gray-600 ring-2 ring-offset-2 ring-transparent hover:ring-blue-500/30 transition-all">
          <AvatarImage 
            src={member.avatar_url} 
            alt={member.username}
            onError={(e) => {
              e.target.onerror = null;
              e.target.src = '/avatars/default.png';
            }}
          />
          <AvatarFallback className="bg-gradient-to-br from-blue-600 to-purple-600 text-white font-bold">
            {member.username?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        
        {/* Online Status Indicator */}
        {member.is_online && (
          <div className="absolute -bottom-0.5 -right-0.5">
            <div className="relative">
              <div className="w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800" />
              <div className="absolute inset-0 w-3.5 h-3.5 bg-green-500 rounded-full animate-ping opacity-75" />
            </div>
          </div>
        )}
      </div>
      
      {/* Member Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-gray-900 dark:text-white truncate">
            {member.username || `User ${member.id || member.user_id}`}
          </p>
          {isHost && (
            <Badge variant="secondary" className="bg-gradient-to-r from-yellow-100 to-yellow-50 dark:from-yellow-900/30 dark:to-yellow-800/20 text-yellow-800 dark:text-yellow-400 border-yellow-200 dark:border-yellow-700 shadow-sm shrink-0">
              <Crown className="w-3 h-3 mr-1" />
              Host
            </Badge>
          )}
        </div>
        {member.bio && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
            {member.bio}
          </p>
        )}
      </div>
    </div>
  );
};

export default RoomMembersModal;
