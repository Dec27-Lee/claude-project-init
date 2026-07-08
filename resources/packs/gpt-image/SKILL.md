---
name: gpt-image
description: 通过用户配置的 OpenAI-compatible 图片接口调用 gpt-image-2 生成本地图片。适用于 PPT 配图、封面图、产品插画、概念视觉、HTML/PPT 辅助素材等需要落盘的生图需求。
version: 1.1.0
---

# gpt-image

当前工作区的本地生图技能：把用户的图片需求整理成高质量提示词，通过用户配置的 OpenAI-compatible 图片接口调用 `gpt-image-2`，并把图片保存到工作区文件中。

## 适用场景

优先用于：

- 用户要求“生成图片 / 生图 / 画一张图 / 出一张配图”，并希望结果保存为本地文件。
- PPT、汇报材料、HTML 截图库、封面、海报、产品插画、概念视觉需要图片素材。
- 用户明确要求使用中转站、OpenAI-compatible 图片接口或 `gpt-image-2`。
- 需要批量生成多张同风格图片，并保存到工作区目录。

不用于：

- 只需要 HTML/CSS/SVG 精确排版的页面、图表或流程图。
- 用户明确要求不要落盘、只给 prompt、只给建议。
- 需要图片编辑、局部重绘、参考图融合时，除非当前执行脚本已扩展对应接口；否则先说明当前技能只支持文本生图。

## 默认模型和接口

- 默认模型：`gpt-image-2`。
- 默认执行脚本：`.claude/skills/gpt-image/resources/gpt-image-generate.ps1`。
- 优先读取环境变量：
  - `GPT_IMAGE_BASE_URL`
  - `GPT_IMAGE_API_KEY`
  - `GPT_IMAGE_MODEL`
  - `OPENAI_BASE_URL`
  - `OPENAI_API_KEY`
- 默认不会把 `ANTHROPIC_AUTH_TOKEN` 当作图片接口密钥使用。
- 只有在用户明确确认当前 Claude 中转站提供 OpenAI-compatible `/v1/images/generations` 接口时，才可以给脚本传入 `-AllowAnthropicFallback`，让脚本尝试读取：
  - `ANTHROPIC_BASE_URL`
  - `ANTHROPIC_AUTH_TOKEN`

注意：不要在回复中打印 token、key、Authorization 头或完整带密钥的命令。

## 执行流程

1. **确认输出目标**
   - 若用户已经给出用途、风格、尺寸、保存目录，直接执行。
   - 若缺少保存路径，默认保存到当前任务相关目录；没有上下文时保存到 `_generated/images/`。
   - 若用于 PPT/汇报，默认使用 16:9：`1536x864`，除非用户指定其他尺寸。

2. **整理提示词**
   - 用用户真实业务内容写 prompt，避免空泛“科技感”。
   - PPT 配图默认要求：16:9、适合汇报、无大段文字、无水印、主体明确、风格统一。
   - 除非用户明确要求，避免让模型在图里生成中文小字；中文文字后期在 PPT/HTML 中排版更可靠。

3. **调用本地脚本**

   PowerShell 示例：

   ```powershell
   $script = Join-Path (Get-Location) ".claude/skills/gpt-image/resources/gpt-image-generate.ps1"
   & $script `
     -Prompt "一张 16:9 的停车场经营分析 Agent 汇报配图，现代商务风格，主体是一座停车楼与 AI 调度中枢，画面干净克制，无文字，无水印" `
     -OutputPath "_generated/images/parking-agent.png" `
     -Size "1536x864"
   ```

   在 Claude Code 的 Bash 环境中，也可以使用：

   ```bash
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File ".claude/skills/gpt-image/resources/gpt-image-generate.ps1" \
     -Prompt "一张 16:9 的停车场经营分析 Agent 汇报配图，现代商务风格，主体是一座停车楼与 AI 调度中枢，画面干净克制，无文字，无水印" \
     -OutputPath "_generated/images/parking-agent.png" \
     -Size "1536x864"
   ```

4. **验证输出**
   - 检查脚本是否返回 `Saved:` 路径。
   - 对关键视觉产物，读取生成的图片做肉眼复核。
   - 如果失败，按错误类型处理：
     - 401/403：检查 token 或中转站权限。
     - 404：检查 base URL 是否是 OpenAI-compatible 的 `/v1` 地址。
     - 400：检查模型名、尺寸、质量参数是否被中转站支持。

5. **交付说明**
   - 回复用户图片保存路径、尺寸、模型和是否已复核。
   - 如果没有实际调用成功，不要说“已生成”。

## 提示词模板

### PPT 汇报配图

```text
Create a clean 16:9 presentation illustration for a business report.
Subject: <业务主体>.
Scene: <业务场景>.
Visual metaphor: <主视觉隐喻>.
Style: modern enterprise presentation, warm neutral background, realistic but slightly editorial, high-end consulting deck visual, clear composition, no dashboard clutter.
Constraints: no watermark, no UI gibberish, no dense text, no random numbers, no logos unless provided, leave clean negative space for PPT title.
```

### 产品概念图

```text
Create a high-quality product concept image.
Product: <产品/能力>.
Users: <用户角色>.
Core interaction: <关键交互>.
Environment: <真实使用场景>.
Style: polished product marketing visual, credible SaaS/AI product atmosphere, not cyberpunk, not generic purple gradient.
Constraints: no watermark, no unreadable text, no fake brand logo.
```

### 批量同风格图片

批量时先固定一段风格锚点，再逐张替换主体：

```text
Global style anchor: 16:9, modern Chinese enterprise presentation illustration, warm off-white background, restrained blue-green accent, semi-realistic editorial rendering, clean space, no text, no watermark.
Page subject: <第 N 页主题>.
Specific scene: <本页场景>.
Main objects: <主体物>.
```

## 质量边界

- 生图适合做“画面型配图”，不适合生成大量准确文字、表格、复杂 UI 文案。
- 对正式品牌、客户、真实人物或已发布产品，必须先确认是否有官方素材；不要用 AI 编造 Logo、真实产品外观或客户现场。
- 生成图片如果用于正式对外材料，需要人工复核事实、版权和品牌边界。
- 本技能会调用外部或中转站图片接口；只有用户实际要求生成图片时才执行脚本。
