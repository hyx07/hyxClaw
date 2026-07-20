# hyxClaw

本地运行的知识库 AI 助手，提供 Web 对话界面、会话管理、受限文件操作、Markdown 知识库和 Token 用量统计。

## 环境要求

- Node.js >= 22.16.0
- pnpm >= 10.23.0

## 快速开始

```powershell
pnpm install

在项目根目录创建 .env，并指定用户数据目录
```
HYXCLAW_DATA_DIR=C:\MyData
```

# 复制模板、创建所需目录，并生成配置文件
pnpm dev init

# 编辑 ${HYXCLAW_DATA_DIR}\config.json，填入模型提供商和搜索提供商的 API Key；默认模型提供商API Key必填，否则无法启动，其他API Key不填则相应功能禁用。

pnpm build
pnpm start
```

浏览器打开 `http://127.0.0.1:3000`。启动时也可使用 `pnpm start -- -p 8080` 或 `pnpm start -- --host 0.0.0.0` 覆盖端口和地址。

`HYXCLAW_DATA_DIR` 必须设置；程序不会为它选择默认目录。初始化不会覆盖数据目录中已有的文件。

## 配置

首次执行 `init` 后，模板配置写入 `{HYXCLAW_DATA_DIR}/config.json`。当前可用字段以 [templates/config.json](templates/config.json) 为准；以下示例展示配置结构：

```jsonc
{
  "providers": {
    "zai": {
      "apiKey": "填入你的api key",
      "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
      "models": [
        {
          "id": "GLM-5.2",
          "label": "GLM-5.2",
          "thinking": [
            { "id": "enabled", "params": { "thinking": { "type": "enabled" } } }
          ],
          "thinkingOff": { "thinking": { "type": "disabled" } }
        }
      ]
    },
    "dashscope": {
      "apiKey": "填入你的api key",
      "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
      "models": [
        {
          "id": "qwen3.6-flash",
          "label": "qwen3.6-flash",
          "modal": "vl",
          "thinking": [
            { "id": "512", "params": { "enable_thinking": true, "thinking_budget": 512 } },
            { "id": "1024", "params": { "enable_thinking": true, "thinking_budget": 1024 } },
            { "id": "4096", "params": { "enable_thinking": true, "thinking_budget": 4096 } },
            { "id": "8192", "params": { "enable_thinking": true, "thinking_budget": 8192 } }
          ],
          "thinkingOff": { "enable_thinking": false }
        },
        {
          "id": "deepseek-v4-flash",
          "label": "v4-flash",
          "thinking": [
            { "id": "high", "params": { "enable_thinking": true, "reasoning_effort": "high" } },
            { "id": "max", "params": { "enable_thinking": true, "reasoning_effort": "max" } }
          ],
          "thinkingOff": { "enable_thinking": false }
        }
      ]
    },
    "deepseek": {
      "apiKey": "填入你的api key",
      "baseUrl": "https://api.deepseek.com",
      "models": [
        {
          "id": "deepseek-v4-flash",
          "label": "v4-flash",
          "thinking": [
            { "id": "high", "params": { "thinking": { "type": "enabled" }, "reasoning_effort": "high" } },
            { "id": "max", "params": { "thinking": { "type": "enabled" }, "reasoning_effort": "max" } }
          ],
          "thinkingOff": { "thinking": { "type": "disabled" } }
        }
      ]
    }
  },
  "defaultProvider": "deepseek",
  "defaultModel": "deepseek-v4-flash",
  "defaultThinkingEffort": "high",
  "maxTokens": 8192,
  "contextMaxTokens": 500000,
  "contextMaxMessages": 0,
  "maxToolCalls": 30,
  "server": { "port": 3000, "host": "127.0.0.1" },
  "fs": {
    "allowedDirs": ["inputs", "knowledge_base", "files"],
    "allowedFiles": []
  },
  "tools": {
    "tavily": {
      "enabled": true,
      "apiKey": "",
      "baseUrl": "https://api.tavily.com",
      "searchDepth": "basic",
      "maxResults": 10,
      "includeAnswer": false,
      "includeRawContent": false,
      "includeUsage": false,
      "timeoutMs": 30000,
      "maxSearchContentChars": 2000,
      "fetchDepth": "basic",
      "fetchFormat": "markdown",
      "maxFetchedChars": 50000
    }
  },
  "compaction": {
    "provider": "deepseek",
    "model": "deepseek-v4-flash",
    "thinkingEffort": "none"
  }
}
```

