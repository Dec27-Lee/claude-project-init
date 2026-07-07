# claude-project-init

`claude-project-init` 是一个 Claude Code 插件，用于在新工作区中交互式安装 workspace skills，并初始化项目级 Claude Code 配置。

它的目标是：

- 让用户选择要安装到当前工作区的 skills
- 将所选 skills 写入目标工作区 `.claude/skills/`
- 支持复制完整技能资源目录，例如 `clear-thinking/resources/`
- 根据 pack 依赖自动补齐必需技能，例如选择 `thinking-distiller` 时自动带入 `clear-thinking`
- 生成或合并 `CLAUDE.md`
- 生成或合并 `.claude/settings.json`
- 生成或更新 `.claude/skills/INDEX.md`
- 根据 pack 声明生成或更新 `.claude/workspace-index.md`
- 执行各 skill pack 声明的工作区初始化，例如创建 `local/work-journal/index.md`
- 根据现有 `.claude/skills` 刷新通用 `CLAUDE.md` 规则块
- 写入 `.claude/project-init.lock.json` 记录安装状态

## 安装方式

本插件可通过统一 marketplace 安装：

```text
/plugin marketplace add Dec27-Lee/claude-plugins-vault
/plugin install claude-project-init@claude-plugins-vault
/reload-plugins
```

安装后使用：

```text
/claude-project-init:init
```

## 插件命令

### 初始化工作区

```text
/claude-project-init:init
```

该技能会：

1. 展示可安装 workspace skill packs
2. 让用户选择推荐组合、最小组合、思考实验室组合、设计组合、全部安装或手动选择
3. 先生成 dry-run 计划
4. 用户确认后再写入目标工作区

### 检查初始化状态

```text
/claude-project-init:audit
```

只读检查当前工作区是否已通过本插件初始化。

## 核心初始化项

这些项目不属于某个 skill pack，只要执行初始化流程就会进入 plan：

| 路径 | 说明 |
| --- | --- |
| `CLAUDE.md` | 工作区 Claude Code 协作规则 |
| `.claude/workspace-index.md` | 跟随 `CLAUDE.md` 初始化/刷新，是入口级导航配套索引 |
| `.claude/settings.json` | 项目级 Claude Code settings 保守初始化 |
| `.claude/skills/INDEX.md` | 已安装 workspace skills 索引 |
| `.claude/project-init.lock.json` | claude-project-init 安装状态记录 |

`workspace-index.md` 的定位是 `CLAUDE.md` 的配套导航文件：`CLAUDE.md` 写规则，`workspace-index.md` 记录入口级索引；skill pack 只通过 `workspaceIndexEntries` 往其中补充二级索引或资源入口。

## 内置 skill packs

| Pack | 默认推荐 | 用途 |
| --- | --- | --- |
| `work-journal` | 是 | 工作日志：记录需求、过程、决策、验证和完成检查；初始化 `local/work-journal/` |
| `clear-thinking` | 是 | 复杂判断与规划：目标不清、多目标冲突、方案取舍和复盘；包含完整 `resources/` 微技能资源 |
| `thinking-distiller` | 否 | 方法蒸馏：把书籍、文章、演讲、访谈或研究资料提炼为 clear-thinking 可复用判断动作；依赖 `clear-thinking` |
| `project-docs` | 是 | 项目文档：维护 CLAUDE.md、项目说明和工作区索引 |
| `verify-flow` | 是 | 验证流程：推动测试、类型检查、启动验证和结果报告 |
| `frontend-design-guide` | 否 | 前端设计：页面、组件、交互状态和视觉一致性判断 |

## CLI

插件提供确定性 CLI，供 skill 调用，也可本地开发测试。

