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
- 选择 Git 可见性策略，决定初始化产物是本地保留、公开审查还是团队共享

## 安装方式

本插件可通过统一 marketplace 安装：

```text
/plugin marketplace add Dec27-Lee/claude-plugins-vault
/plugin install claude-project-init@claude-plugins-vault
/reload-plugins
```

安装后先查看可安装技能清单：

```text
/claude-project-init:list
```

然后执行初始化：

```text
/claude-project-init:init
```

## 插件命令

### 查看可安装技能清单

```text
/claude-project-init:list
```

该技能只读展示：

- 核心初始化项
- 可安装 workspace skill packs
- presets
- Git 可见性策略
- 下一步初始化建议

### 初始化工作区

```text
/claude-project-init:init
```

该技能会：

1. 展示可安装 workspace skill packs；如果用户只是想查看清单，应引导使用 `/claude-project-init:list`
2. 让用户选择推荐组合、思考实验室组合、全部安装或手动选择具体 packs
3. 选择 Git 可见性策略，判断初始化产物适合本地保留还是共享提交
4. 先生成 dry-run 计划
5. 用户确认后再写入目标工作区

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

## CLI

插件提供确定性 CLI，供 skill 调用，也可本地开发测试。

```bash
claude-project-init list
claude-project-init plan --target . --recommended
claude-project-init plan --target . --preset thinking-lab
claude-project-init plan --target . --all
claude-project-init plan --target . --no-packs
claude-project-init plan --target . --packs work-journal,clear-thinking
claude-project-init plan --target . --packs thinking-distiller
claude-project-init plan --target . --recommended --require-git-policy
claude-project-init plan --target . --recommended --git-policy source-repo
claude-project-init apply --target . --preset thinking-lab --git-policy public-repo --write-git-exclude --yes
```

开发时可直接使用 Node：

```bash
node bin/claude-project-init.mjs list
node bin/claude-project-init.mjs plan --target . --recommended
```

## Presets

| Preset | Packs |
| --- | --- |
| `recommended` | `work-journal`, `clear-thinking` |
| `thinking-lab` | `work-journal`, `clear-thinking`, `thinking-distiller` |

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
- 默认不修改 `.gitignore`
- 只有显式传入 `--write-git-exclude` 时，才写入目标仓库本地 `.git/info/exclude`
- `.git/info/exclude` 只影响本机未跟踪文件；已被 Git 跟踪的文件不会因此自动取消跟踪
- 不覆盖已有不同内容的 skill 文件
- `initFiles` 使用 `create-if-missing`，保留用户已有长期数据
- 目录资源递归复制时使用二进制安全复制，并跳过 `.state`、`__pycache__`、`records`、`.tmp`、`.claude/worktrees` 等运行态或历史目录
- `CLAUDE.md` 和索引文件只更新受控块
- `.claude/settings.json` 只做保守初始化和 `$schema` 补齐
- 目标路径如包含符号链接或 junction，会拒绝写入

## Git 可见性策略

初始化会生成 `CLAUDE.md`、`.claude/`、`local/` 等工作区文件。它们是否应该提交到仓库，取决于工作区性质。CLI 支持 `--git-policy` 给出 plan 提示，并可在用户显式要求时写入本地 `.git/info/exclude`。

`/claude-project-init:init` 应在运行 plan 前让用户明确选择策略；CLI 也提供 `--require-git-policy`，用于防止交互入口漏问。若未传 `--git-policy` 且启用该参数，CLI 会直接报错提示必须选择策略。

| 策略 | 适用场景 | 提交建议 | 本地 exclude 建议 |
| --- | --- | --- | --- |
| `local-only` | 个人本地工作区 | `CLAUDE.md`、`.claude/`、`local/` 都只本地保留 | `/CLAUDE.md`、`/.claude/`、`/local/` |
| `public-repo` | 公开仓库 | `CLAUDE.md` 审查后可提交；`.claude/`、`local/` 默认不提交 | `/.claude/`、`/local/` |
| `team-shared` | 私有团队仓库 | 可共享团队确认的 `CLAUDE.md`、`.claude/settings.json`、workspace skills 和索引 | 排除 records、sessions、worktrees、state 等运行态内容 |
| `source-repo` | 插件或 skill 源码仓库 | 不提交 dogfood 生成的 `CLAUDE.md`、`.claude/`、`local/`；需要公开贡献规则时单独整理 | `/CLAUDE.md`、`/.claude/`、`/local/` |

示例：

```bash
claude-project-init plan --target . --recommended --require-git-policy
claude-project-init plan --target . --recommended --git-policy source-repo
claude-project-init apply --target . --recommended --git-policy source-repo --write-git-exclude --yes
```

`--write-git-exclude` 只写本地 `.git/info/exclude`，不会修改仓库 `.gitignore`，也不会提交任何 Git 变更。

如果更新插件后仍看不到 Git 策略选择或清单入口，请确认安装版本至少为 `0.1.2`，然后执行 `/reload-plugins` 后重新调用 `/claude-project-init:list` 或 `/claude-project-init:init`。

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
        └── thinking-distiller/
            ├── SKILL.md
            └── resources/
```

这棵树表示目标工作区的初始化结果。如果目标工作区本身是插件或 skill 源码仓库，例如本仓库，生成的 `.claude/`、`local/`、`CLAUDE.md` 通常只是本地 dogfood 产物，不应和 `resources/packs/`、`skills/` 等源码一起提交。

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
│   ├── init/
│   │   └── SKILL.md
│   └── list/
│       └── SKILL.md
├── package.json
└── README.md
```

## 维护方向

- 按需增加更多可选 skill packs。
- hooks 资源默认仅复制，不自动启用；启用前应由用户审查并手动合并 settings。
- 继续保持 plan-first、无网络、无依赖安装、无自动提交 Git 的保守初始化策略。
- 发布通过 `Dec27-Lee/claude-plugins-vault` 统一 marketplace 分发。
