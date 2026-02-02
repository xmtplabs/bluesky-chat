import { useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'

export type UseVirtualListOptions<T> = {
  items: T[]
  getItemKey: (item: T, index: number) => string | number
  estimateSize?: number
  overscan?: number
  initialScrollIndex?: number
  followOutput?: 'auto' | 'always' | 'never'
  bottomThreshold?: number
}

export type UseVirtualListReturn<T> = {
  virtualizer: Virtualizer<HTMLDivElement, Element>
  scrollContainerRef: React.RefObject<HTMLDivElement | null>
  scrollToBottom: () => void
  isScrolledToBottom: () => boolean
}

export function useVirtualList<T>({
  items,
  getItemKey,
  estimateSize = 50,
  overscan = 5,
  initialScrollIndex,
  followOutput = 'never',
  bottomThreshold = 50,
}: UseVirtualListOptions<T>): UseVirtualListReturn<T> {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isAtBottomRef = useRef(true)
  const prevItemCountRef = useRef(0) // Start at 0 to detect initial load
  const lastInitialScrollIndexRef = useRef<number | undefined>(undefined)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => estimateSize,
    overscan,
    getItemKey: (index) => getItemKey(items[index], index),
  })

  const isScrolledToBottom = useCallback(() => {
    const container = scrollContainerRef.current
    if (!container) return true
    const { scrollTop, scrollHeight, clientHeight } = container
    return scrollHeight - scrollTop - clientHeight <= bottomThreshold
  }, [bottomThreshold])

  const scrollToBottom = useCallback(() => {
    if (items.length > 0) {
      // Scroll twice - once immediately and once after measurement
      // to handle dynamic sizing
      virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
      requestAnimationFrame(() => {
        virtualizer.scrollToIndex(items.length - 1, { align: 'end' })
      })
    }
  }, [virtualizer, items.length])

  // Track scroll position to know if user is at bottom
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      isAtBottomRef.current = isScrolledToBottom()
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [isScrolledToBottom])

  // Handle follow output behavior when items change
  // Use useLayoutEffect for synchronous scroll after DOM update
  useLayoutEffect(() => {
    const prevCount = prevItemCountRef.current
    prevItemCountRef.current = items.length

    // When items are cleared (conversation switch), reset tracking
    if (items.length === 0) return

    // Scroll on initial load (prev was 0) or when items are added
    const isInitialLoad = prevCount === 0
    const itemsAdded = items.length > prevCount

    if (!isInitialLoad && !itemsAdded) return

    if (followOutput === 'always') {
      scrollToBottom()
    } else if (followOutput === 'auto' && isAtBottomRef.current) {
      scrollToBottom()
    }
  }, [items.length, followOutput, scrollToBottom])

  // Handle initial scroll position (runs when initialScrollIndex changes or items first load)
  useEffect(() => {
    if (initialScrollIndex === undefined || items.length === 0) return
    // Skip if we already scrolled to this exact index
    if (lastInitialScrollIndexRef.current === initialScrollIndex) return

    lastInitialScrollIndexRef.current = initialScrollIndex
    virtualizer.scrollToIndex(initialScrollIndex, { align: 'start' })
  }, [initialScrollIndex, items.length, virtualizer])

  return {
    virtualizer,
    scrollContainerRef,
    scrollToBottom,
    isScrolledToBottom,
  }
}