```bash
claude-project-init list
claude-project-init plan --target . --recommended
claude-project-init plan --target . --preset minimal
claude-project-init plan --target . --preset design
claude-project-init plan --target . --preset thinking-lab
claude-project-init plan --target . --all
claude-project-init plan --target . --no-packs
claude-project-init plan --target . --packs work-journal,clear-thinking
claude-project-init plan --target . --packs thinking-distiller
claude-project-init apply --target . --preset thinking-lab --yes
```

开发时可直接使用 Node：

```bash
node bin/claude-project-init.mjs list
node bin/claude-project-init.mjs plan --target . --recommended
```

## Presets

| Preset | Packs |
| --- | --- |
| `recommended` | `work-journal`, `clear-thinking`, `project-docs`, `verify-flow` |
| `minimal` | `project-docs`, `verify-flow` |
| `design` | `work-journal`, `clear-thinking`, `project-docs`, `verify-flow`, `frontend-design-guide` |
| `thinking-lab` | `work-journal`, `clear-thinking`, `thinking-distiller`, `project-docs`, `verify-flow` |

> 依赖会自动补齐：如果手动只选择 `thinking-distiller`，plan 中也会出现 `clear-thinking`，并标记为 `selectionReason: "dependency"`。

## 安全策略

`claude-project-init` 默认遵守保守写入原则：

- 写入前先生成 plan
- 用户确认后才 apply
- 不修改用户全局 `~/.claude`
- 不安装依赖
- 不访问网络
- 不执行项目命令
- 不提交 Git
- 不覆盖已有不同内容的 skill 文件
- `initFiles` 使用 `create-if-missing`，保留用户已有长期数据
- 目录资源递归复制时使用二进制安全复制，并跳过 `.state`、`__pycache__`、`records`、`.tmp`、`.claude/worktrees` 等运行态或历史目录
- `CLAUDE.md` 和索引文件只更新受控块
- `.claude/settings.json` 只做保守初始化和 `$schema` 补齐
- 目标路径如包含符号链接或 junction，会拒绝写入

## 目标工作区生成结构

以 `thinking-lab` preset 为例，执行初始化后，目标工作区可能生成：

```text
<workspace>/
├── CLAUDE.md
├── local/
│   ├── README.md
│   ├── work-journal/
│   │   ├── index.md
│   │   └── records/
│   │       └── .gitkeep
│   └── thinking-distiller/
│       ├── index.md
│       └── sessions/
│           └── .gitkeep
└── .claude/
    ├── project-init.lock.json
    ├── settings.json
    ├── workspace-index.md
    └── skills/
        ├── INDEX.md
        ├── work-journal/
        │   ├── SKILL.md
        │   └── resources/   # 只复制 hook 示例等少量资源，不复制历史记录
        ├── clear-thinking/
        │   ├── SKILL.md
        │   └── resources/
        ├── thinking-distiller/
        │   ├── SKILL.md
        │   └── resources/
        ├── project-docs/
        │   └── SKILL.md
        └── verify-flow/
            └── SKILL.md
```

## 开发

校验插件结构：

```bash
node scripts/validate-plugin.mjs
```

Smoke test：

```bash
npm run test:smoke
```

本地作为插件加载：

```bash
claude --plugin-dir .
```

## 仓库结构

```text
claude-project-init/
├── .claude-plugin/
│   └── plugin.json
├── .github/
│   └── workflows/
│       └── validate.yml
├── bin/
│   └── claude-project-init.mjs
├── docs/
├── resources/
│   ├── manifest.json
│   ├── packs/
│   └── templates/
├── scripts/
│   └── validate-plugin.mjs
├── skills/
│   ├── audit/
│   │   └── SKILL.md
│   └── init/
│       └── SKILL.md
├── package.json
└── README.md
```

## 维护方向

- 按需增加更多可选 skill packs。
- hooks 资源默认仅复制，不自动启用；启用前应由用户审查并手动合并 settings。
- 继续保持 plan-first、无网络、无依赖安装、无自动提交 Git 的保守初始化策略。
- 发布通过 `Dec27-Lee/claude-plugins-vault` 统一 marketplace 分发。
