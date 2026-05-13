  // Check if user is following - use post.room_id or fall back to poster's main_room_id
  useEffect(() => {
    const effectiveRoomId = post?.room_id || post?.user?.main_room_id;
    console.log('🔄 [PostViewModal] Follow state update:', {
      postId: post?.id,
      postRoomId: post?.room_id,
      userMainRoomId: post?.user?.main_room_id,
      effectiveRoomId,
      hasRoomMemberships: !!roomMemberships,
      shouldShowFollowBtn: post?.user_id !== currentUser?.id && !!effectiveRoomId,
    });
    if (effectiveRoomId && roomMemberships) {
      const following = roomMemberships.some(rm => rm.room_id === effectiveRoomId);
      setIsFollowing(following);
    }
  }, [post, roomMemberships]);

          {/* Follow button - show if viewing another user's post and they have a room (explicit or main) */}
          {post.user_id !== currentUser?.id && (post.room_id || post.user?.main_room_id) ? (
            <>
              {console.log('✅ [PostViewModal] Follow button WILL render for post:', post.id, {
                postUserId: post.user_id,
                currentUserId: currentUser?.id,
                postHasRoomId: !!post.room_id,
                postHasMainRoomId: !!post.user?.main_room_id,
                postRoomIdValue: post.room_id,
                postMainRoomIdValue: post.user?.main_room_id,
              })}
              <button
                onClick={handleFollowToggle}
                className={`px-4 py-2 rounded-full font-medium text-sm transition-colors flex items-center gap-1.5 ${
                  isFollowing
                    ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }`}
              >
                {isFollowing ? (
                  <>
                    <UserCheck className="w-4 h-4" />
                    Following
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4" />
                    Follow
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {console.log('❌ [PostViewModal] Follow button HIDDEN for post:', post.id, {
                isOwnPost: post.user_id === currentUser?.id,
                hasRoomId: !!post.room_id,
                hasMainRoomId: !!post.user?.main_room_id,
                postRoomId: post.room_id,
                userMainRoomId: post.user?.main_room_id,
                postUserId: post.user_id,
                currentUserId: currentUser?.id,
              })}
            </>
          )}