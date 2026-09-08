import type { Widgets } from 'blessed';

export function setDetailContent(detail: Widgets.BoxElement, content: string): void {
  if (detail.content !== content) detail.setContent(content);
  const height = Math.max(0, Number(detail.height) - Number(detail.iheight));
  const maximum = Math.max(0, detail.getScreenLines().length - height);
  if (detail.childBase <= maximum) return;
  // Blessed counts its scrolling border label as content, retaining the old bottom.
  // Reset also moves that label back before restoring a valid transcript position.
  detail.resetScroll();
  detail.scroll(maximum);
}
