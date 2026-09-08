import type { Widgets } from 'blessed';

type AttributeBox = Widgets.BoxElement & {
  _parseAttr(lines: string[]): number[] | undefined;
  sattr(style: Widgets.Types.TStyle): number;
};

// Blessed 0.1.81 scans all transcript ANSI codes on every scroll/render.
// Wrapped lines are replaced on content/width changes; only the base style varies.
export function cacheDetailAttributes(detail: Widgets.BoxElement): void {
  const box = detail as AttributeBox, parse = box._parseAttr;
  let previous: string[] | undefined, base: number, attributes: number[] | undefined;
  box._parseAttr = function(lines) {
    const next = this.sattr(this.style);
    if (lines !== previous || next !== base) {
      attributes = parse.call(this, lines); previous = lines; base = next;
    }
    return attributes;
  };
}
