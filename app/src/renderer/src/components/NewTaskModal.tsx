import { useState } from 'react'
import type { TaskType } from '../types'

interface Props {
  onClose: () => void
  onCreate: (name: string, type: TaskType, background: string) => void
}

export default function NewTaskModal({ onClose, onCreate }: Props) {
  const [name, setName] = useState('')
  const [type, setType] = useState<TaskType>('dialogue')
  const [background, setBackground] = useState('')

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">新建翻译任务</div>

        <div className="setting-col">
          <label>任务名称</label>
          <input
            className="key-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：赛博朋克2077 主线"
            autoFocus
          />
        </div>

        <div className="setting-col">
          <label>任务类型</label>
          <div className="type-radio-group">
            <label className={`type-radio ${type === 'dialogue' ? 'checked' : ''}`}>
              <input
                type="radio"
                checked={type === 'dialogue'}
                onChange={() => setType('dialogue')}
              />
              <div>
                <div className="type-radio-title">快速对话翻译</div>
                <div className="type-radio-desc">手动捕获一段对话字幕，停止后 AI 输出中英对照</div>
              </div>
            </label>
            <label className={`type-radio ${type === 'text' ? 'checked' : ''}`}>
              <input type="radio" checked={type === 'text'} onChange={() => setType('text')} />
              <div>
                <div className="type-radio-title">长文本翻译</div>
                <div className="type-radio-desc">截图翻译单帧内容，AI 做详细逐句解析</div>
              </div>
            </label>
          </div>
        </div>

        <div className="setting-col">
          <label>背景信息 / 语境（可选）</label>
          <textarea
            className="area-input"
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            rows={4}
            placeholder="告诉 AI 翻译时的语境：世界观、角色名固定译法、术语等。例如：这是《赛博朋克2077》的世界观，V=主角，Johnny=强尼·银手，Relic=圣物芯片……"
          />
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>
            取消
          </button>
          <button className="btn primary" onClick={() => onCreate(name, type, background)}>
            创建
          </button>
        </div>
      </div>
    </div>
  )
}
