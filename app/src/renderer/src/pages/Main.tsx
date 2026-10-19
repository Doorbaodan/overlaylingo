import { useEffect, useState } from 'react'
import TaskList from '../components/TaskList'
import ChatView from '../components/ChatView'
import NewTaskModal from '../components/NewTaskModal'
import SettingsView from '../components/SettingsView'
import { useTaskChat } from '../hooks/useTaskChat'

export default function Main() {
  const [view, setView] = useState<'chat' | 'settings'>('chat')
  const [showModal, setShowModal] = useState(false)

  const {
    tasks,
    currentTaskId,
    currentTask,
    messages,
    busy,
    captureState,
    selectTask,
    create,
    remove,
    send,
    regenerate
  } = useTaskChat()

  useEffect(() => {
    window.api.settings.getTheme().then((t) => {
      document.body.dataset.theme = t
    })
    window.api.settings.getFontSize().then((s) => {
      document.documentElement.dataset.fontSize = s
    })
  }, [])

  const handleSelect = (id: string): void => {
    setView('chat')
    selectTask(id)
  }

  return (
    <div className="app-shell">
      <div className="app-sidebar">
        <div className="app-brand">
          <div className="brand-name">浮译</div>
          <div className="brand-sub">OverlayLingo</div>
        </div>
        <TaskList
          tasks={tasks}
          currentId={currentTaskId}
          onSelect={handleSelect}
          onNew={() => setShowModal(true)}
          onDelete={remove}
        />
        <button
          className={`sidebar-bottom-btn ${view === 'settings' ? 'active' : ''}`}
          onClick={() => setView('settings')}
        >
          设置
        </button>
      </div>

      <div className="app-main">
        {view === 'settings' ? (
          <SettingsView />
        ) : (
          <ChatView
            task={currentTask}
            messages={messages}
            captureState={captureState}
            busy={busy}
            onSend={send}
            onRegenerate={regenerate}
          />
        )}
      </div>

      {showModal && (
        <NewTaskModal
          onClose={() => setShowModal(false)}
          onCreate={(name, type, background) => {
            void create(name, type, background)
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}
