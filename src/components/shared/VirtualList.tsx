import { forwardRef, useImperativeHandle, type ReactNode } from 'react'
import { useVirtualList, type UseVirtualListOptions } from '../../hooks/useVirtualList'

export type VirtualListProps<T> = UseVirtualListOptions<T> & {
  className?: string
  innerClassName?: string
  itemClassName?: string
  renderItem: (item: T, index: number) => ReactNode
}

export type VirtualListHandle = {
  scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => void
  scrollToBottom: () => void
}

function VirtualListInner<T>(
  {
    items,
    getItemKey,
    estimateSize = 50,
    overscan = 5,
    initialScrollIndex,
    followOutput = 'never',
    bottomThreshold = 50,
    className = '',
    innerClassName = '',
    itemClassName = '',
    renderItem,
  }: VirtualListProps<T>,
  ref: React.ForwardedRef<VirtualListHandle>
) {
  const { virtualizer, scrollContainerRef, scrollToBottom } = useVirtualList({
    items,
    getItemKey,
    estimateSize,
    overscan,
    initialScrollIndex,
    followOutput,
    bottomThreshold,
  })

  useImperativeHandle(ref, () => ({
    scrollToIndex: (index: number, options?: { align?: 'start' | 'center' | 'end' }) => {
      virtualizer.scrollToIndex(index, options)
    },
    scrollToBottom,
  }), [virtualizer, scrollToBottom])

  const virtualItems = virtualizer.getVirtualItems()
  const totalSize = virtualizer.getTotalSize()

  return (
    <div className={`relative min-h-0 flex-1 ${className}`}>
      <div
        ref={scrollContainerRef as React.RefObject<HTMLDivElement>}
        className="absolute inset-0 overflow-y-auto"
      >
        <div
          className={innerClassName}
          style={{
            height: totalSize,
            position: 'relative',
          }}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index]
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                ref={virtualizer.measureElement}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className={itemClassName}>
                  {renderItem(item, virtualItem.index)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Use type assertion for generic forwardRef
export const VirtualList = forwardRef(VirtualListInner) as <T>(
  props: VirtualListProps<T> & { ref?: React.ForwardedRef<VirtualListHandle> }
) => ReactNode
