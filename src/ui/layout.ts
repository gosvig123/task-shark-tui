import type { Widgets } from 'blessed';

export function navigationWidth(columns: number): number {
  return Math.max(12, Math.min(48, Math.floor(columns * .4), Math.max(24, Math.floor(columns * .32))));
}
export function composerHeight(rows: number): number { return Math.max(3, Math.min(10, Math.floor((rows - 5) / 3))); }
export function fitPanel(panel: Widgets.BoxElement, desired: number): void {
  panel.height = Math.max(3, Math.min(desired, Number(panel.screen.height) - 2));
}
export function resizePanel(panel: Widgets.BoxElement, desired: () => number): void {
  const resize = () => { fitPanel(panel, desired()); };
  panel.screen.on('resize', resize);
  panel.on('destroy', () => panel.screen.removeListener('resize', resize));
  resize();
}

export function taskNavigationWidth(columns: number): number {
  return Math.max(12, Math.min(Math.floor(columns * .4), columns - 24));
}
export function taskNavigationHeights(height: number): number[] {
  const first = Math.floor(Math.max(0, height) / 2);
  return [first, Math.max(0, height) - first];
}
