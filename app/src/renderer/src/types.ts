export type TaskType = 'dialogue' | 'text'

export interface Task {
  id: string
  name: string
  type: TaskType
  background: string
  createdAt: number
}

export interface ChatMessage {
  id: string
  taskId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: number
}
