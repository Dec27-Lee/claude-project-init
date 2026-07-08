---
description: 检查当前工作区是否已通过 claude-project-init 初始化，读取 lock、skills 索引、CLAUDE.md、workspace-index 和 Git 可见性状态，报告已安装技能、缺失文件、可能误提交的初始化产物和建议修复动作。
disable-model-invocation: true
argument-hint: "[target path]"
---

# claude-project-init:audit

检查目标工作区的 claude-project-init 初始化状态。

## 检查范围

默认检查当前工作区，也可以使用用户传入的目标路径。

重点读取：

- `.claude/project-init.lock.json`
- `.claude/skills/INDEX.md`
- `.claude/skills/*/SKILL.md`
- `CLAUDE.md`
- `.claude/workspace-index.md`
- `.claude/settings.json`
- `.git/info/exclude`（如果目标在 Git 仓库中）
- `local/` 是否存在

## 执行原则

1. 只读检查，不修改文件。
2. 如果 lock 文件不存在，说明工作区可能尚未通过本插件初始化。
3. 如果 lock 中记录的 pack 缺失对应 `SKILL.md`，列为缺失。
4. 如果存在 `.claude/skills` 但无索引，建议重新运行 `/claude-project-init:init`。
5. 如果 lock 中记录了 `gitVisibility.policy`，展示该策略和当时是否写入 `.git/info/exclude`。
6. 如果 `.git/info/exclude` 中存在 `claude-project-init:git-visibility` 受控块，展示当前 patterns。
7. 如果目标看起来是公开仓库或插件/skill 源码仓库，却存在未排除的 `CLAUDE.md`、`.claude/`、`local/` 初始化产物，应提示不要直接作为源码提交。
8. 如果这些路径已经被 Git 跟踪，说明 exclude 不会自动取消跟踪；建议用户人工决定是否保留或执行 `git rm --cached`，但本技能不执行。
9. 输出结论分为：正常、部分缺失、未初始化、Git 可见性需处理。

## 输出格式

```markdown
- 目标工作区：
- 初始化状态：正常 / 部分缺失 / 未初始化 / Git 可见性需处理
- 已记录 packs：
- 实际存在 skills：
- 缺失或异常：
- Git 可见性策略：
- .git/info/exclude 状态：
- 可能误提交的初始化产物：
- 建议动作：
```
