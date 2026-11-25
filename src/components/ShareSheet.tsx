import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, Share2, User, X } from 'lucide-react';
import type { VideoItem } from '../types';

interface ShareSheetProps {
  video: VideoItem | null;
  onClose: () => void;
  onSelectProfile: (username: string) => void;
}

export function ShareSheet({ video, onClose, onSelectProfile }: ShareSheetProps) {
  const [copied, setCopied] = useState(false);

  if (!video) return null;

  const shareUrl = `${window.location.origin}/?v=${encodeURIComponent(video.id)}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Velo · @${video.creator.username}`,
          text: video.caption,
          url: shareUrl,
        });
        onClose();
      } catch {
        // User cancelled native share
      }
    } else {
      await handleCopy();
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end lg:items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/70 backdrop-blur-xs"
        />
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 w-full max-w-md bg-[#141419] border border-white/15 rounded-t-3xl lg:rounded-2xl p-5 pb-safe"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display font-semibold text-base text-white">Share video</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close share sheet"
              className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-full text-zinc-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-4">
            <button
              type="button"
              onClick={handleCopy}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#1D1D24] hover:bg-[#25252E] transition-colors min-h-[44px]"
            >
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                {copied ? <Check className="w-5 h-5 text-[#00E5CC]" /> : <Copy className="w-5 h-5 text-white" />}
              </div>
              <span className="text-xs font-medium text-white">
                {copied ? 'Copied' : 'Copy link'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleNativeShare}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#1D1D24] hover:bg-[#25252E] transition-colors min-h-[44px]"
            >
              <div className="w-11 h-11 rounded-full bg-[#FF2E54]/20 flex items-center justify-center">
                <Share2 className="w-5 h-5 text-[#FF2E54]" />
              </div>
              <span className="text-xs font-medium text-white">Share via</span>
            </button>

            <a
              href={video.streamUrl}
              download={`velo-${video.id}.mp4`}
              className="flex flex-col items-center gap-2 p-3 rounded-xl bg-[#1D1D24] hover:bg-[#25252E] transition-colors min-h-[44px]"
            >
              <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center">
                <Download className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-medium text-white">Download</span>
            </a>
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectProfile(video.creator.username);
              onClose();
            }}
            className="w-full py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center gap-2 text-sm font-medium text-white transition-colors"
          >
            <User className="w-4 h-4 text-zinc-400" />
            <span>View @{video.creator.username}&apos;s profile</span>
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
