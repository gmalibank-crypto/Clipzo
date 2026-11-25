import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Edit3,
  Film,
  Heart,
  LogOut,
  Play,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import type { UserProfileSummary, VideoItem } from '../types';
import { apiFetch, formatCompactCount } from '../lib/api';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  username: string | null;
  currentUser: UserProfileSummary | null;
  onBack?: () => void;
  onRequireAuth: () => void;
  onOpenVideo: (video: VideoItem, allVideos: VideoItem[]) => void;
  onFollow: (userId: string) => Promise<void>;
  onUserUpdated: (user: UserProfileSummary) => void;
  onLogout: () => Promise<void>;
  onVideoDeleted: (videoId: string) => void;
}

export function ProfileView({
  username,
  currentUser,
  onBack,
  onRequireAuth,
  onOpenVideo,
  onFollow,
  onUserUpdated,
  onLogout,
  onVideoDeleted,
}: ProfileViewProps) {
  const targetUsername = username || currentUser?.username || null;

  const [profile, setProfile] = useState<UserProfileSummary | null>(null);
  const [posted, setPosted] = useState<VideoItem[]>([]);
  const [liked, setLiked] = useState<VideoItem[]>([]);
  const [saved, setSaved] = useState<VideoItem[]>([]);
  const [tab, setTab] = useState<'videos' | 'saved' | 'liked'>('videos');
  const [loading, setLoading] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!targetUsername) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiFetch<{
      profile: UserProfileSummary;
      postedVideos: VideoItem[];
      likedVideos: VideoItem[];
      savedVideos: VideoItem[];
    }>(`/api/users/${encodeURIComponent(targetUsername)}`)
      .then((res) => {
        if (!cancelled) {
          setProfile(res.profile);
          setPosted(res.postedVideos);
          setLiked(res.likedVideos);
          setSaved(res.savedVideos);
          setEditName(res.profile.displayName);
          setEditBio(res.profile.bio);
        }
      })
      .catch(() => {
        if (!cancelled) setProfile(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [targetUsername, currentUser?.id]);

  if (!targetUsername) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[#070709]">
        <div className="max-w-sm w-full text-center p-6 rounded-2xl bg-[#111116] border border-white/10">
          <UserIcon className="w-10 h-10 text-[#FF2E54] mx-auto mb-3" />
          <h2 className="font-display font-bold text-lg text-white mb-1">Your Velo Profile</h2>
          <p className="text-sm text-zinc-400 mb-5">
            Sign in to view your uploaded clips, saved bookmarks, and followers.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="w-full h-11 rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] text-white font-semibold text-sm transition-colors"
          >
            Sign in or Sign up
          </button>
        </div>
      </div>
    );
  }

  const handleFollowToggle = async () => {
    if (!profile) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    await onFollow(profile.id);
    setProfile((prev) =>
      prev
        ? {
            ...prev,
            isFollowing: !prev.isFollowing,
            followersCount: prev.isFollowing
              ? Math.max(0, prev.followersCount - 1)
              : prev.followersCount + 1,
          }
        : null
    );
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || savingEdit) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch<{ user: UserProfileSummary }>('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: editName, bio: editBio }),
      });
      setProfile((prev) => (prev ? { ...prev, displayName: res.user.displayName, bio: res.user.bio } : null));
      onUserUpdated(res.user);
      setIsEditing(false);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteVideo = async (videoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await apiFetch(`/api/videos/${videoId}`, { method: 'DELETE' });
    setPosted((prev) => prev.filter((v) => v.id !== videoId));
    onVideoDeleted(videoId);
  };

  const activeVideos = tab === 'videos' ? posted : tab === 'saved' ? saved : liked;

  return (
    <div className="h-full overflow-y-auto bg-[#070709] pb-24 lg:pb-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6">
        {/* Top Row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Go back"
                className="min-w-[44px] min-h-[44px] -ml-2 flex items-center justify-center rounded-full text-zinc-300 hover:text-white"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <span className="font-display font-bold text-lg text-white">
              @{profile?.username || targetUsername}
            </span>
          </div>

          {profile?.isSelf && (
            <button
              type="button"
              onClick={onLogout}
              className="px-3.5 py-2 rounded-xl bg-[#15151C] hover:bg-[#1F1F28] border border-white/10 text-xs font-medium text-zinc-200 flex items-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log out</span>
            </button>
          )}
        </div>

        {loading && !profile ? (
          <div className="py-20 text-center text-sm text-zinc-400">Loading profile...</div>
        ) : profile ? (
          <>
            {/* Profile Hero */}
            <div className="flex flex-col items-center text-center mb-6">
              <Avatar
                src={profile.avatarUrl}
                name={profile.displayName}
                size="xl"
                verified={profile.verified}
              />
              <h1 className="font-display font-bold text-xl text-white mt-3">
                {profile.displayName}
              </h1>
              <p className="text-sm text-zinc-400">@{profile.username}</p>

              {/* Tabular Stats */}
              <div className="flex items-center justify-center gap-8 mt-5">
                <div>
                  <div className="font-mono-tabular font-bold text-lg text-white">
                    {formatCompactCount(profile.followingCount)}
                  </div>
                  <div className="text-xs text-zinc-400">Following</div>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div>
                  <div className="font-mono-tabular font-bold text-lg text-white">
                    {formatCompactCount(profile.followersCount)}
                  </div>
                  <div className="text-xs text-zinc-400">Followers</div>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <div>
                  <div className="font-mono-tabular font-bold text-lg text-white">
                    {formatCompactCount(profile.totalLikes)}
                  </div>
                  <div className="text-xs text-zinc-400">Likes</div>
                </div>
              </div>

              {/* Action CTA */}
              <div className="mt-5 flex items-center gap-2.5">
                {profile.isSelf ? (
                  <button
                    type="button"
                    onClick={() => setIsEditing((v) => !v)}
                    className="px-5 py-2.5 rounded-xl bg-[#191922] hover:bg-[#23232E] border border-white/15 text-sm font-semibold text-white flex items-center gap-2"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>{isEditing ? 'Cancel edit' : 'Edit profile'}</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleFollowToggle}
                    className={`px-7 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                      profile.isFollowing
                        ? 'bg-[#191922] hover:bg-[#23232E] border border-white/15 text-white'
                        : 'bg-[#FF2E54] hover:bg-[#ff4265] text-white'
                    }`}
                  >
                    {profile.isFollowing ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>

              {/* Bio or Edit Form */}
              {isEditing ? (
                <form onSubmit={handleSaveProfile} className="w-full max-w-md mt-4 space-y-3 text-left">
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Display name"
                    maxLength={40}
                    className="w-full bg-[#15151C] border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white"
                  />
                  <textarea
                    rows={2}
                    value={editBio}
                    onChange={(e) => setEditBio(e.target.value)}
                    placeholder="Tell creators about yourself..."
                    maxLength={160}
                    className="w-full bg-[#15151C] border border-white/15 rounded-xl px-3.5 py-2 text-sm text-white resize-none"
                  />
                  <button
                    type="submit"
                    disabled={savingEdit}
                    className="w-full py-2.5 rounded-xl bg-[#FF2E54] text-white text-sm font-semibold"
                  >
                    {savingEdit ? 'Saving...' : 'Save changes'}
                  </button>
                </form>
              ) : (
                profile.bio && (
                  <p className="text-sm text-zinc-300 max-w-md mt-4 leading-relaxed">
                    {profile.bio}
                  </p>
                )
              )}
            </div>

            {/* Profile Tabs */}
            <div className="flex items-center justify-center border-b border-white/10 mb-4">
              <button
                type="button"
                onClick={() => setTab('videos')}
                className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  tab === 'videos'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Film className="w-4 h-4" />
                <span>Videos</span>
                <span className="font-mono-tabular text-xs opacity-70">{posted.length}</span>
              </button>

              {profile.isSelf && (
                <button
                  type="button"
                  onClick={() => setTab('saved')}
                  className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                    tab === 'saved'
                      ? 'border-white text-white'
                      : 'border-transparent text-zinc-400 hover:text-white'
                  }`}
                >
                  <Bookmark className="w-4 h-4" />
                  <span>Saved</span>
                  <span className="font-mono-tabular text-xs opacity-70">{saved.length}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setTab('liked')}
                className={`px-6 py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
                  tab === 'liked'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-400 hover:text-white'
                }`}
              >
                <Heart className="w-4 h-4" />
                <span>Liked</span>
                <span className="font-mono-tabular text-xs opacity-70">{liked.length}</span>
              </button>
            </div>

            {/* Videos Grid */}
            {activeVideos.length === 0 ? (
              <div className="py-16 text-center rounded-2xl border border-white/10 bg-[#101015]">
                <p className="text-sm text-zinc-400">
                  {tab === 'videos'
                    ? 'No videos published yet.'
                    : tab === 'saved'
                    ? 'No saved videos yet.'
                    : 'No liked videos yet.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {activeVideos.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => onOpenVideo(v, activeVideos)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') onOpenVideo(v, activeVideos);
                    }}
                    className="group relative aspect-[9/16] rounded-xl overflow-hidden bg-[#121218] border border-white/10 cursor-pointer"
                  >
                    {v.posterUrl ? (
                      <img
                        src={v.posterUrl}
                        alt={v.caption}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <video
                        src={v.streamUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                    <div className="absolute bottom-2 left-2.5 flex items-center gap-1 text-xs font-mono-tabular text-white">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{formatCompactCount(v.viewsCount)}</span>
                    </div>

                    {profile.isSelf && tab === 'videos' && (
                      <button
                        type="button"
                        onClick={(e) => handleDeleteVideo(v.id, e)}
                        aria-label="Delete video"
                        className="absolute top-2 right-2 min-w-[36px] min-h-[36px] rounded-full bg-black/60 hover:bg-[#FF2E54] text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="py-16 text-center text-sm text-zinc-400">User not found.</div>
        )}
      </div>
    </div>
  );
}