说明：

- `defaultModel` 必须属于 `defaultProvider` 的 `models`。
- `thinking` 是模型支持的思考选项。每个选项通过 `params` 原样传给该提供商；`thinkingOff` 定义关闭思考时的参数。
- `modal: "vl"` 可标记支持视觉输入的模型。
- 文件工具只能访问 `fs.allowedDirs` 与 `fs.allowedFiles`。路径均相对于数据目录。
- Tavily 配置完整字段和默认值见 [schema.ts](src/config/schema.ts)。

## 功能

- 多会话对话：创建、切换、重命名、删除、截断与 LLM 摘要压缩
- 流式响应：流式输出正文、思考过程和工具调用
- 多模型配置：目前支持智谱、阿里百炼和 DeepSeek；模型可分别声明视觉能力及原生思考参数
- 文件与图片：在允许的数据目录中读取、写入、编辑、搜索、移动和删除文件；`read` 工具同时支持文本与图片（视觉模型可读取允许目录中的图片），对话框支持粘贴图片附件
- Web 搜索：可选启用 Tavily 搜索和网页抓取
- 知识库与文档：浏览、编辑 Markdown 文档，维护知识库索引
- 用量统计：按提供商、模型和日期记录 Token 使用量和费用，以及总量
- 本地存储：会话、配置、提示词和统计数据均保存在本地数据目录

## 操作说明
项目已内置操作说明，可以询问AI具体操作。

### 面板介绍

- **左侧栏**：管理会话，可新建、切换、重命名和删除会话。
- **中间信息流**：显示当前会话的对话、思考过程和工具调用状态；底部可选择模型与思考强度、设置写入权限并发送消息。
- **右侧栏**：浏览 `knowledge_base/` 与 `inputs/` 中的文档，可预览和编辑文本，并将打开文件或选中文字作为下一条消息的上下文。

### 一般流程

1. 外部文件或图片放入${HYXCLAW_DATA_DIR}/inputs/中，或提供网址供AI读取
2. 与AI聊天总结该文档主要内容
3. 要求AI在某个现有知识库建立新文件；或要求AI建立新的知识库，并写入该新文件。

### 系统 Prompt

系统提示词文件位于 `files/prompts/agent_system_prompt.txt`，初始化时从模板复制。每次对话启动时程序会读取该文件并在末尾自动追加 `今天的日期是YYYY/MM/DD` 行。编辑该文件即可定制 AI 的行为规则、工具使用策略和回答风格，修改后下次发送消息时生效，无需重启服务。压缩对话用的 prompt 同理，位于 `files/prompts/compaction_prompt.txt`。

### 左侧栏

#### 新建和重命名会话

点击新建按钮即可新建默认命名的会话，双击侧栏中的会话标题即可重命名。

#### 主题 / 字体 / 字号

左下角 ⚙ 设置面板提供三种自定义：

- **主题**：卡其、明亮（纯白）、墨灰（深色）
- **字体**：系统默认、楷体、宋体，仅影响消息正文的 Markdown 渲染区域
- **字号**：10-20px 滑块，实时预览

所有设置保存在浏览器 localStorage 中，刷新后保持。

#### 面板宽度与收起

左侧会话列表宽度固定，不能拖拽调整，可通过顶部收起按钮完全收起。

#### 连接状态

