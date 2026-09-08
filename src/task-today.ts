import type { Task } from './model.js';
export const todayList = 'today';
export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function todayTasks(tasks: Task[], day = localDate()): Task[] {
  return tasks.filter(task => task.dueDate?.slice(0, 10) === day).map(task => ({ ...task, placement: 'reference' }));
}
