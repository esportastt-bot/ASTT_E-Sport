import React, { useState } from 'react';

interface UserAvatarProps {
  avatar?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
};

export const UserAvatar: React.FC<UserAvatarProps> = ({
  avatar,
  name,
  size = 'sm',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const isUrl = Boolean(avatar && (avatar.startsWith('http://') || avatar.startsWith('https://')));

  if (isUrl && !imgFailed) {
    return (
      <img
        src={avatar}
        alt={name}
        onError={() => setImgFailed(true)}
        className={`${sizeClass} rounded-full object-cover shrink-0 border border-slate-700 bg-slate-800`}
        referrerPolicy="no-referrer"
      />
    );
  }

  const fallbackText =
    avatar && !isUrl ? avatar : (name?.trim().charAt(0).toUpperCase() || '👤');

  return (
    <span
      className={`${sizeClass} rounded-full bg-slate-800 border border-slate-700 inline-flex items-center justify-center font-semibold text-slate-200 shrink-0 select-none`}
      aria-label={name}
    >
      {fallbackText}
    </span>
  );
};