左下角状态栏显示 WebSocket 连接状态：绿点表示已连接，灰点表示未连接。断线时自动尝试重连。

### 中间信息流

#### 引用文件 @

在输入框中输入 `@` 会弹出文件搜索面板，实时搜索 `allowedDirs` 中的文件。用 ↑↓ 键或鼠标选择文件，回车或点击确认后插入 `[路径]` 格式的引用。

#### 常用命令 /

输入 `/` 弹出命令面板，从 `files/commands.md` 中匹配预设的 Slash 命令模板。选中后命令的 prompt 文本会替换掉 `/` 触发符，可直接编辑或发送。可根据需要添加常用命令。

#### 发送图片

1. 在输入框中直接粘贴剪贴板中的图片（Ctrl+V），支持多张。图片会作为附件随消息发送，视觉模型可读取其中的内容。每张图片可单独移除。
2. 在文档预览区域打开该图片，要求模型读取。
3. 在输入框@该文件，要求模型读取。

#### 取消模型生成

模型生成过程中，发送按钮会变为 ⏹ 停止按钮。点击后立即中断当前请求，已输出的内容保留在对话中并标注"(已取消)"。

#### compact 压缩对话

长对话可通过 Compact 按钮触发 LLM 摘要压缩。弹出窗口可选择保留最近 0-3 轮对话，确认后原对话归档到 `conversation_archive/`，当前会话替换为摘要版本。适合在上下文接近上限时缩减 token 用量。

#### 从对话流的中间重新开始

每条用户消息右侧有 ↺ 按钮。点击后确认截断，该消息之后的所有回复被删除，原文回填到输入框供你修改后重新发送。

#### 工具权限控制

左下角"写入权限"复选框：勾选后 write / edit / delete / move / web_search / web_fetch 六类操作全部跳过确认弹窗，直接执行。未勾选时这六类操作每次都会弹出确认框，展示操作路径和内容预览，需手动批准。切换开关只影响之后发起的权限请求，当前已显示的确认框仍需手动选择。read / list / grep 等只读工具始终直接执行，不受此开关影响。

#### Token 计数、会话用量与费用统计

顶部工具栏右侧实时显示当前会话最后一次 LLM 请求的 token 摘要（In / Out / All）：In 为输入 token，Out 为不含 reasoning 的最终输出 token，All = In + Out。reasoning token 不包含在 Out 和 All 中。All 可作为当前会话上下文的近似参考。数值小于等于 100 时显示实际整数，超过 100 时以一位小数的 k 显示。背景色随 All 值变化：超过 10 万变黄，超过 20 万变红，提示上下文长度变化。

点击工具栏的 📊 按钮可打开完整用量与费用统计面板：
- **按时间**：7 天或 30 天的堆叠柱状图，按模型和 Provider 分色展示每日 Token 用量；可切换到费用视图查看每日费用
- **总量**：按模型 + Provider 汇总输入、输出、Thinking token 和总费用

费用按模型配置中的 `cost` 单价计算；未配置单价的模型费用记为 0。统计数据持久化在 `files/usage_daily.json` 和 `files/usage_total.json` 中。

#### 知识库浏览

顶部工具栏的 📖 按钮可打开知识库总览面板，列出所有知识库及其包含的文件。每个知识库卡片显示名称、描述和文件列表，超过 5 个文件时可点击展开查看全部。

### 右边栏

#### 工具栏按钮

右侧文档预览区顶部工具栏提供三个按钮：

- **清除**：清除当前选中的文字和文件打开状态，下一条消息将不再附带文档引用
- **刷新**：重新加载文档浏览器目录（`knowledge_base/` 和 `inputs/`），适合在外部修改文件后更新列表
- **编辑**：切换文档编辑模式。开启后可直接在右侧面板编辑文本文件（如 `.md`、`.txt`），保存后立即生效

#### 划选文字带入对话

