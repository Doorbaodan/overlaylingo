import type { Task } from '../types'

interface Props {
  tasks: Task[]
  currentId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete: (id: string) => void
}

export default function TaskList({ tasks, currentId, onSelect, onNew, onDelete }: Props) {
  return (
    <div className="task-list">
      <button className="new-task-btn" onClick={onNew}>
        + 新建任务
      </button>
      <div className="task-items">
        {tasks.length ? (
          tasks.map((t) => (
            <div
              key={t.id}
              className={`task-item ${t.id === currentId ? 'active' : ''}`}
              onClick={() => onSelect(t.id)}
            >
              <div className="task-item-main">
                <div className="task-item-name">{t.name}</div>
                <div className="task-item-type">{t.type === 'dialogue' ? '对话翻译' : '长文本翻译'}</div>
              </div>
              <button
                className="task-del"
                title="删除任务"
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(t.id)
                }}
              >
                ×
              </button>
            </div>
          ))
        ) : (
          <div className="task-empty">暂无任务</div>
        )}
      </div>
    </div>
  )
}
