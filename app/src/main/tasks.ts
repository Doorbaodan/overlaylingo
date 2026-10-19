import { randomUUID } from 'node:crypto'
import { getDb } from './db'
import type { ChatMessage, Task, TaskType } from './store'

export function listTasks(): Task[] {
  return getDb().prepare('SELECT * FROM tasks ORDER BY createdAt ASC').all() as Task[]
}

export function getTask(id: string): Task | undefined {
  return getDb().prepare('SELECT * FROM tasks WHERE id = ?').get(id) as Task | undefined
}

export function createTask(name: string, type: TaskType, background: string): Task {
  const task: Task = {
    id: randomUUID(),
    name: name.trim() || '未命名任务',
    type,
    background: background.trim(),
    createdAt: Date.now()
  }
  getDb()
    .prepare('INSERT INTO tasks (id, name, type, background, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(task.id, task.name, task.type, task.background, task.createdAt)
  return task
}

export function deleteTask(id: string): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
    db.prepare('DELETE FROM messages WHERE taskId = ?').run(id)
  })()
}

export function listMessages(taskId: string): ChatMessage[] {
  return getDb()
    .prepare('SELECT * FROM messages WHERE taskId = ? ORDER BY createdAt ASC')
    .all(taskId) as ChatMessage[]
}

export function addMessage(taskId: string, role: 'user' | 'assistant', content: string): ChatMessage {
  const msg: ChatMessage = {
    id: randomUUID(),
    taskId,
    role,
    content,
    createdAt: Date.now()
  }
  getDb()
    .prepare('INSERT INTO messages (id, taskId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)')
    .run(msg.id, msg.taskId, msg.role, msg.content, msg.createdAt)
  return msg
}

/** 删除某任务最后一条 assistant 消息（重新生成前调用） */
export function removeLastAssistant(taskId: string): void {
  const row = getDb()
    .prepare('SELECT id FROM messages WHERE taskId = ? AND role = ? ORDER BY createdAt DESC LIMIT 1')
    .get(taskId, 'assistant') as { id: string } | undefined
  if (row) getDb().prepare('DELETE FROM messages WHERE id = ?').run(row.id)
}

export function updateTask(id: string, patch: Partial<Pick<Task, 'name' | 'background'>>): void {
  const current = getTask(id)
  if (!current) return
  const next = { ...current, ...patch }
  getDb()
    .prepare('UPDATE tasks SET name = ?, background = ? WHERE id = ?')
    .run(next.name, next.background, id)
}
