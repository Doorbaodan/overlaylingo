import { useTaskChat } from '../hooks/useTaskChat'

/** 悬浮窗：快捷控制面板（捕获按钮 + 当前任务选择 + 详情），对话内容在主程序查看 */
export default function Panel() {
  const { tasks, currentTaskId, currentTask, captureState, draft, selectTask, toggleCapture, screenshot } =
    useTaskChat()

  const handleToggleCapture = (): void => {
    if (captureState === 'capturing') {
      // 停止捕获 → 自动弹主程序看结果
      window.api.main.show()
    }
    toggleCapture()
  }

  const handleScreenshot = (): void => {
    screenshot()
    window.api.main.show()
  }

  return (
    <div className="overlay-panel">
      <div className="overlay-panel-bar">
        <span className="overlay-panel-title">浮译</span>
        <div className="overlay-panel-controls">
          <button className="icon-btn" title="最小化为图标" onClick={() => window.api.overlay.collapse()}>
            —
          </button>
        </div>
      </div>

      <div className="overlay-ctrl">
        <select
          className="overlay-task-select"
          value={currentTaskId ?? ''}
          onChange={(e) => selectTask(e.target.value)}
        >
          {tasks.length === 0 && <option value="">暂无任务</option>}
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}（{t.type === 'dialogue' ? '对话翻译' : '长文本翻译'}）
            </option>
          ))}
        </select>

        {captureState === 'capturing' && (
          <div className="overlay-capture-count">已捕获 {draft} 张字幕</div>
        )}

        <div className="overlay-btn-row">
          {currentTask?.type === 'dialogue' ? (
            <button
              className={`overlay-main-btn ${captureState === 'capturing' ? 'on' : ''}`}
              onClick={handleToggleCapture}
              disabled={captureState === 'selecting'}
            >
              {captureState === 'capturing'
                ? '■ 停止'
                : captureState === 'selecting'
                  ? '框选中…'
                  : '● 开始捕获'}
            </button>
          ) : (
            <button className="overlay-main-btn" onClick={handleScreenshot}>
              ◧ 截图
            </button>
          )}

          <button className="overlay-detail-btn" onClick={() => window.api.main.show()}>
            详情
          </button>
        </div>
      </div>
    </div>
  )
}
