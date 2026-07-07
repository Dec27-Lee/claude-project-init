---
name: project-docs
description: 项目文档维护：初始化和更新 CLAUDE.md、README、架构说明、工作区索引和研发记录。适用于项目初始化、文档补齐、规则沉淀和上下文整理。
version: 0.1.0
---

# project-docs

用于维护当前工作区的项目说明和 Claude Code 协作上下文。

## 适用场景

- 用户要求初始化项目文档或 CLAUDE.md。
- 需要沉淀项目结构、运行命令、测试命令、架构约定。
- 需要把散落的信息整理成可续接的工作区说明。

## 执行原则

1. 文档必须来自实际文件、命令输出或用户确认，不编造项目事实。
2. 修改已有文档时，优先追加或局部更新，不整体覆盖。
3. CLAUDE.md 应保持精炼，避免塞入大段历史记录。
4. 详细记录应放在 `docs/` 或 `local/` 下，再从 CLAUDE.md 链接。
5. 涉及命令、路径、端口、环境变量时必须标明来源或待确认。

## 推荐维护对象

```text
CLAUDE.md
README.md
docs/architecture.md
docs/development.md
.claude/skills/INDEX.md
```
