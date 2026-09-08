import type { Widgets } from 'blessed';

const contents = new WeakMap<Widgets.ListElement, string[]>();

// Blessed setItems clears every row, even when only the selection changed.
export function setListContent(list: Widgets.ListElement, items: string[]): void {
  const previous = contents.get(list);
  // Remove from the tail: Blessed otherwise shifts every remaining row per removal.
  if (previous && items.length < previous.length) {
    for (let index = previous.length - 1; index >= items.length; index--) list.removeItem(index);
  }
  if (!previous || previous.length !== items.length) list.setItems(items);
  else items.forEach((text, index) => { if (text !== previous[index]) list.setItem(list.getItem(index), text); });
  contents.set(list, items);
}
