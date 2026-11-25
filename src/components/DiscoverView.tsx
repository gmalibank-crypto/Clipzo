import { useEffect, useState } from 'react';
import { Flame, Play, Search, X } from 'lucide-react';
import type { DiscoverUser, TrendingHashtag, VideoItem } from '../types';
import { apiFetch, formatCompactCount } from '../lib/api';
import { Avatar } from './Avatar';

interface DiscoverViewProps {
  initialTag?: string;
  onClearInitialTag?: () => void;
  onOpenVideo: (video: VideoItem, allVideos: VideoItem[]) => void;
  onSelectProfile: (username: string) => void;
  onFollow: (userId: string) => Promise<void>;
}

export function DiscoverView({
  initialTag = '',
  onClearInitialTag,
  onOpenVideo,
  onSelectProfile,
  onFollow,
}: DiscoverViewProps) {
  const [query, setQuery] = useState('');
  const [activeTag, setActiveTag] = useState(initialTag);
  const [users, setUsers] = useState<DiscoverUser[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [hashtags, setHashtags] = useState<TrendingHashtag[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setActiveTag(initialTag);
  }, [initialTag]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (activeTag) params.set('tag', activeTag);

    const timer = window.setTimeout(() => {
      apiFetch<{
        users: DiscoverUser[];
        videos: VideoItem[];
        hashtags: TrendingHashtag[];
      }>(`/api/discover?${params.toString()}`)
        .then((res) => {
          if (!cancelled) {
            setUsers(res.users);
            setVideos(res.videos);
            setHashtags(res.hashtags);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, activeTag]);

  const handleToggleFollow = async (targetId: string) => {
    await onFollow(targetId);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === targetId
          ? {
              ...u,
              isFollowing: !u.isFollowing,
              followersCount: u.isFollowing ? Math.max(0, u.followersCount - 1) : u.followersCount + 1,
            }
          : u
      )
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#070709] pb-24 lg:pb-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 space-y-6">
        {/* Search Input */}
        <div className="sticky top-0 z-20 pt-1 pb-3 bg-[#070709]/95 backdrop-blur-md">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 pointer-events-none" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search creators, videos, or #hashtags..."
              className="w-full h-11 bg-[#14141A] border border-white/10 rounded-xl pl-10 pr-10 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
            />
            {(query || activeTag) && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setActiveTag('');
                  onClearInitialTag?.();
                }}
                aria-label="Clear search"
                className="absolute right-2 min-w-[36px] min-h-[36px] flex items-center justify-center text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Interactive Hashtag Filter Tabs */}
          {hashtags.length > 0 && (
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pt-3">
              <button
                type="button"
                onClick={() => {
                  setActiveTag('');
                  onClearInitialTag?.();
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  !activeTag
                    ? 'bg-white text-black'
                    : 'bg-[#14141A] text-zinc-300 hover:text-white border border-white/10'
                }`}
              >
                All Trending
              </button>
              {hashtags.map((h) => (
                <button
                  key={h.tag}
                  type="button"
                  onClick={() => setActiveTag(activeTag === h.tag ? '' : h.tag)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors flex items-center gap-1.5 ${
                    activeTag === h.tag
                      ? 'bg-[#FF2E54] text-white'
                      : 'bg-[#14141A] text-zinc-300 hover:text-white border border-white/10'
                  }`}
                >
                  <span>#{h.tag}</span>
                  <span className="font-mono-tabular opacity-70">{formatCompactCount(h.viewsCount)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Creators Section */}
        {users.length > 0 && (
          <section>
            <h2 className="font-display font-semibold text-base text-white mb-3">Creators</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="p-3.5 rounded-2xl bg-[#111116] border border-white/10 flex items-center gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onSelectProfile(u.username)}
                    className="shrink-0"
                  >
                    <Avatar src={u.avatarUrl} name={u.displayName} size="md" verified={u.verified} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectProfile(u.username)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className="font-semibold text-sm text-white truncate">{u.displayName}</div>
                    <div className="text-xs text-zinc-400 truncate">
                      @{u.username} · <span className="font-mono-tabular">{formatCompactCount(u.followersCount)}</span> followers
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleFollow(u.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      u.isFollowing
                        ? 'bg-[#1D1D25] text-zinc-200 border border-white/10'
                        : 'bg-[#FF2E54] text-white hover:bg-[#ff4265]'
                    }`}
                  >
                    {u.isFollowing ? 'Following' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Trending Videos Grid */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-base text-white flex items-center gap-1.5">
              <Flame className="w-4 h-4 text-[#FF2E54]" />
              <span>{activeTag ? `#${activeTag}` : 'Trending Clips'}</span>
            </h2>
            <span className="font-mono-tabular text-xs text-zinc-400">
              {videos.length} {videos.length === 1 ? 'video' : 'videos'}
            </span>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((n) => (
                <div key={n} className="aspect-[9/16] rounded-2xl bg-[#121218] animate-pulse" />
              ))}
            </div>
          ) : videos.length === 0 ? (
            <div className="py-16 text-center rounded-2xl border border-white/10 bg-[#101015]">
              <p className="text-sm text-zinc-400">No matching videos found for your search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {videos.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onOpenVideo(v, videos)}
                  className="group relative aspect-[9/16] rounded-2xl overflow-hidden bg-[#121218] border border-white/10 text-left focus-visible:outline-2 focus-visible:outline-[#FF2E54]"
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
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                  <div className="absolute bottom-2.5 inset-x-2.5 space-y-1">
                    <p className="text-xs text-white/95 line-clamp-2 leading-snug font-medium">
                      {v.caption}
                    </p>
                    <div className="flex items-center justify-between text-[11px] text-zinc-300">
                      <span className="truncate">@{v.creator.username}</span>
                      <span className="font-mono-tabular flex items-center gap-1 shrink-0">
                        <Play className="w-3 h-3 fill-current" />
                        {formatCompactCount(v.viewsCount)}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
