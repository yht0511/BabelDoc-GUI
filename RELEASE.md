# 发布流程

## 自动发布 Release

本项目使用 GitHub Actions 自动构建和发布多平台安装包。

### 如何发布新版本

1. **更新版本号**

   ```bash
   # 在 package.json 中更新 version 字段
   # 例如: "version": "0.2.0"
   ```

2. **提交更改**

   ```bash
   git add package.json
   git commit -m "chore: bump version to 0.2.0"
   git push
   ```

3. **创建并推送标签**

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. **等待自动构建**
   - GitHub Actions 会自动检测到新标签
   - 在 macOS、Linux、Windows 上并行构建
   - 构建完成后自动创建 GitHub Release
   - 所有平台的安装包会自动上传到 Release

### 构建产物

#### macOS

- `BabelDOC-{version}-arm64.dmg` - ARM64 DMG 安装包
- `BabelDOC-{version}-arm64-mac.zip` - ARM64 ZIP 压缩包
- `BabelDOC-{version}-x64.dmg` - x64 DMG 安装包
- `BabelDOC-{version}-x64-mac.zip` - x64 ZIP 压缩包

#### Windows

- `BabelDOC-{version}-x64-Setup.exe` - x64 NSIS 安装程序
- `BabelDOC-{version}-x64.zip` - x64 便携版

#### Linux

- `BabelDOC-{version}-x64.AppImage` - x64 AppImage（通用格式）
- `BabelDOC-{version}-x64.deb` - x64 Debian/Ubuntu 包
- `BabelDOC-{version}-x64.rpm` - x64 RedHat/Fedora 包

### 开发构建

每次推送到 `main` 或 `develop` 分支时，GitHub Actions 会自动构建（但不发布）：

- 构建产物保存 7 天
- 可在 Actions 页面下载查看

### 手动触发构建

在 GitHub 仓库的 Actions 页面，选择 "Build and Release" 工作流，点击 "Run workflow" 可以手动触发构建。

### 注意事项

1. **代码签名**（可选）

   - macOS: 需要设置 Apple Developer 证书（目前未配置）
   - Windows: 需要设置 Authenticode 证书（目前未配置）
   - Linux: 无需签名

2. **版本号规范**

   - 遵循语义化版本 (Semantic Versioning)
   - 格式: `v主版本.次版本.修订号` (例如: v1.2.3)
   - 主版本: 不兼容的 API 修改
   - 次版本: 向下兼容的功能性新增
   - 修订号: 向下兼容的问题修正

3. **Release Notes**
   - GitHub Actions 会自动生成基于 commits 的 Release Notes
   - 建议手动编辑补充重要更新说明

## 本地构建

如果需要在本地构建特定平台：

```bash
# macOS
npm run build:mac-arm64
npm run build:mac-x64

# Windows (在 macOS/Linux 上可能无法签名)
npm run build:win-x64

# Linux
npm run build:linux-x64

# 构建所有平台（慎用，耗时较长）
npm run build:all
```

## 工作流状态

- [![Build and Release](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-release.yml/badge.svg)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-release.yml)
- [![Build (Development)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-dev.yml/badge.svg)](https://github.com/yht0511/BabelDoc-GUI/actions/workflows/build-dev.yml)
