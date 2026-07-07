---
description: 初始化当前或指定工作区的 Claude Code 项目配置。让用户选择要安装的 workspace skills，并生成或合并 CLAUDE.md、.claude/settings.json、.claude/skills/INDEX.md、.claude/workspace-index.md 和技能声明的 local 初始化文件。仅在用户明确要求初始化项目、安装工作区技能或执行 project init 时使用。
disable-model-invocation: true
argument-hint: "[target path] [recommended|minimal|design|thinking-lab|all|手动选择]"
---

# claude-project-init:init

你是 `claude-project-init` 的交互式工作区初始化入口。

## 目标

帮助用户在目标工作区安装 workspace skills，并安全初始化：

- `.claude/skills/<skill>/SKILL.md`
- `.claude/skills/INDEX.md`
- `CLAUDE.md`
- `.claude/workspace-index.md`
- `.claude/settings.json`
- `.claude/project-init.lock.json`
- 各 skill pack 声明的初始化文件，例如 `local/work-journal/index.md`

## 安全规则

1. 只在用户明确调用本技能时执行。
2. 默认目标目录是当前工作区；如果用户传入路径，先确认路径。
3. 写入前必须先生成 plan，并向用户展示将创建、合并、跳过和冲突的内容。
4. 未得到用户确认前，不执行 apply。
5. 安装技能后必须执行该技能声明的工作区初始化文件创建，例如工作日志技能需要 `local/work-journal/index.md`。
6. 不修改用户全局 `~/.claude`。
7. 不安装依赖、不访问网络、不执行项目命令、不提交 Git。
8. 如果用户选择的 pack 有依赖，允许 CLI 自动补齐依赖，但必须在 plan 中向用户说明。
9. 如果 plan 显示冲突，不要强行覆盖；让用户先处理冲突或减少选择的 pack。

## 可用命令

插件提供 CLI：

```bash
claude-project-init list
claude-project-init plan --target <path> --recommended
claude-project-init plan --target <path> --preset minimal
claude-project-init plan --target <path> --preset design
claude-project-init plan --target <path> --preset thinking-lab
claude-project-init plan --target <path> --all
claude-project-init plan --target <path> --no-packs
claude-project-init plan --target <path> --packs work-journal,clear-thinking
claude-project-init plan --target <path> --packs thinking-distiller
claude-project-init apply --target <path> --packs thinking-distiller --yes
```

如果 `claude-project-init` 不在 PATH 中，尝试使用：

```bash
node bin/claude-project-init.mjs list
```

但在已安装插件场景中，应优先调用 `claude-project-init`。

## 执行流程

1. 识别目标工作区。
2. 运行 `claude-project-init list` 展示可选技能。
3. 根据用户需求选择：
   - `recommended`：推荐组合
   - `minimal`：最小组合
   - `design`：设计/产品工作区组合
   - `thinking-lab`：思考方法沉淀组合，包含 `thinking-distiller`
   - `all`：全部技能
   - 手动选择：让用户多选 pack id；如选择 `thinking-distiller`，CLI 会自动补齐依赖 `clear-thinking`
   - `--no-packs`：不安装新技能，只根据当前 `.claude/skills`、`CLAUDE.md` 和长期资料入口初始化/刷新 `CLAUDE.md` 与 `.claude/workspace-index.md`
4. 运行 plan，例如：

```bash
claude-project-init plan --target . --recommended
```

5. 把 plan 摘要展示给用户，特别说明自动补齐的依赖、目录资源复制、`initFiles` 初始化和冲突情况，然后询问是否执行。
6. 用户确认后运行 apply，例如：

```bash
claude-project-init apply --target . --recommended --yes
```

7. 完成后提示用户：
   - 查看 `.claude/skills/INDEX.md`
   - 检查 `CLAUDE.md`
   - 必要时执行 `/reload-plugins` 或重启 Claude Code

## 输出要求

完成后必须说明：

- 目标工作区
- 安装了哪些 skills，哪些是用户选择，哪些是依赖自动带入
- 创建/合并了哪些文件和目录资源
- 执行了哪些 `initFiles` 初始化，哪些因已有内容而跳过
- 是否存在跳过或冲突
- 后续建议
