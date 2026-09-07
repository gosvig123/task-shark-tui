const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
export function characters(text: string): string[] { return [...segmenter.segment(text)].map(s => s.segment); }
export interface EditorKey { name?: string; ctrl?: boolean; meta?: boolean; shift?: boolean }
export class CursorEditor {
  text: string[];
  cursor: number;
  constructor(value: string, readonly multiline: boolean) {
    this.text = characters(multiline ? value.replace(/\r\n?/g, '\n') : value.replace(/[\r\n]/g, ''));
    this.cursor = this.text.length;
  }
  get value(): string { return this.text.join(''); }
  lineStart(): number { return this.text.slice(0, this.cursor).lastIndexOf('\n') + 1; }
  lineEnd(): number { const end = this.text.indexOf('\n', this.cursor); return end < 0 ? this.text.length : end; }
  key(ch: string, key: EditorKey): void {
    const name = key.name;
    if (key.ctrl && name === 'u') { this.text = []; this.cursor = 0; return; }
    if (name === 'home' || (key.ctrl && name === 'a')) { this.cursor = key.ctrl && name === 'home' ? 0 : this.lineStart(); return; }
    if (name === 'end' || (key.ctrl && name === 'e')) { this.cursor = key.ctrl && name === 'end' ? this.text.length : this.lineEnd(); return; }
    if (key.ctrl && (name === 'left' || name === 'right')) { this.word(name === 'left' ? -1 : 1); return; }
    if (name === 'left' || (key.ctrl && name === 'b')) { this.cursor = Math.max(0, this.cursor - 1); return; }
    if (name === 'right' || (key.ctrl && name === 'f')) { this.cursor = Math.min(this.text.length, this.cursor + 1); return; }
    if (name === 'up' || name === 'down') { this.vertical(name === 'up' ? -1 : 1); return; }
    if (name === 'backspace') { if (this.cursor) this.text.splice(--this.cursor, 1); return; }
    if (name === 'delete' || (key.ctrl && name === 'd')) { this.text.splice(this.cursor, 1); return; }
    if (key.ctrl || key.meta || name === 'return') return;
    const inserted = name === 'enter' ? (this.multiline ? ['\n'] : []) : characters(this.multiline ? ch.replace(/\r\n?/g, '\n') : ch.replace(/[\r\n]/g, ''));
    this.insert(inserted.join(''));
  }
  private insert(value: string): void {
    if (!value) return;
    const prefix = this.text.slice(0, this.cursor).join('') + value;
    this.text = characters(prefix + this.text.slice(this.cursor).join(''));
    this.cursor = 0; let offset = 0;
    while (offset < prefix.length) offset += this.text[this.cursor++].length;
  }
  private word(direction: number): void {
    const word = (text: string) => /[\p{L}\p{N}_]/u.test(text);
    if (direction < 0) {
      while (this.cursor && !word(this.text[this.cursor - 1])) this.cursor--;
      while (this.cursor && word(this.text[this.cursor - 1])) this.cursor--;
    } else {
      while (this.cursor < this.text.length && word(this.text[this.cursor])) this.cursor++;
      while (this.cursor < this.text.length && !word(this.text[this.cursor])) this.cursor++;
    }
  }
  private vertical(direction: number): void {
    const start = this.lineStart(), end = this.lineEnd(), column = this.cursor - start;
    if (direction < 0 && start) {
      const previous = this.text.slice(0, start - 1).lastIndexOf('\n') + 1;
      this.cursor = Math.min(start - 1, previous + column);
    } else if (direction > 0 && end < this.text.length) {
      const next = this.text.indexOf('\n', end + 1);
      this.cursor = Math.min(next < 0 ? this.text.length : next, end + 1 + column);
    }
  }
}
