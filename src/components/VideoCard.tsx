import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bookmark,
  Check,
  Heart,
  MessageCircle,
  Music2,
  Pause,
  Play,
  Plus,
  Share2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { VideoItem } from '../types';
import { formatCompactCount } from '../lib/api';
import { Avatar } from './Avatar';

interface HeartBurst {
  id: number;
  x: number;
  y: number;
  rotate: number;
}

interface VideoCardProps {
  video: VideoItem;
  isActive: boolean;
  isPreload: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onLike: (videoId: string, forceLike?: boolean) => void;
  onSave: (videoId: string) => void;
  onOpenComments: (video: VideoItem) => void;
  onShare: (video: VideoItem) => void;
  onFollow: (creatorId: string) => void;
  onSelectProfile: (username: string) => void;
  onSelectHashtag: (tag: string) => void;
  onWatchEvent: (videoId: string, watchMs: number, completed: boolean) => void;
  currentUserId?: string;
}

export function VideoCard({
  video,
  isActive,
  isPreload,
  muted,
  onToggleMute,
  onLike,
  onSave,
  onOpenComments,
  onShare,
  onFollow,
  onSelectProfile,
  onSelectHashtag,
  onWatchEvent,
  currentUserId,
}: VideoCardProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tapTimerRef = useRef<number | null>(null);
  const watchStartRef = useRef<number | null>(null);
  const completedRef = useRef(false);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showPlayGlyph, setShowPlayGlyph] = useState<'play' | 'pause' | null>(null);
  const [heartBursts, setHeartBursts] = useState<HeartBurst[]>([]);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [hasVideoError, setHasVideoError] = useState(false);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (isActive) {
      el.currentTime = 0;
      completedRef.current = false;
      watchStartRef.current = Date.now();
      const playPromise = el.play();
      if (playPromise && typeof playPromise.then === 'function') {
        playPromise
          .then(() => setIsPlaying(true))
          .catch(() => {
            // Browser autoplay policy fallback: keep paused ready for user tap
            setIsPlaying(false);
          });
      }
    } else {
      if (watchStartRef.current !== null) {
        const elapsed = Date.now() - watchStartRef.current;
        if (elapsed > 600) {
          onWatchEvent(video.id, elapsed, completedRef.current);
        }
        watchStartRef.current = null;
      }
      el.pause();
      setIsPlaying(false);
    }
  }, [isActive, video.id, onWatchEvent]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) window.clearTimeout(tapTimerRef.current);
    };
  }, []);

  const togglePlayPause = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      void el.play().then(() => setIsPlaying(true)).catch(() => {});
      setShowPlayGlyph('play');
    } else {
      el.pause();
      setIsPlaying(false);
      setShowPlayGlyph('pause');
    }
    window.setTimeout(() => setShowPlayGlyph(null), 550);
  };

  const handleSurfaceClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tapTimerRef.current !== null) {
      // Double tap detected: spawn crimson heart burst & like
      window.clearTimeout(tapTimerRef.current);
      tapTimerRef.current = null;

      const burstId = Date.now() + Math.random();
      const rotate = Math.round((Math.random() - 0.5) * 28);
      setHeartBursts((prev) => [...prev.slice(-4), { id: burstId, x, y, rotate }]);
      window.setTimeout(() => {
        setHeartBursts((prev) => prev.filter((b) => b.id !== burstId));
      }, 750);

      onLike(video.id, true);
    } else {
      tapTimerRef.current = window.setTimeout(() => {
        tapTimerRef.current = null;
        togglePlayPause();
      }, 220);
    }
  };

  const handleTimeUpdate = () => {
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const pct = (el.currentTime / el.duration) * 100;
    setProgress(pct);
    if (pct >= 88 && !completedRef.current) {
      completedRef.current = true;
    }
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (!el || !el.duration) return;
    const pct = Number(e.target.value);
    el.currentTime = (pct / 100) * el.duration;
    setProgress(pct);
  };

  const isOwnVideo = currentUserId === video.creator.id;

  return (
    <div className="relative w-full h-full bg-[#070709] overflow-hidden select-none">
      {/* Poster / Fallback Surface */}
      {video.posterUrl ? (
        <img
          src={video.posterUrl}
          alt={video.caption}
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#16161D] via-[#0C0C10] to-[#070709]" />
      )}

      {/* HTML5 Video Player */}
      {!hasVideoError && (
        <video
          ref={videoRef}
          src={isActive || isPreload ? video.streamUrl : undefined}
          poster={video.posterUrl || undefined}
          playsInline
          loop
          muted={muted}
          preload={isActive ? 'auto' : isPreload ? 'metadata' : 'none'}
          onTimeUpdate={handleTimeUpdate}
          onEnded={() => {
            completedRef.current = true;
          }}
          onError={() => setHasVideoError(true)}
          className="relative z-10 w-full h-full object-cover"
        />
      )}

      {/* Tap / Double-Tap Interaction Layer */}
      <div
        onClick={handleSurfaceClick}
        className="absolute inset-0 z-20 cursor-pointer"
        aria-label={`Video by ${video.creator.displayName}. Tap to pause or double tap to like.`}
      >
        {/* Top subtle gradient for header legibility */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/65 via-black/25 to-transparent" />

        {/* Bottom measured contrast scrim */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-t from-black/90 via-black/45 to-transparent" />

        {/* Center Play/Pause Visual Feedback */}
        <AnimatePresence>
          {(!isPlaying || showPlayGlyph) && (
            <motion.div
              key={showPlayGlyph || 'paused'}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.15 }}
              transition={{ duration: 0.18 }}
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-md border border-white/15 flex items-center justify-center">
                {showPlayGlyph === 'play' ? (
                  <Play className="w-7 h-7 text-white fill-white translate-x-0.5" />
                ) : showPlayGlyph === 'pause' || !isPlaying ? (
                  <Pause className="w-7 h-7 text-white fill-white" />
                ) : null}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Double-tap floating hearts */}
        <AnimatePresence>
          {heartBursts.map((burst) => (
            <motion.div
              key={burst.id}
              initial={{ opacity: 0, scale: 0.4, y: 0, rotate: burst.rotate }}
              animate={{ opacity: 1, scale: 1.25, y: -36, rotate: burst.rotate }}
              exit={{ opacity: 0, scale: 1.5, y: -76 }}
              transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
              style={{ left: burst.x - 42, top: burst.y - 42 }}
              className="pointer-events-none absolute z-30"
            >
              <Heart className="w-20 h-20 text-[#FF2E54] fill-[#FF2E54] drop-shadow-[0_8px_24px_rgba(255,46,84,0.55)]" />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Sound Mute/Unmute Floating Control */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleMute();
        }}
        aria-label={muted ? 'Unmute video' : 'Mute video'}
        className="absolute top-16 right-3 lg:top-4 lg:right-4 z-30 min-w-[44px] min-h-[44px] rounded-full bg-black/45 backdrop-blur-md border border-white/15 flex items-center justify-center text-white hover:bg-black/65 transition-colors"
      >
        {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Right-Side Vertical Action Rail */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute right-2.5 bottom-20 lg:bottom-8 z-30 flex flex-col items-center gap-3.5"
      >
        {/* Creator Avatar + Quick Follow */}
        <div className="relative mb-1">
          <button
            type="button"
            onClick={() => onSelectProfile(video.creator.username)}
            aria-label={`View ${video.creator.displayName} profile`}
            className="block rounded-full ring-2 ring-white/80 hover:scale-105 transition-transform"
          >
            <Avatar
              src={video.creator.avatarUrl}
              name={video.creator.displayName}
              size="md"
            />
          </button>
          {!isOwnVideo && (
            <button
              type="button"
              onClick={() => onFollow(video.creator.id)}
              aria-label={video.creator.isFollowing ? 'Unfollow creator' : 'Follow creator'}
              className={`absolute -bottom-2 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center border border-[#070709] transition-colors ${
                video.creator.isFollowing
                  ? 'bg-[#19191F] text-white'
                  : 'bg-[#FF2E54] text-white hover:bg-[#ff4265]'
              }`}
            >
              {video.creator.isFollowing ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              )}
            </button>
          )}
        </div>

        {/* Like Button */}
        <button
          type="button"
          onClick={() => onLike(video.id)}
          aria-label={video.isLiked ? 'Unlike video' : 'Like video'}
          className="flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center group"
        >
          <motion.div
            animate={video.isLiked ? { scale: [1, 1.32, 1] } : { scale: 1 }}
            transition={{ duration: 0.25 }}
            className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center group-active:scale-90 transition-transform"
          >
            <Heart
              className={`w-7 h-7 transition-colors ${
                video.isLiked
                  ? 'text-[#FF2E54] fill-[#FF2E54] drop-shadow-[0_0_12px_rgba(255,46,84,0.45)]'
                  : 'text-white fill-white/10'
              }`}
            />
          </motion.div>
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactCount(video.likesCount)}
          </span>
        </button>

        {/* Comment Button */}
        <button
          type="button"
          onClick={() => onOpenComments(video)}
          aria-label="Open comments"
          className="flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center group"
        >
          <div className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center group-active:scale-90 transition-transform">
            <MessageCircle className="w-7 h-7 text-white fill-white/10" />
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactCount(video.commentsCount)}
          </span>
        </button>

        {/* Save / Bookmark Button */}
        <button
          type="button"
          onClick={() => onSave(video.id)}
          aria-label={video.isSaved ? 'Remove from saved' : 'Save video'}
          className="flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center group"
        >
          <motion.div
            animate={video.isSaved ? { scale: [1, 1.25, 1] } : { scale: 1 }}
            transition={{ duration: 0.2 }}
            className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center group-active:scale-90 transition-transform"
          >
            <Bookmark
              className={`w-7 h-7 transition-colors ${
                video.isSaved ? 'text-[#F59E0B] fill-[#F59E0B]' : 'text-white fill-white/10'
              }`}
            />
          </motion.div>
          <span className="font-mono-tabular text-xs font-semibold text-white drop-shadow">
            {formatCompactCount(video.savesCount)}
          </span>
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={() => onShare(video)}
          aria-label="Share video"
          className="flex flex-col items-center gap-0.5 min-w-[44px] min-h-[44px] justify-center group"
        >
          <div className="w-11 h-11 rounded-full bg-black/35 backdrop-blur-sm flex items-center justify-center group-active:scale-90 transition-transform">
            <Share2 className="w-6 h-6 text-white" />
          </div>
          <span className="font-mono-tabular text-[11px] font-medium text-white drop-shadow">
            Share
          </span>
        </button>

        {/* Spinning Soundtrack Disc */}
        <div
          className={`mt-1 w-10 h-10 rounded-full bg-gradient-to-tr from-[#18181F] via-[#2D2D38] to-[#121216] p-1.5 border border-white/20 shadow-lg ${
            isPlaying ? 'animate-spin-disc' : 'animate-spin-disc-paused'
          }`}
          title={video.soundtrackTitle}
        >
          <div className="w-full h-full rounded-full overflow-hidden border border-white/25">
            <Avatar src={video.creator.avatarUrl} name={video.creator.displayName} size="xs" />
          </div>
        </div>
      </div>

      {/* Bottom-Left Creator Info, Caption, Hashtags & Soundtrack */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute left-3.5 right-20 bottom-16 lg:bottom-6 z-30 flex flex-col gap-2"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSelectProfile(video.creator.username)}
            className="font-display font-bold text-base text-white hover:underline tracking-wide text-left"
          >
            @{video.creator.username}
          </button>
          <span className="text-xs text-white/65">·</span>
          <span className="text-xs text-white/75 truncate">{video.category}</span>
        </div>

        <div className="text-sm text-white/95 leading-snug">
          <p className={captionExpanded ? '' : 'line-clamp-2'}>
            {video.caption}{' '}
            {video.hashtags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => onSelectHashtag(tag)}
                className="inline font-semibold text-white hover:text-[#00E5CC] mr-1.5 transition-colors"
              >
                #{tag}
              </button>
            ))}
          </p>
          {video.caption.length > 85 && (
            <button
              type="button"
              onClick={() => setCaptionExpanded((v) => !v)}
              className="text-xs font-semibold text-white/70 hover:text-white mt-0.5"
            >
              {captionExpanded ? 'Show less' : 'More'}
            </button>
          )}
        </div>

        {/* Soundtrack & SFX unboxed ticker */}
        <div className="flex items-center gap-2 text-xs text-white/90 font-medium">
          <Music2 className="w-3.5 h-3.5 shrink-0 text-[#00E5CC]" />
          <span className="truncate">{video.soundtrackTitle}</span>
          {video.sfxTags.length > 0 && (
            <>
              <span className="text-white/50">·</span>
              <span className="text-white/70 truncate">{video.sfxTags.join(' · ')}</span>
            </>
          )}
        </div>
      </div>

      {/* Bottom Interactive Progress Scrub Bar */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-[58px] lg:bottom-0 z-30 px-0 group"
      >
        <div className="relative h-3 flex items-end">
          <div className="w-full h-[2px] group-hover:h-1 bg-white/20 transition-all overflow-hidden">
            <div
              className="h-full bg-white transition-[width] duration-75"
              style={{ width: `${progress}%` }}
            />
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={0.5}
            value={progress}
            onChange={handleScrub}
            aria-label="Seek video"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
