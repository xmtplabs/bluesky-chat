interface DateDividerProps {
  timestamp: number
}

/**
 * Date divider - shows date separators between messages on different days
 */
export function DateDivider({ timestamp }: DateDividerProps) {
  const date = new Date(timestamp)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  let dateLabel: string
  if (date.toDateString() === today.toDateString()) {
    dateLabel = 'Today'
  } else if (date.toDateString() === yesterday.toDateString()) {
    dateLabel = 'Yesterday'
  } else {
    dateLabel = date.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric'
    })
  }

  return (
    <div className="flex items-center justify-center py-4">
      <div className="px-3 py-1 bg-[var(--color-surface-secondary)] rounded-full">
        <span className="text-[12px] font-medium text-[var(--color-text-secondary)]">
          {dateLabel}
        </span>
      </div>
    </div>
  )
}
