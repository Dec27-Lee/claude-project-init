# Development

## 本地校验

```bash
node scripts/validate-plugin.mjs
```

## 查看可安装 packs

```bash
node bin/claude-project-init.mjs list
node bin/claude-project-init.mjs list --json
```

## 生成 dry-run plan

```bash
node bin/claude-project-init.mjs plan --target . --recommended
node bin/claude-project-init.mjs plan --target . --preset thinking-lab
node bin/claude-project-init.mjs plan --target . --packs thinking-distiller
node bin/claude-project-init.mjs plan --target . --recommended --require-git-policy
node bin/claude-project-init.mjs plan --target . --recommended --git-policy source-repo
node bin/claude-project-init.mjs plan --target . --no-packs
```

`thinking-distiller` 依赖 `clear-thinking`；即使只传 `--packs thinking-distiller`，plan 也会自动带入 `clear-thinking`，并在 JSON 中标记 `selectionReason: "dependency"`。

## 在临时目录测试 apply

```bash
mkdir -p .tmp/demo-workspace
node bin/claude-project-init.mjs apply --target .tmp/demo-workspace --preset thinking-lab --git-policy local-only --yes
```

然后检查：

```text
.tmp/demo-workspace/CLAUDE.md
.tmp/demo-workspace/.claude/settings.json
.tmp/demo-workspace/.claude/workspace-index.md
.tmp/demo-workspace/.claude/skills/INDEX.md
.tmp/demo-workspace/.claude/skills/clear-thinking/resources/
.tmp/demo-workspace/.claude/skills/thinking-distiller/resources/
.tmp/demo-workspace/local/work-journal/index.md
.tmp/demo-workspace/local/thinking-distiller/index.md
.tmp/demo-workspace/.claude/project-init.lock.json
```

重复运行同一条 apply 或 plan，预期资源文件变为 `skip-same` / `sync-dir` 中 `skipSameCount` 增加，`initFiles` 变为 `skip-init-same` 或 `skip-init-existing`，不应覆盖用户已有不同内容。

本仓库本身是插件源码仓库。如在本仓库 dogfood 初始化，请使用 `--git-policy source-repo`；生成的 `CLAUDE.md`、`.claude/`、`local/` 默认不作为源码提交。若要本地防误提交，可显式传入 `--write-git-exclude` 写入 `.git/info/exclude`。

## 作为 Claude Code 插件测试

```bash
claude --plugin-dir .
```

进入 Claude Code 后执行：

```text
/claude-project-init:init
```

## 新增 skill pack

1. 新建目录：

```text
resources/packs/<pack-id>/
```

2. 添加基本文件：

```text
pack.json
SKILL.md
```

3. 如技能有完整资源目录，放在 pack 内，例如：

```text
resources/packs/<pack-id>/resources/
```

并在 `pack.json` 中声明目录复制：

```json
{
  "files": [
    {
      "from": "SKILL.md",
      "to": "SKILL.md",
      "mode": "copy"
    },
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
  ]
}
```

4. 如技能依赖其他 pack，声明 `dependencies`：

```json
{
  "dependencies": ["clear-thinking"]
}
```

5. 如技能需要初始化工作区长期资料，使用 `initFiles`，并只用 `create-if-missing`：

```json
{
  "initFiles": [
    {
      "from": "init/local/example/index.md",
      "to": "local/example/index.md",
      "mode": "create-if-missing",
      "description": "初始化 example 二级索引"
    }
  ]
}
```

6. 如技能需要进入 `.claude/workspace-index.md`，声明入口级索引：

```json
{
  "workspaceIndexEntries": {
    "secondaryIndexes": [
      {
        "path": "local/example/index.md",
        "scope": "example 长期记录",
        "contents": "日期、主题、状态、记录路径和备注",
        "next": "命中的 local/example/records/*.md"
      }
    ],
    "assets": [
      {
        "path": ".claude/skills/example/resources/",
        "purpose": "example 技能资源入口"
      }
    ]
  }
}
```

7. 更新：

```text
resources/manifest.json
README.md
```

8. 运行校验和 smoke test：

```bash
node scripts/validate-plugin.mjs
node bin/claude-project-init.mjs list --json
node bin/claude-project-init.mjs plan --target .tmp/demo-workspace --all --json
node bin/claude-project-init.mjs plan --target . --recommended --git-policy source-repo --json
node bin/claude-project-init.mjs plan --target . --recommended --git-policy team-shared --json
node bin/claude-project-init.mjs plan --target . --recommended --require-git-policy --git-policy source-repo --json
```

## 目录资源导入守则

- 不导入运行态缓存：`.state`、`__pycache__`、`*.pyc`、`.tmp`。
- 不导入历史记录：`records/` 下的真实记录不进入 pack；需要目录时只通过 `initFiles` 创建 `.gitkeep`。
- 不导入工作树：`.claude/worktrees/` 不进入 pack。
- 不把用户长期数据放进 `.claude/skills/<skill>/`；长期数据应放在 `local/<skill>/`。
- hooks 只能作为资源复制，默认不启用；如需启用，应让用户人工审查后合并 settings。

## Marketplace 条目示例

在 `claude-plugins-vault` 的 `.claude-plugin/marketplace.json` 中维护以下条目：

```json
{
  "name": "claude-project-init",
  "displayName": "Claude Project Init",
  "description": "为新工作区交互式安装 workspace skills，并初始化 CLAUDE.md、.claude/workspace-index.md、.claude/settings.json、技能索引和 skill 声明的 local 文件。",
  "source": {
    "source": "github",
    "repo": "Dec27-Lee/claude-project-init",
    "ref": "main"
  },
  "author": {
    "name": "Dec27-Lee"
  },
  "homepage": "https://github.com/Dec27-Lee/claude-project-init",
  "repository": "https://github.com/Dec27-Lee/claude-project-init"
}
```
