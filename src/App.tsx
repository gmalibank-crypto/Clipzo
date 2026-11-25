import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronDown,
  ChevronUp,
  Compass,
  Home,
  LogIn,
  Plus,
  Search,
  User,
} from 'lucide-react';
import type { FeedTab, NavTab, UserProfileSummary, VideoItem } from './types';
import { apiFetch, setAuthToken } from './lib/api';
import { Avatar } from './components/Avatar';
import { AuthModal } from './components/AuthModal';
import { CommentsDrawer } from './components/CommentsDrawer';
import { DiscoverView } from './components/DiscoverView';
import { InboxView } from './components/InboxView';
import { ProfileView } from './components/ProfileView';
import { ShareSheet } from './components/ShareSheet';
import { UploadStudioModal } from './components/UploadStudioModal';
import { VideoCard } from './components/VideoCard';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfileSummary | null>(null);
  const [navTab, setNavTab] = useState<NavTab>('home');
  const [feedTab, setFeedTab] = useState<FeedTab>('foryou');
  const [profileUsername, setProfileUsername] = useState<string | null>(null);
  const [discoverTag, setDiscoverTag] = useState<string>('');

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const [commentsVideo, setCommentsVideo] = useState<VideoItem | null>(null);
  const [shareVideo, setShareVideo] = useState<VideoItem | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const feedContainerRef = useRef<HTMLDivElement | null>(null);
  const slideRefs = useRef<Array<HTMLDivElement | null>>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 2600);
  }, []);

  const loadFeed = useCallback(
    async (tab: FeedTab, focusVideoId?: string) => {
      setFeedLoading(true);
      try {
        const params = new URLSearchParams({ tab });
        if (focusVideoId) params.set('videoId', focusVideoId);
        const res = await apiFetch<{ videos: VideoItem[]; requiresAuth?: boolean }>(
          `/api/feed?${params.toString()}`
        );
        setVideos(res.videos);
        setActiveIndex(0);
        if (feedContainerRef.current) {
          feedContainerRef.current.scrollTo({ top: 0 });
        }
      } catch {
        setVideos([]);
      } finally {
        setFeedLoading(false);
      }
    },
    []
  );

  // Initial auth & feed load (supports ?v=<videoId> deep link)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const focusVideoId = urlParams.get('v') || undefined;

    apiFetch<{ user: UserProfileSummary | null }>('/api/auth/me')
      .then((res) => {
        setCurrentUser(res.user);
        if (res.user) {
          apiFetch<{ unreadCount: number }>('/api/notifications')
            .then((n) => setUnreadCount(n.unreadCount))
            .catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        void loadFeed('foryou', focusVideoId);
      });
  }, [loadFeed]);

  // Reload feed when switching For You / Following
  const handleSwitchFeedTab = (tab: FeedTab) => {
    if (tab === 'following' && !currentUser) {
      setAuthModalOpen(true);
      return;
    }
    setFeedTab(tab);
    void loadFeed(tab);
  };

  // Track visible slide via IntersectionObserver
  useEffect(() => {
    if (navTab !== 'home' || videos.length === 0) return;
    const container = feedContainerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idx = Number(entry.target.getAttribute('data-index'));
            if (!Number.isNaN(idx)) {
              setActiveIndex(idx);
            }
          }
        }
      },
      { root: container, threshold: 0.6 }
    );

    slideRefs.current.forEach((el) => {
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [navTab, videos]);

  const scrollToIndex = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(videos.length - 1, index));
      const target = slideRefs.current[clamped];
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    },
    [videos.length]
  );

  // Keyboard navigation on desktop
  useEffect(() => {
    if (navTab !== 'home' || authModalOpen || uploadModalOpen || Boolean(shareVideo)) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        scrollToIndex(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        scrollToIndex(activeIndex - 1);
      } else if (e.key.toLowerCase() === 'm') {
        setMuted((m) => !m);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navTab, activeIndex, scrollToIndex, authModalOpen, uploadModalOpen, shareVideo]);

  const handleToggleMute = () => setMuted((m) => !m);

  const handleLike = async (videoId: string, forceLike = false) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const target = videos.find((v) => v.id === videoId);
    if (!target) return;
    if (forceLike && target.isLiked) return;

    // Optimistic update
    const nextLiked = !target.isLiked;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              isLiked: nextLiked,
              likesCount: nextLiked ? v.likesCount + 1 : Math.max(0, v.likesCount - 1),
            }
          : v
      )
    );

    try {
      const res = await apiFetch<{ isLiked: boolean; likesCount: number }>(
        `/api/videos/${videoId}/like`,
        { method: 'POST' }
      );
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, isLiked: res.isLiked, likesCount: res.likesCount } : v
        )
      );
    } catch {
      // Revert on failure
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, isLiked: target.isLiked, likesCount: target.likesCount } : v
        )
      );
    }
  };

  const handleSave = async (videoId: string) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const target = videos.find((v) => v.id === videoId);
    if (!target) return;

    const nextSaved = !target.isSaved;
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId
          ? {
              ...v,
              isSaved: nextSaved,
              savesCount: nextSaved ? v.savesCount + 1 : Math.max(0, v.savesCount - 1),
            }
          : v
      )
    );

    try {
      const res = await apiFetch<{ isSaved: boolean; savesCount: number }>(
        `/api/videos/${videoId}/save`,
        { method: 'POST' }
      );
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, isSaved: res.isSaved, savesCount: res.savesCount } : v
        )
      );
      showToast(res.isSaved ? 'Saved to bookmarks' : 'Removed from bookmarks');
    } catch {
      setVideos((prev) =>
        prev.map((v) =>
          v.id === videoId ? { ...v, isSaved: target.isSaved, savesCount: target.savesCount } : v
        )
      );
    }
  };

  const handleFollow = async (creatorId: string) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      return;
    }
    const res = await apiFetch<{ isFollowing: boolean }>(`/api/users/${creatorId}/follow`, {
      method: 'POST',
    });
    setVideos((prev) =>
      prev.map((v) =>
        v.creator.id === creatorId
          ? { ...v, creator: { ...v.creator, isFollowing: res.isFollowing } }
          : v
      )
    );
    showToast(res.isFollowing ? 'Creator followed' : 'Unfollowed creator');
  };

  const handleWatchEvent = useCallback(
    (videoId: string, watchMs: number, completed: boolean) => {
      void apiFetch(`/api/videos/${videoId}/view`, {
        method: 'POST',
        body: JSON.stringify({ watchMs, completed }),
      }).catch(() => {});
    },
    []
  );

  const handleOpenProfile = (username: string) => {
    setProfileUsername(username);
    setNavTab('profile');
    setCommentsVideo(null);
  };

  const handleOpenHashtag = (tag: string) => {
    setDiscoverTag(tag);
    setNavTab('discover');
    setCommentsVideo(null);
  };

  const handleOpenVideoList = (video: VideoItem, list: VideoItem[]) => {
    const idx = list.findIndex((v) => v.id === video.id);
    setVideos(list);
    setNavTab('home');
    setFeedTab('foryou');
    window.requestAnimationFrame(() => {
      const targetIndex = idx >= 0 ? idx : 0;
      setActiveIndex(targetIndex);
      slideRefs.current[targetIndex]?.scrollIntoView({ behavior: 'auto', block: 'start' });
    });
  };

  const handleOpenVideoById = async (videoId: string) => {
    setNavTab('home');
    setFeedTab('foryou');
    await loadFeed('foryou', videoId);
  };

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setAuthToken(null);
    setCurrentUser(null);
    setUnreadCount(0);
    setProfileUsername(null);
    setNavTab('home');
    setFeedTab('foryou');
    void loadFeed('foryou');
    showToast('Signed out');
  };

  const handleAuthenticated = (user: UserProfileSummary) => {
    setCurrentUser(user);
    void loadFeed(feedTab);
    apiFetch<{ unreadCount: number }>('/api/notifications')
      .then((n) => setUnreadCount(n.unreadCount))
      .catch(() => {});
    showToast(`Signed in as @${user.username}`);
  };

  const activeVideo = videos[activeIndex] || null;

  return (
    <div className="h-[100dvh] w-full bg-[#070709] text-white flex overflow-hidden">
      {/* Desktop Left Navigation Rail */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-white/10 bg-[#0A0A0E] p-4 justify-between">
        <div className="space-y-6">
          <button
            type="button"
            onClick={() => {
              setNavTab('home');
              setProfileUsername(null);
            }}
            className="flex items-center gap-2.5 px-2 py-1 text-left"
          >
            <div className="w-8 h-8 rounded-lg bg-[#FF2E54] flex items-center justify-center font-display font-extrabold text-lg text-white shadow-[0_0_20px_rgba(255,46,84,0.35)]">
              V
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-white">Velo</span>
          </button>

          <nav className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setNavTab('home');
                handleSwitchFeedTab('foryou');
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                navTab === 'home' && feedTab === 'foryou'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Home className="w-5 h-5" />
              <span>For You</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setNavTab('home');
                handleSwitchFeedTab('following');
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                navTab === 'home' && feedTab === 'following'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <User className="w-5 h-5" />
              <span>Following</span>
            </button>

            <button
              type="button"
              onClick={() => setNavTab('discover')}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                navTab === 'discover'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Compass className="w-5 h-5" />
              <span>Discover</span>
            </button>

            <button
              type="button"
              onClick={() => setNavTab('inbox')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                navTab === 'inbox'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="flex items-center gap-3">
                <Bell className="w-5 h-5" />
                <span>Inbox</span>
              </span>
              {unreadCount > 0 && (
                <span className="font-mono-tabular text-xs font-bold text-[#FF2E54]">
                  {unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setProfileUsername(null);
                setNavTab('profile');
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                navTab === 'profile'
                  ? 'bg-white/10 text-white'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <User className="w-5 h-5" />
              <span>Profile</span>
            </button>
          </nav>

          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                setAuthModalOpen(true);
              } else {
                setUploadModalOpen(true);
              }
            }}
            className="w-full h-11 rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] text-white font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Upload / Record</span>
          </button>
        </div>

        {/* Account Footer */}
        <div className="pt-4 border-t border-white/10">
          {currentUser ? (
            <button
              type="button"
              onClick={() => {
                setProfileUsername(null);
                setNavTab('profile');
              }}
              className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <Avatar
                src={currentUser.avatarUrl}
                name={currentUser.displayName}
                size="sm"
                verified={currentUser.verified}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-white truncate">
                  {currentUser.displayName}
                </div>
                <div className="text-xs text-zinc-400 truncate">@{currentUser.username}</div>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              className="w-full h-11 rounded-xl bg-[#191922] hover:bg-[#23232E] border border-white/10 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              <span>Log in / Sign up</span>
            </button>
          )}
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="flex-1 min-w-0 h-full relative flex">
        {navTab === 'home' && (
          <>
            {/* Video Feed Stage */}
            <div className="flex-1 h-full relative flex items-center justify-center bg-[#070709]">
              {/* Mobile Top Feed Switcher (Compact 48px overlay) */}
              <header className="lg:hidden absolute top-0 inset-x-0 z-30 pt-safe">
                <div className="h-12 px-4 flex items-center justify-between">
                  <span className="font-display font-bold text-base tracking-tight text-white/95">
                    Velo
                  </span>

                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => handleSwitchFeedTab('following')}
                      className={`text-sm font-semibold transition-colors relative py-1 ${
                        feedTab === 'following' ? 'text-white' : 'text-white/60'
                      }`}
                    >
                      Following
                      {feedTab === 'following' && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-white rounded-full" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchFeedTab('foryou')}
                      className={`text-sm font-semibold transition-colors relative py-1 ${
                        feedTab === 'foryou' ? 'text-white' : 'text-white/60'
                      }`}
                    >
                      For You
                      {feedTab === 'foryou' && (
                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-0.5 bg-white rounded-full" />
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setNavTab('discover')}
                    aria-label="Search discover"
                    className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center text-white"
                  >
                    <Search className="w-5 h-5" />
                  </button>
                </div>
              </header>

              {/* Desktop / Mobile Snap Feed Container */}
              <div className="w-full h-full lg:h-[calc(100dvh-28px)] lg:max-w-[430px] lg:rounded-2xl lg:overflow-hidden lg:border lg:border-white/10 lg:shadow-2xl relative bg-black">
                {feedLoading ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#0C0C10]">
                    <div className="w-10 h-10 rounded-full border-2 border-white/20 border-t-[#FF2E54] animate-spin mb-3" />
                    <span className="text-xs text-zinc-400">Loading vertical feed...</span>
                  </div>
                ) : videos.length === 0 ? (
                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center bg-[#0C0C10]">
                    <p className="font-display font-semibold text-base text-white mb-1">
                      {feedTab === 'following'
                        ? 'No videos from followed creators yet'
                        : 'No videos available'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-5">
                      {feedTab === 'following'
                        ? 'Follow creators in For You or Discover to build your feed.'
                        : 'Upload or record the first clip.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => setNavTab('discover')}
                      className="px-5 py-2.5 rounded-xl bg-[#FF2E54] text-white text-sm font-semibold"
                    >
                      Explore Discover
                    </button>
                  </div>
                ) : (
                  <div
                    ref={feedContainerRef}
                    className="w-full h-full overflow-y-scroll snap-y snap-mandatory no-scrollbar"
                  >
                    {videos.map((video, index) => (
                      <div
                        key={video.id}
                        ref={(el) => {
                          slideRefs.current[index] = el;
                        }}
                        data-index={index}
                        className="w-full h-full snap-start snap-always shrink-0"
                      >
                        <VideoCard
                          video={video}
                          isActive={navTab === 'home' && activeIndex === index}
                          isPreload={Math.abs(activeIndex - index) <= 1}
                          muted={muted}
                          onToggleMute={handleToggleMute}
                          onLike={handleLike}
                          onSave={handleSave}
                          onOpenComments={(v) => setCommentsVideo(v)}
                          onShare={(v) => setShareVideo(v)}
                          onFollow={handleFollow}
                          onSelectProfile={handleOpenProfile}
                          onSelectHashtag={handleOpenHashtag}
                          onWatchEvent={handleWatchEvent}
                          currentUserId={currentUser?.id}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Desktop Feed Up/Down Controls */}
              {videos.length > 1 && (
                <div className="hidden lg:flex flex-col gap-2 ml-4">
                  <button
                    type="button"
                    disabled={activeIndex === 0}
                    onClick={() => scrollToIndex(activeIndex - 1)}
                    aria-label="Previous video"
                    className="w-11 h-11 rounded-full bg-[#15151C] hover:bg-[#1E1E28] border border-white/10 disabled:opacity-30 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronUp className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    disabled={activeIndex >= videos.length - 1}
                    onClick={() => scrollToIndex(activeIndex + 1)}
                    aria-label="Next video"
                    className="w-11 h-11 rounded-full bg-[#15151C] hover:bg-[#1E1E28] border border-white/10 disabled:opacity-30 flex items-center justify-center text-white transition-colors"
                  >
                    <ChevronDown className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Right-Side Live Comments Panel */}
            {activeVideo && (
              <div className="hidden xl:block w-[360px] shrink-0 h-full">
                <CommentsDrawer
                  video={activeVideo}
                  isOpen={true}
                  variant="panel"
                  currentUser={currentUser}
                  onRequireAuth={() => setAuthModalOpen(true)}
                  onCommentAdded={(vid, newCount) => {
                    setVideos((prev) =>
                      prev.map((v) => (v.id === vid ? { ...v, commentsCount: newCount } : v))
                    );
                  }}
                  onSelectProfile={handleOpenProfile}
                />
              </div>
            )}
          </>
        )}

        {navTab === 'discover' && (
          <div className="flex-1 h-full min-w-0">
            <DiscoverView
              initialTag={discoverTag}
              onClearInitialTag={() => setDiscoverTag('')}
              onOpenVideo={handleOpenVideoList}
              onSelectProfile={handleOpenProfile}
              onFollow={handleFollow}
            />
          </div>
        )}

        {navTab === 'inbox' && (
          <div className="flex-1 h-full min-w-0">
            <InboxView
              currentUser={currentUser}
              onRequireAuth={() => setAuthModalOpen(true)}
              onOpenVideoById={handleOpenVideoById}
              onSelectProfile={handleOpenProfile}
              onUnreadCountChange={setUnreadCount}
            />
          </div>
        )}

        {navTab === 'profile' && (
          <div className="flex-1 h-full min-w-0">
            <ProfileView
              username={profileUsername}
              currentUser={currentUser}
              onBack={profileUsername ? () => setProfileUsername(null) : undefined}
              onRequireAuth={() => setAuthModalOpen(true)}
              onOpenVideo={handleOpenVideoList}
              onFollow={handleFollow}
              onUserUpdated={(updated) => setCurrentUser(updated)}
              onLogout={handleLogout}
              onVideoDeleted={(deletedId) => {
                setVideos((prev) => prev.filter((v) => v.id !== deletedId));
                showToast('Video deleted');
              }}
            />
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation Bar (Home, Discover, Upload, Inbox, Profile) */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-[#070709]/95 backdrop-blur-md border-t border-white/10 pb-safe">
        <div className="grid grid-cols-5 items-center h-[58px]">
          <button
            type="button"
            onClick={() => {
              setNavTab('home');
              setProfileUsername(null);
            }}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 ${
              navTab === 'home' ? 'text-white' : 'text-zinc-500'
            }`}
          >
            <Home className={`w-5 h-5 ${navTab === 'home' ? 'fill-white/15' : ''}`} />
            <span className="text-[10px] font-medium tracking-tight">Home</span>
          </button>

          <button
            type="button"
            onClick={() => setNavTab('discover')}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 ${
              navTab === 'discover' ? 'text-white' : 'text-zinc-500'
            }`}
          >
            <Compass className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">Discover</span>
          </button>

          {/* Center Upload / Record CTA */}
          <button
            type="button"
            onClick={() => {
              if (!currentUser) {
                setAuthModalOpen(true);
              } else {
                setUploadModalOpen(true);
              }
            }}
            aria-label="Upload or record video"
            className="flex items-center justify-center min-h-[44px]"
          >
            <div className="relative w-12 h-8 flex items-center justify-center">
              <span className="absolute inset-y-0 left-0.5 w-10 rounded-lg bg-[#00E5CC]" />
              <span className="absolute inset-y-0 right-0.5 w-10 rounded-lg bg-[#FF2E54]" />
              <span className="relative w-10 h-8 rounded-lg bg-white text-black flex items-center justify-center shadow">
                <Plus className="w-5 h-5 stroke-[2.5]" />
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setNavTab('inbox')}
            className={`relative flex flex-col items-center justify-center min-h-[44px] gap-0.5 ${
              navTab === 'inbox' ? 'text-white' : 'text-zinc-500'
            }`}
          >
            <div className="relative">
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#FF2E54] text-[10px] font-mono-tabular font-bold text-white flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </div>
            <span className="text-[10px] font-medium tracking-tight">Inbox</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setProfileUsername(null);
              setNavTab('profile');
            }}
            className={`flex flex-col items-center justify-center min-h-[44px] gap-0.5 ${
              navTab === 'profile' ? 'text-white' : 'text-zinc-500'
            }`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium tracking-tight">Profile</span>
          </button>
        </div>
      </nav>

      {/* Mobile Comments Bottom Sheet (also usable on lg < xl) */}
      <div className="xl:hidden">
        <CommentsDrawer
          video={commentsVideo}
          isOpen={Boolean(commentsVideo)}
          onClose={() => setCommentsVideo(null)}
          variant="sheet"
          currentUser={currentUser}
          onRequireAuth={() => setAuthModalOpen(true)}
          onCommentAdded={(vid, newCount) => {
            setVideos((prev) =>
              prev.map((v) => (v.id === vid ? { ...v, commentsCount: newCount } : v))
            );
            setCommentsVideo((prev) =>
              prev && prev.id === vid ? { ...prev, commentsCount: newCount } : prev
            );
          }}
          onSelectProfile={handleOpenProfile}
        />
      </div>

      {/* Share Sheet */}
      <ShareSheet
        video={shareVideo}
        onClose={() => setShareVideo(null)}
        onSelectProfile={handleOpenProfile}
      />

      {/* Auth Modal */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={handleAuthenticated}
      />

      {/* Upload / Camera Record Studio */}
      <UploadStudioModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        currentUser={currentUser}
        onRequireAuth={() => setAuthModalOpen(true)}
        onPublished={(newVideo) => {
          setVideos((prev) => [newVideo, ...prev]);
          setNavTab('home');
          setFeedTab('foryou');
          setActiveIndex(0);
          window.requestAnimationFrame(() => {
            feedContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
          });
          showToast('Video published to Velo');
        }}
      />

      {/* Action Confirmation Toast */}
      {toast && (
        <div className="fixed top-14 lg:top-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#191922]/95 border border-white/15 text-xs font-medium text-white shadow-xl backdrop-blur-md pointer-events-none">
          {toast}
        </div>
      )}
    </div>
  );
}
