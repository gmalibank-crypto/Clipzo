import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart, Send, X } from 'lucide-react';
import type { CommentItem, UserProfileSummary, VideoItem } from '../types';
import { apiFetch, formatCompactCount, formatRelativeTime } from '../lib/api';
import { Avatar } from './Avatar';

interface CommentsDrawerProps {
  video: VideoItem | null;
  isOpen: boolean;
  onClose?: () => void;
  variant: 'sheet' | 'panel';
  currentUser: UserProfileSummary | null;
  onRequireAuth: () => void;
  onCommentAdded: (videoId: string, newCount: number) => void;
  onSelectProfile: (username: string) => void;
}

export function CommentsDrawer({
  video,
  isOpen,
  onClose,
  variant,
  currentUser,
  onRequireAuth,
  onCommentAdded,
  onSelectProfile,
}: CommentsDrawerProps) {
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!video || !isOpen) return;
    let cancelled = false;
    setLoading(true);
    setError('');

    apiFetch<{ comments: CommentItem[] }>(`/api/videos/${video.id}/comments`)
      .then((res) => {
        if (!cancelled) setComments(res.comments);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load comments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [video?.id, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!video) return;
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    const body = text.trim();
    if (!body || submitting) return;

    setSubmitting(true);
    setError('');
    try {
      const res = await apiFetch<{ comment: CommentItem; commentsCount: number }>(
        `/api/videos/${video.id}/comments`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        }
      );
      setComments((prev) => [res.comment, ...prev]);
      setText('');
      onCommentAdded(video.id, res.commentsCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not post comment');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLikeComment = async (commentId: string) => {
    if (!currentUser) {
      onRequireAuth();
      return;
    }
    try {
      const res = await apiFetch<{ isLiked: boolean; likesCount: number }>(
        `/api/comments/${commentId}/like`,
        { method: 'POST' }
      );
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId ? { ...c, isLiked: res.isLiked, likesCount: res.likesCount } : c
        )
      );
    } catch {
      // Ignore transient error
    }
  };

  const content = (
    <div className="flex flex-col h-full bg-[#111115] text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <span className="font-display font-semibold text-sm tracking-wide">
          <span className="font-mono-tabular mr-1.5">
            {video ? formatCompactCount(video.commentsCount) : 0}
          </span>
          Comments
        </span>
        {variant === 'sheet' && onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close comments"
            className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Comment List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading && (
          <div className="py-10 text-center text-sm text-zinc-400">Loading comments...</div>
        )}
        {!loading && error && (
          <div className="py-6 text-center text-sm text-[#FF2E54]">{error}</div>
        )}
        {!loading && !error && comments.length === 0 && (
          <div className="py-12 text-center text-sm text-zinc-400">
            No comments yet. Start the conversation below.
          </div>
        )}
        {!loading &&
          comments.map((comment) => (
            <div key={comment.id} className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => onSelectProfile(comment.author.username)}
                className="shrink-0"
              >
                <Avatar
                  src={comment.author.avatarUrl}
                  name={comment.author.displayName}
                  size="sm"
                  verified={comment.author.verified}
                />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                  <button
                    type="button"
                    onClick={() => onSelectProfile(comment.author.username)}
                    className="font-semibold text-zinc-200 hover:underline truncate"
                  >
                    @{comment.author.username}
                  </button>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular shrink-0">
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-white/95 mt-0.5 leading-snug break-words">
                  {comment.body}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleLikeComment(comment.id)}
                aria-label="Like comment"
                className="min-w-[40px] min-h-[40px] flex flex-col items-center justify-center gap-0.5 text-zinc-400 hover:text-white shrink-0"
              >
                <Heart
                  className={`w-4 h-4 ${
                    comment.isLiked ? 'text-[#FF2E54] fill-[#FF2E54]' : ''
                  }`}
                />
                <span className="font-mono-tabular text-[11px]">
                  {comment.likesCount > 0 ? formatCompactCount(comment.likesCount) : ''}
                </span>
              </button>
            </div>
          ))}
      </div>

      {/* Comment Composer */}
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-white/10 bg-[#111115] pb-safe shrink-0"
      >
        <div className="flex items-center gap-2">
          <Avatar
            src={currentUser?.avatarUrl}
            name={currentUser?.displayName || 'You'}
            size="xs"
          />
          <input
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={currentUser ? 'Add a comment...' : 'Sign in to comment...'}
            maxLength={300}
            className="flex-1 bg-[#1C1C23] border border-white/10 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/30"
          />
          <button
            type="submit"
            disabled={submitting || (!text.trim() && Boolean(currentUser))}
            aria-label="Post comment"
            className="min-w-[44px] min-h-[44px] rounded-xl bg-[#FF2E54] hover:bg-[#ff4265] disabled:opacity-40 text-white flex items-center justify-center transition-colors shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );

  if (variant === 'panel') {
    return (
      <div className="h-full border-l border-white/10 bg-[#111115] flex flex-col overflow-hidden">
        {content}
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/65 backdrop-blur-xs"
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
            className="relative z-10 h-[68dvh] max-h-[640px] w-full rounded-t-3xl overflow-hidden border-t border-white/15 bg-[#111115] flex flex-col"
          >
            <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mt-2.5 mb-0.5 shrink-0" />
            <div className="flex-1 min-h-0">{content}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
