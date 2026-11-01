import React from 'react';

interface AvatarProps {
  name: string;
  uniqueId?: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  showOnlineIndicator?: boolean;
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  uniqueId,
  avatarUrl,
  size = 'md',
  isOnline = false,
  showOnlineIndicator = false,
}) => {
  // Generate consistent color based on name/ID
  const colors = [
    'from-blue-600 to-indigo-700',
    'from-cyan-600 to-blue-700',
    'from-emerald-600 to-teal-700',
    'from-violet-600 to-purple-700',
    'from-amber-600 to-orange-700',
    'from-rose-600 to-pink-700',
  ];

  const seed = (name || uniqueId || 'User').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const bgGradient = colors[seed % colors.length];

  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-xl',
  };

  const indicatorSizeClasses = {
    sm: 'w-2 h-2 ring-1',
    md: 'w-2.5 h-2.5 ring-2',
    lg: 'w-3 h-3 ring-2',
    xl: 'w-3.5 h-3.5 ring-2',
  };

  const initials = (name || 'CC')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  return (
    <div className="relative inline-block shrink-0">
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover ring-1 ring-white/10`}
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br ${bgGradient} text-white font-semibold flex items-center justify-center shadow-inner tracking-wider select-none`}
        >
          {initials || 'CC'}
        </div>
      )}

      {showOnlineIndicator && (
        <span
          className={`absolute bottom-0 right-0 ${indicatorSizeClasses[size]} rounded-full ring-[#151B23] ${
            isOnline ? 'bg-emerald-500' : 'bg-slate-500'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};
