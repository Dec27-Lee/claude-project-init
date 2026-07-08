# Architecture

`claude-project-init` 采用“插件入口 skill + 确定性 CLI + 声明式资源包”的结构。

## 组成

```text
skills/list/SKILL.md          # 可安装技能清单入口
skills/init/SKILL.md          # 用户调用入口
skills/audit/SKILL.md         # 只读检查入口
bin/claude-project-init.mjs   # 确定性安装 CLI
resources/manifest.json       # skill pack 清单和 presets
resources/packs/*             # 可安装的 workspace skills，例如 work-journal、clear-thinking、thinking-distiller、gpt-image
resources/templates/*         # CLAUDE.md / settings / index 模板
```

## 为什么使用 CLI

初始化工作区涉及文件复制、目录递归、路径安全、JSON 合并和幂等判断。相比完全让模型自由写文件，CLI 更适合处理：

- 路径越界保护
- 符号链接 / junction 写入保护
- 冲突检测
- dry-run plan
- 幂等 apply
- 二进制安全资源复制
- 受控块更新

Skill 负责交互和决策，CLI 负责确定性执行。

## 执行流程

1. 用户可先调用 `/claude-project-init:list` 查看核心初始化项、可选 pack、presets 和 Git 可见性策略。
2. 用户调用 `/claude-project-init:init`。
3. Skill 调用 `claude-project-init list` 展示核心初始化项和可选 pack。
4. 用户选择 preset 或 pack 列表。
5. CLI 对所选 pack 做依赖闭包解析，例如 `thinking-distiller` 会自动带入 `clear-thinking`。
6. Skill 调用 `claude-project-init plan --target <path> ...`。
   - 如果只想根据已有 `.claude/skills` 初始化/刷新 `CLAUDE.md` 和 `.claude/workspace-index.md`，使用 `--no-packs`。
   - 如果只想安装本地生图能力，可使用 `--preset image-lab` 或 `--packs gpt-image`。
7. Skill 展示 plan，等待用户确认。
8. 用户确认后，Skill 调用 `claude-project-init apply --target <path> ... --yes`。
9. CLI 写入目标工作区并生成 lock 文件。

## 核心初始化项

`CLAUDE.md` 和 `.claude/workspace-index.md` 是一组配套核心初始化项，而不是某个 pack 的附属文件：

- `CLAUDE.md`：记录工作区规则、协作约束和已安装 skills 摘要。
- `.claude/workspace-index.md`：跟随 `CLAUDE.md` 初始化/刷新，记录入口级导航、二级索引入口和重要 Claude 资产。
- `.claude/settings.json`：项目级 settings 保守初始化。
- `.claude/skills/INDEX.md`：已安装 workspace skills 索引。
- `.claude/project-init.lock.json`：安装状态记录。

pack 的 `workspaceIndexEntries` 只负责向 `.claude/workspace-index.md` 补充二级索引或资源入口，例如 `local/work-journal/index.md` 或 `.claude/skills/clear-thinking/resources/`。

## Git 可见性策略

`CLAUDE.md`、`.claude/` 和 `local/` 是否应该提交，不由 pack 决定，而由目标工作区的 Git 可见性策略决定。CLI 支持：

- `local-only`：个人本地使用，初始化产物只本地保留。
- `public-repo`：公开仓库，`CLAUDE.md` 需审查后才提交，`.claude/` 和 `local/` 默认本地保留。
- `team-shared`：私有团队共享，可提交团队确认的 Claude 配置和 workspace skills，但排除 records、sessions、worktrees、state 等运行态内容。
- `source-repo`：插件或 skill 源码仓库，初始化结果通常只是 dogfood 产物，不应和 `resources/packs/`、`skills/` 源码重复提交。

Git 可见性策略是横切策略，不属于某个 pack。默认只在 plan 中提示；只有用户显式传入 `--write-git-exclude` 时，apply 才写入本地 `.git/info/exclude`。CLI 不自动修改仓库 `.gitignore`，也不执行 Git 命令。

## 安全边界

CLI 不会：

- 修改用户全局配置
- 访问网络
- 安装依赖
- 执行目标项目命令
- 自动提交 Git
- 自动修改仓库 `.gitignore`
- 在未显式传入 `--write-git-exclude` 时修改 `.git/info/exclude`
- 覆盖已有不同内容的 skill 文件
- 覆盖 `initFiles` 指向的用户长期数据
- 在安装 `gpt-image` 等可选外部能力时自动调用网络接口或写入凭证

