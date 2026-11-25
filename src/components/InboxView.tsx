import { useEffect, useState } from 'react';
import { Bell, CheckCheck, Heart, MessageCircle, UserPlus } from 'lucide-react';
import type { NotificationItem, UserProfileSummary } from '../types';
import { apiFetch, formatRelativeTime } from '../lib/api';
import { Avatar } from './Avatar';

interface InboxViewProps {
  currentUser: UserProfileSummary | null;
  onRequireAuth: () => void;
  onOpenVideoById: (videoId: string) => void;
  onSelectProfile: (username: string) => void;
  onUnreadCountChange: (count: number) => void;
}

export function InboxView({
  currentUser,
  onRequireAuth,
  onOpenVideoById,
  onSelectProfile,
  onUnreadCountChange,
}: InboxViewProps) {
  const [filter, setFilter] = useState<'all' | 'like' | 'comment' | 'follow'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentUser) {
      setItems([]);
      return;
    }
    setLoading(true);
    apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>('/api/notifications')
      .then((res) => {
        setItems(res.notifications);
        onUnreadCountChange(res.unreadCount);
      })
      .finally(() => setLoading(false));
  }, [currentUser?.id, onUnreadCountChange]);

  const handleMarkAllRead = async () => {
    if (!currentUser) return;
    await apiFetch('/api/notifications/read', { method: 'POST' });
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    onUnreadCountChange(0);
  };

  if (!currentUser) {
    return (
      <div className="h-full flex items-center justify-center p-6 bg-[#070709]">
        <div className="max-w-sm w-full text-center p-6 rounded-2xl bg-[#111116] border border-white/10">
          <Bell className="w-10 h-10 text-[#FF2E54] mx-auto mb-3" />
          <h2 className="font-display font-bold text-lg text-white mb-1">Your activity inbox</h2>
          <p className="text-sm text-zinc-400 mb-5">
            Sign in to view likes, comments, and new followers on your videos.
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

  const filtered = filter === 'all' ? items : items.filter((i) => i.type === filter);

  return (
    <div className="h-full overflow-y-auto bg-[#070709] pb-24 lg:pb-8">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-5 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="font-display font-bold text-xl text-white">Inbox</h1>
          {items.some((i) => !i.isRead) && (
            <button
              type="button"
              onClick={handleMarkAllRead}
              className="flex items-center gap-1.5 text-xs font-medium text-[#00E5CC] hover:underline"
            >
              <CheckCheck className="w-4 h-4" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {(
            [
              { id: 'all', label: 'All activity' },
              { id: 'like', label: 'Likes' },
              { id: 'comment', label: 'Comments' },
              { id: 'follow', label: 'Followers' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                filter === tab.id
                  ? 'bg-white text-black'
                  : 'bg-[#14141A] text-zinc-300 hover:text-white border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Notification Rows */}
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Loading notifications...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center rounded-2xl border border-white/10 bg-[#101015]">
            <p className="text-sm text-zinc-400">No notifications in this category yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/10 rounded-2xl bg-[#101015] border border-white/10 overflow-hidden">
            {filtered.map((n) => {
              const Icon =
                n.type === 'like'
                  ? Heart
                  : n.type === 'comment'
                  ? MessageCircle
                  : UserPlus;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    if (n.videoId) {
                      onOpenVideoById(n.videoId);
                    } else {
                      onSelectProfile(n.actor.username);
                    }
                  }}
                  className={`w-full px-4 py-3.5 flex items-center gap-3 text-left hover:bg-white/5 transition-colors ${
                    !n.isRead ? 'bg-white/[0.03]' : ''
                  }`}
                >
                  <div className="relative shrink-0">
                    <Avatar
                      src={n.actor.avatarUrl}
                      name={n.actor.displayName}
                      size="md"
                      verified={n.actor.verified}
                    />
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[#191922] border border-white/15 flex items-center justify-center">
                      <Icon
                        className={`w-3 h-3 ${
                          n.type === 'like'
                            ? 'text-[#FF2E54] fill-[#FF2E54]'
                            : n.type === 'comment'
                            ? 'text-[#00E5CC]'
                            : 'text-white'
                        }`}
                      />
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white leading-snug">
                      <span className="font-semibold">@{n.actor.username}</span>{' '}
                      <span className="text-zinc-300">{n.message}</span>
                    </p>
                    <span className="font-mono-tabular text-xs text-zinc-500">
                      {formatRelativeTime(n.createdAt)}
                    </span>
                  </div>

                  {n.posterUrl && (
                    <img
                      src={n.posterUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="w-11 h-14 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
