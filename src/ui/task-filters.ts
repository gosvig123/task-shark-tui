import type { Task } from '../model.js';

export const TaskFilter = {
  all: 'All tasks', pending: 'Pending', completed: 'Completed', overdue: 'Overdue',
  today: 'Due today', undated: 'No due date',
} as const;
export type TaskFilterValue = typeof TaskFilter[keyof typeof TaskFilter];
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function dueDay(task: Task): string | undefined {
  const day = task.dueDate?.slice(0, 10);
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day) || day.startsWith('0001-')) return;
  const parsed = new Date(`${day}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === day ? day : undefined;
}
export function filterTasks(tasks: Task[], filter: TaskFilterValue, query = '', today = localDate()): Task[] {
  return tasks.filter(task => {
    if (!`${task.title} ${task.ownerList}`.toLowerCase().includes(query.toLowerCase())) return false;
    const due = dueDay(task);
    switch (filter) {
      case TaskFilter.pending: return !task.completed;
      case TaskFilter.completed: return task.completed;
      case TaskFilter.overdue: return !task.completed && due !== undefined && due < today;
      case TaskFilter.today: return !task.completed && due === today;
      case TaskFilter.undated: return due === undefined;
      default: return true;
    }
  }).sort((a, b) => (dueDay(b) ?? '').localeCompare(dueDay(a) ?? ''));
}
export function taskLabel(task: Task): string {
  return `${task.completed ? '✓' : '○'} ${dueDay(task) ?? 'No due date'} · ${task.title} · ${task.ownerList}`;
}
