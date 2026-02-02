import { useState, useEffect } from 'react'

interface AvatarProps {
  /** Image URL */
  src?: string | null
  /** Fallback text (first char used) */
  fallback?: string
  /** Pixel size or named size */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | number
  /** Avatar type affects fallback color */
  variant?: 'user' | 'group'
  /** Additional classes */
  className?: string
}

const sizeMap = {
  xs: 20,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 80,
  '2xl': 96
} as const

const textSizeMap = {
  xs: 'text-[10px]',
  sm: 'text-[12px]',
  md: 'text-[14px]',
  lg: 'text-[15px]',
  xl: 'text-2xl',
  '2xl': 'text-3xl'
} as const

const iconSizeMap = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-6 h-6',
  xl: 'w-10 h-10',
  '2xl': 'w-12 h-12'
} as const

/**
 * Universal avatar component with image and fallback support.
 *
 * Size presets:
 * - xs: 20px - Tiny chips
 * - sm: 32px - Selected user chips
 * - md: 40px - Headers, list items
 * - lg: 48px - Conversation list, requests
 * - xl: 80px - Profile cards
 * - 2xl: 96px - Profile modal
 * - number: Custom pixel size
 */
export function Avatar({ src, fallback = '?', size = 'md', variant = 'user', className = '' }: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const pixels = typeof size === 'number' ? size : sizeMap[size]

  // Reset error state when src changes
  useEffect(() => {
    setImgError(false)
  }, [src])

  // For named sizes, use predefined text classes
  const textClass = typeof size === 'number'
    ? getTextSizeForPixels(pixels)
    : textSizeMap[size]

  const iconClass = typeof size === 'number'
    ? getIconSizeForPixels(pixels)
    : iconSizeMap[size]

  const bgColor = variant === 'group'
    ? 'bg-[var(--color-avatar-group)]'
    : 'bg-[var(--color-avatar-dm)]'

  // Show image if src is valid and hasn't errored
  if (src && !imgError) {
    return (
      <img
        src={src}
        alt={fallback}
        width={pixels}
        height={pixels}
        loading="lazy"
        onError={() => setImgError(true)}
        className={`rounded-full object-cover ${className}`}
        style={{ width: pixels, height: pixels }}
      />
    )
  }

  // Group fallback: show group icon
  if (variant === 'group') {
    return (
      <div
        className={`rounded-full ${bgColor} flex items-center justify-center text-white ${className}`}
        style={{ width: pixels, height: pixels }}
      >
        <svg className={iconClass} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
      </div>
    )
  }

  // User fallback: show initial
  return (
    <div
      className={`rounded-full ${bgColor} flex items-center justify-center text-white font-semibold ${textClass} ${className}`}
      style={{ width: pixels, height: pixels }}
    >
      {fallback[0]?.toUpperCase() || '?'}
    </div>
  )
}

function getTextSizeForPixels(pixels: number): string {
  if (pixels <= 20) return 'text-[10px]'
  if (pixels <= 32) return 'text-[12px]'
  if (pixels <= 44) return 'text-[14px]'
  if (pixels <= 48) return 'text-[15px]'
  if (pixels <= 80) return 'text-2xl'
  return 'text-3xl'
}

function getIconSizeForPixels(pixels: number): string {
  if (pixels <= 20) return 'w-3 h-3'
  if (pixels <= 32) return 'w-4 h-4'
  if (pixels <= 44) return 'w-5 h-5'
  if (pixels <= 48) return 'w-6 h-6'
  if (pixels <= 80) return 'w-10 h-10'
  return 'w-12 h-12'
}
