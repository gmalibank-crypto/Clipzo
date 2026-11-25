import { useState } from 'react';
import { BadgeCheck } from 'lucide-react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  verified?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-24 h-24 text-2xl',
};

export function Avatar({ src, name, size = 'md', verified = false, className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false);
  const initial = (name || '?').trim().charAt(0).toUpperCase();

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      <div
        className={`${SIZE_CLASSES[size]} rounded-full overflow-hidden bg-gradient-to-br from-[#23232B] to-[#121216] border border-white/15 flex items-center justify-center font-display font-bold text-white select-none`}
      >
        {src && !imgError ? (
          <img
            src={src}
            alt={`${name} avatar`}
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      {verified && size !== 'xs' && (
        <span
          className="absolute -bottom-0.5 -right-0.5 bg-[#070709] rounded-full p-0.5"
          aria-label="Verified creator"
        >
          <BadgeCheck className="w-3.5 h-3.5 text-[#00E5CC] fill-[#00E5CC]/15" />
        </span>
      )}
    </div>
  );
}
