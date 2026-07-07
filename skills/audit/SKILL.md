---
description: 检查当前工作区是否已通过 claude-project-init 初始化，读取 .claude/project-init.lock.json 和 .claude/skills/INDEX.md，报告已安装技能、缺失文件和建议修复动作。
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
- `.claude/settings.json`

## 执行原则

1. 只读检查，不修改文件。
2. 如果 lock 文件不存在，说明工作区可能尚未通过本插件初始化。
3. 如果 lock 中记录的 pack 缺失对应 `SKILL.md`，列为缺失。
4. 如果存在 `.claude/skills` 但无索引，建议重新运行 `/claude-project-init:init`。
5. 输出结论分为：正常、部分缺失、未初始化。

## 输出格式

```markdown
- 目标工作区：
- 初始化状态：正常 / 部分缺失 / 未初始化
- 已记录 packs：
- 实际存在 skills：
- 缺失或异常：
- 建议动作：
```