右栏文档预览中划选文字后，发送下一条消息时会自动附带打开的文件以及该文件中选中的内容和行号信息，让模型知道你正在引用的文档片段。如果打开了文件但没有选择文字，该文件被打开的信息也会传递给模型。点击工具栏"清除"按钮可以清除掉文件打开和选中文字信息。

#### 面板宽度与收起

文档面板可通过分隔条拖拽调整宽度，也可通过收起按钮完全收起。内部还有一条水平分隔条，可调整上方文件树和下方预览区的高度比例；文件树各列之间也可拖拽调整列宽。

### 异地使用

所有的本地数据就放置在${HYXCLAW_DATA_DIR}这个数据文件夹中，整个数据文件夹可以在github备份，在不同的电脑上同步该文件夹即可使用。

## CLI

```bash
hyxclaw init                    # 初始化数据目录和模板配置
hyxclaw start                   # 启动 Web 服务
hyxclaw start -p 8080           # 指定端口
hyxclaw start --host 0.0.0.0    # 指定监听地址
hyxclaw config                  # 显示配置位置和当前设置（API Key 会脱敏）
hyxclaw sessions                # 列出会话
hyxclaw session:create [title]  # 创建会话
hyxclaw status                  # 检查配置和会话状态
```

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/health` | 健康检查 |
| GET | `/api/config` | 可用提供商、模型和默认设置 |
| GET | `/api/app-state` | 已持久化的界面状态 |
| GET / POST | `/api/sessions` | 列出或创建会话 |
| GET / PATCH / DELETE | `/api/sessions/:id` | 读取、重命名或删除会话 |
| POST | `/api/sessions/:id/compact` | 压缩会话上下文 |
| POST | `/api/sessions/:id/truncate` | 从指定消息处截断会话 |
| GET | `/api/usage/stats` | Token 汇总统计 |
| GET | `/api/usage/daily?days=7` | 最近 1 至 90 天的每日统计 |
| POST | `/api/usage/flush` | 将临时用量归档到统计文件 |
| GET | `/api/knowledge` | 知识库概览 |
| GET / PUT | `/api/documents/content?path=` | 读取或保存文档 |
| GET | `/api/documents/tree?path=` | 浏览文档目录 |
| GET | `/api/files?q=` | 搜索允许目录中的文件 |
| GET | `/api/commands?q=` | 查询 Slash 命令 |
| GET | `/api/image?path=` | 获取图片文件 |

WebSocket 地址为 `ws://127.0.0.1:3000/ws`，用于会话切换、聊天流、工具权限请求和心跳。

## 开发

```bash
pnpm dev              # 以 tsx 运行 CLI
pnpm build            # TypeScript 编译到 dist/
pnpm test --run       # 运行测试
pnpm test:coverage    # 生成测试覆盖率
pnpm lint             # 运行 oxlint
pnpm format:check     # 检查格式
pnpm format           # 格式化代码
pnpm type-check       # 仅进行类型检查
```

## 数据目录

```text
{HYXCLAW_DATA_DIR}/
├── .gitignore
├── config.json
├── conversations/              # 会话 JSONL 文件
├── conversation_archive/       # 会话压缩前的归档
├── inputs/                     # 导入资料
├── knowledge_base/             # Markdown 知识库和说明
│   ├── index.md
│   ├── instructions.md
│   └── 示例/
│       ├── index.md
│       └── 寄生机器的悖论.md
├── files/
│   ├── app_state.json
│   ├── commands.md
│   ├── project_operation_manual.md
│   ├── usage_temp.json
│   ├── usage_daily.json
│   ├── usage_total.json
│   └── prompts/
│       ├── agent_system_prompt.txt
│       └── compaction_prompt.txt
└── logs/
```

更多设计和数据格式见 [架构文档](docs/architecture.md)、[初始化说明](docs/init_method.md)、[知识库说明](docs/knowledge_base.md) 与 [Token 统计说明](docs/token_stats.md)。
