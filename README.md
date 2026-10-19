# 浮译 OverlayLingo

Windows 屏幕文本实时翻译悬浮助手 —— 面向游戏 / 影视字幕的 AI 翻译工具。

**「尽可能把问题丢给 AI。」** 不再依赖容易碎片化的传统 OCR，而是直接把截图交给 DeepSeek 视觉模型识别与翻译，做到「截图翻译」级别的准确度。

## 特性

- 🎮 **快速对话翻译**：手动框选字幕区域 → 捕获一段对话截图 → 停止后 AI 自动输出中英对照
- 📖 **长文本翻译**：截图单帧，AI 逐句详细解析（含俚语 / 梗 / 文化背景）
- 💬 **Agent 对话**：每个任务独立的背景信息（世界观 / 术语表），可随时追问、重新生成
- 🎯 **视觉模型识别**：多图分批翻译，慢速长句不漏句、快进对话不串行
- 🛰 **悬浮控制面板**：置顶悬浮球 + 控制面板，游戏内即时开关捕获，不遮挡画面
- 🔒 **隐私安全**：API Key 用 Windows DPAPI 加密存储，绝不落明文；数据本地 SQLite 单文件存储
- 🎨 深浅主题、字体大小可调、托盘常驻

## 下载安装

> 安装包见 [Releases](https://github.com/overlaylingo/overlaylingo/releases)。

- 仅支持 **Windows 10 / 11**（x64）
- 两种安装方式：`OverlayLingo-*-setup.exe`（安装版）或 `OverlayLingo-*-portable.exe`（绿色便携版）

## 使用前配置

1. 打开主窗口 →「模型与余额」→ 填入你的 [DeepSeek](https://platform.deepseek.com/) API Key
2. 点击「测试连接」，显示余额即配置成功
3. 新建任务（快速对话翻译 / 长文本翻译），填写背景信息，即可开始捕获翻译

> 本项目**不内置任何 API Key**，密钥仅保存在你本机。

## 开发

前置要求：Node.js ≥ 20、npm（Windows 建议用 Git Bash）。

```bash
cd app
npm install        # 会自动为 Electron 重编译 better-sqlite3
npm run dev        # 开发模式
npm run typecheck  # 类型检查
npm run build      # 构建
npm run pack       # 打包（未压缩目录，本地验证用）
npm run dist:win   # 打包 Windows 安装版 + 便携版（产物在 app/release/）
```

## 技术栈

- Electron 33 + electron-vite + TypeScript
- React 19
- better-sqlite3（本地持久化）
- DeepSeek API（`deepseek-flash` 文本 / `deepseek-v4-flash-vision-exp` 视觉）

## 目录结构

```
OverlayLingo/
├── app/          # Electron 工程（源码、打包配置）
│   └── src/
│       ├── main/     # 主进程（窗口、捕获、模型层、持久层）
│       ├── preload/  # contextBridge IPC
│       └── renderer/ # React UI
└── docs/         # PRD、架构文档
```

## 已知限制

- **独占全屏的游戏无法覆盖**（这是 Windows 桌面窗口的技术限制，非本项目缺陷）——请使用「无边框窗口 / 窗口化」模式运行游戏
- 仅做屏幕级捕获，**不做任何注入 / 钩子**，避免反作弊风险

## 许可证

[MIT](LICENSE)
