# BabelDOC GUI

跨平台的 BabelDOC 翻译工作流图形界面应用。

## 功能特性

- 🌍 跨平台支持 (macOS, Windows, Linux)
- 📄 PDF 文档智能翻译
- 🤖 集成大语言模型 (LLM)
- 📁 智能文件管理和路径建议
- 🎨 现代化的用户界面
- 📊 实时翻译进度追踪
- 📜 完整的翻译历史记录

## 下载安装

前往 [Releases](https://github.com/yht0511/BabelDoc-GUI/releases) 页面下载最新版本：

- **macOS**: 下载 `.dmg` 或 `.zip` 文件
- **Windows**: 下载 `.exe` 安装程序或 `.zip` 便携版
- **Linux**: 下载 `.AppImage`, `.deb` 或 `.rpm` 文件

## 开发

### 环境要求

- Node.js 20+
- npm 或 yarn

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建

```bash
# 构建应用
npm run build

# 构建特定平台
npm run build:mac-arm64
npm run build:win-x64
npm run build:linux-x64
```

详细的发布流程请参考 [RELEASE.md](./RELEASE.md)。

## 技术栈

- **框架**: Electron + React
- **构建工具**: Vite + electron-vite
- **UI 组件**: Radix UI + Tailwind CSS
- **状态管理**: Zustand
- **类型检查**: TypeScript
- **打包工具**: electron-builder

## 配置

首次运行需要配置：

1. **LLM API**：设置 OpenAI 兼容的 API 地址和密钥
2. **BabelDOC 路径**：应用会自动检测和安装
3. **文档保存目录**：选择翻译结果的保存位置

## 许可证

MIT License

## 相关链接

- [BabelDOC](https://github.com/reycn/BabelDOC) - 核心翻译引擎

---

[![Build and Release](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-release.yml/badge.svg)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-release.yml)
[![Build (Development)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-dev.yml/badge.svg)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-dev.yml)
