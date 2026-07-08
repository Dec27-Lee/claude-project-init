---
description: 查看 claude-project-init 支持安装到工作区的 workspace skill packs、presets、核心初始化项和 Git 可见性策略。用户想先看技能清单、可安装哪些技能、有哪些初始化项或想手动选择前使用。
disable-model-invocation: true
argument-hint: "[--json]"
---

# claude-project-init:list

查看 `claude-project-init` 当前可安装的 workspace skill packs、presets、核心初始化项和 Git 可见性策略。

## 目标

当用户想知道“插件里可以安装哪些技能”“初始化支持哪些内容”“我能选哪些 pack”时，先执行本技能，而不是直接进入 apply。

## 执行规则

1. 只读展示，不修改文件。
2. 优先运行：

```bash
claude-project-init list
```

3. 如果 `claude-project-init` 不在 PATH 中，使用当前插件或源码目录下的 Node fallback：

```bash
node bin/claude-project-init.mjs list
```

4. 输出时必须说明：
   - 核心初始化项。
   - 可安装 workspace skill packs。
   - 推荐/可选状态。
   - pack 依赖关系。
   - 可用 presets。
   - Git 可见性策略。
5. 如果用户说“手动选择”或“接下来安装”，应继续引导 `/claude-project-init:init`，并在 init 中使用交互式提问让用户选择 packs 和 Git 可见性策略。

## 输出格式

```markdown
## 核心初始化项
## 可安装 workspace skill packs
## 可用 presets
## Git 可见性策略
## 下一步
```