如果发现同名 skill 文件存在且内容不同，plan 会标记 conflict，apply 会拒绝执行。`initFiles` 的目标已存在但内容不同，则按 `create-if-missing` 语义跳过并保留用户内容。

## 资源包格式

每个 pack 包含：

```text
resources/packs/<pack-id>/
├── pack.json
├── SKILL.md
├── resources/      # 可选，完整技能资源目录
└── init/           # 可选，目标工作区初始化模板
```

`pack.json` 声明：

- `id`
- `name`
- `version`
- `description`
- `category`
- `recommended`
- `target`
- `dependencies`
- `files`
- `initFiles`
- `workspaceIndexEntries`
- `postInstallNotes`

### files

`files` 描述复制到 `.claude/skills/<skill>/` 下的技能文件和资源。

单文件复制：

```json
{
  "from": "SKILL.md",
  "to": "SKILL.md",
  "mode": "copy"
}
```

目录复制：

```json
{
  "from": "resources",
  "to": "resources",
  "mode": "copy",
  "type": "directory",
  "exclude": [
    "**/.state/**",
    "**/__pycache__/**",
    "**/*.pyc"
  ]
}
```

目录复制会递归枚举普通文件并用 Buffer 复制，避免破坏二进制资源。默认还会跳过 `.state`、`__pycache__`、`records`、`.tmp`、`.claude/worktrees` 等运行态或历史目录。历史记录目录如需初始化，只能通过 `initFiles` 显式创建占位文件。

### dependencies

`dependencies` 声明 pack 依赖。选择某个 pack 后，CLI 会自动把依赖加入 plan，并在 JSON 中标记：

```json
{
  "id": "clear-thinking",
  "selectionReason": "dependency"
}
```

未知依赖或循环依赖会被 CLI 和 validator 拒绝。

### initFiles

有些技能安装后不能只复制 `SKILL.md`，还需要初始化运行目录或二级索引。例如 `work-journal` 需要：

```text
local/README.md
local/work-journal/index.md
local/work-journal/records/
```

这类文件由 pack 的 `initFiles` 声明：

```json
{
  "initFiles": [
    {
      "from": "init/local/work-journal/index.md",
      "to": "local/work-journal/index.md",
      "mode": "create-if-missing",
      "description": "初始化工作日志二级索引"
    }
  ]
}
```

`create-if-missing` 的含义是：

- 目标不存在：创建
- 目标已存在且内容相同：跳过
- 目标已存在但内容不同：保留用户内容，plan 中显示 `skip-init-existing`

这样安装技能后，Claude Code 会通过 `claude-project-init apply` 同步完成技能所需工作区初始化，但不会覆盖用户已有数据。

### workspaceIndexEntries

`workspaceIndexEntries` 让 pack 自己声明应进入 `.claude/workspace-index.md` 的入口，避免 CLI 硬编码具体技能。

```json
{
  "workspaceIndexEntries": {
    "secondaryIndexes": [
      {
        "path": "local/thinking-distiller/index.md",
        "scope": "方法蒸馏过程记录",
        "contents": "日期、材料、目标问题域、过程目录、接入状态和备注",
        "next": "命中的 local/thinking-distiller/sessions/*/"
      }
    ],
    "assets": [
      {
        "path": ".claude/skills/thinking-distiller/resources/",
        "purpose": "蒸馏协议、模板、接入规则和质量检查"
      }
    ]
  }
}
```

索引只登记入口级资料和长期资料位置，不登记完整资源树。`workspaceIndexEntries` 是可选字段：只有需要进入入口级索引的长期资料、二级索引或重要资源入口才声明；只有 `SKILL.md`、没有长期资料或资源目录的 pack 可以不声明。

## Validator

`scripts/validate-plugin.mjs` 会校验：

- plugin manifest
- skills 目录
- manifest pack 引用
- pack 文件 / 目录资源是否存在
- `files[].type` 和 `files[].mode`
- `initFiles` 的 `create-if-missing` 语义
- `dependencies` 是否引用存在 pack，且无循环
- `workspaceIndexEntries` schema
- templates 是否存在
