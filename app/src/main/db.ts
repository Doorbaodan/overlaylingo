import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 持久层统一入口：SQLite（better-sqlite3）。
 *
 * 表结构：
 *  - settings：用户偏好（键值对，value 为 JSON 字符串）
 *  - tasks：翻译任务
 *  - messages：对话消息（按 taskId 关联）
 *
 * 数据文件：userData/overlaylingo.db（单文件，便于备份迁移）。
 */

let _db: Database.Database | null = null

/** 获取数据库连接（懒加载单例，首次调用需在 app ready 之后） */
export function getDb(): Database.Database {
  if (_db) return _db

  const dir = app.getPath('userData')
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'overlaylingo.db')

  _db = new Database(file)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  migrate(_db)
  return _db
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      type       TEXT NOT NULL,
      background TEXT NOT NULL DEFAULT '',
      createdAt  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id        TEXT PRIMARY KEY,
      taskId    TEXT NOT NULL,
      role      TEXT NOT NULL,
      content   TEXT NOT NULL,
      createdAt INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_task ON messages (taskId, createdAt);
  `)

  migrateFromJson(db)
}

/** 一次性迁移：settings.json → SQLite（仅在库为空且旧文件存在时执行） */
function migrateFromJson(db: Database.Database): void {
  const settingsCount = (db.prepare('SELECT COUNT(*) AS c FROM settings').get() as { c: number }).c
  const tasksCount = (db.prepare('SELECT COUNT(*) AS c FROM tasks').get() as { c: number }).c
  if (settingsCount > 0 || tasksCount > 0) return

  const oldFile = path.join(app.getPath('userData'), 'settings.json')
  if (!fs.existsSync(oldFile)) return

  let old: Record<string, unknown>
  try {
    old = JSON.parse(fs.readFileSync(oldFile, 'utf-8'))
  } catch {
    return
  }

  const upsertSetting = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const insertTask = db.prepare(
    'INSERT OR IGNORE INTO tasks (id, name, type, background, createdAt) VALUES (?, ?, ?, ?, ?)'
  )
  const insertMessage = db.prepare(
    'INSERT OR IGNORE INTO messages (id, taskId, role, content, createdAt) VALUES (?, ?, ?, ?, ?)'
  )

  const tx = db.transaction(() => {
    // 用户偏好
    for (const key of ['theme', 'fontSize', 'overlay', 'captureRegion', 'apiKeyEncrypted', 'usageStats']) {
      if (key in old) upsertSetting.run(key, JSON.stringify(old[key]))
    }

    // 任务
    const tasks = Array.isArray(old.tasks) ? (old.tasks as any[]) : []
    for (const t of tasks) {
      if (!t?.id) continue
      insertTask.run(t.id, String(t.name ?? '未命名任务'), String(t.type ?? 'dialogue'), String(t.background ?? ''), Number(t.createdAt ?? Date.now()))
    }

    // 消息
    const messages = Array.isArray(old.messages) ? (old.messages as any[]) : []
    for (const m of messages) {
      if (!m?.id) continue
      insertMessage.run(m.id, String(m.taskId ?? ''), String(m.role ?? 'user'), String(m.content ?? ''), Number(m.createdAt ?? Date.now()))
    }
  })
  tx()

  // 迁移成功后备份旧文件，避免重复迁移
  try {
    fs.renameSync(oldFile, oldFile + '.bak')
    console.log('[db] 已从 settings.json 迁移到 SQLite，旧文件备份为 settings.json.bak')
  } catch (err) {
    console.error('[db] 备份旧 settings.json 失败:', err)
  }
}

/** 退出前关闭数据库（写入 WAL checkpoint） */
export function closeDb(): void {
  if (_db) {
    try {
      _db.pragma('wal_checkpoint(TRUNCATE)')
      _db.close()
    } catch {
      /* ignore */
    }
    _db = null
  }
}
