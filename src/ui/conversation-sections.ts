import { conversationSectionOrder, sidebarSection, Status, type Conversation } from '../model.js';
import type { Row } from './view.js';

export function conversationRows(conversations: Conversation[], collapsed: ReadonlySet<string> = new Set(), grouped = true): Row[] {
  const rows: Row[] = [];
  for (const section of conversationSectionOrder) {
    const items = conversations.filter(c => sidebarSection(c) === section)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    if (!items.length) continue;
    if (grouped) rows.push({ key: `section:${section}`, section,
      label: `${collapsed.has(section) ? '▸' : '▾'} ${section}` });
    if (grouped && collapsed.has(section)) continue;
    rows.push(...items.map(conversation => ({ key: conversation.id, conversation,
      label: `${grouped ? '  ' : ''}${conversation.status === Status.running ? '▶ ' : ''}${conversation.title}` })));
  }
  return rows;
}
