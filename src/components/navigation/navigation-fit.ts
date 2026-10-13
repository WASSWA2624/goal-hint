export const minimumPrimaryDestinations = 3;

/** Preserve destination order and reserve More only while there are overflow destinations. */
export function fitNavigationItems({ widths, moreWidth, activeMoreWidth = moreWidth, currentIndex = -1, availableWidth, gap = 0, equalColumns = false }: Readonly<{
  widths: readonly number[]; moreWidth: number; activeMoreWidth?: number; currentIndex?: number;
  availableWidth: number; gap?: number; equalColumns?: boolean;
}>): number {
  const minimum = Math.min(minimumPrimaryDestinations, widths.length);
  for (let count = widths.length; count >= minimum; count--) {
    const overflow = count < widths.length, columns = count + Number(overflow);
    const visibleWidths = widths.slice(0, count);
    if (overflow) visibleWidths.push(currentIndex >= count ? activeMoreWidth : moreWidth);
    const needed = equalColumns
      ? Math.max(0, ...visibleWidths) * columns + gap * Math.max(0, columns - 1)
      : visibleWidths.reduce((sum, width) => sum + width, 0) + gap * Math.max(0, columns - 1);
    if (needed <= availableWidth + 0.25) return count;
  }
  return minimum;
}
