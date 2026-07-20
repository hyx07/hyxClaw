# hyxClaw - 个人本地AI助手

## 沟通
- 记得用中文和我交流

## 项目信息
- **平台**：Windows 11 —— 使用 Windows 路径（反斜杠），而非 `/mnt/c/...`
- **项目目录**：`C:\Virtual_D\typescript\hyxClaw`
- 用户数据目录：配置于/.env文件中的`$HYXCLAW_DATA_DIR`
- 配置文件：`$HYXCLAW_DATA_DIR/config.json`
- 系统提示词文件：`$HYXCLAW_DATA_DIR/files/prompts/agent_system_prompt.txt`（约定俗成，非配置项）
- 启动服务器：`pnpm build && node dist/cli/index.js start`
- 运行测试：`pnpm test --run`

## 初始化
项目初始化方法，包括配置、提示词等，参见 [docs/init_method.md](docs/init_method.md)

## 架构
项目架构、模块职责、API 路由、数据格式，参见 [docs/architecture.md](docs/architecture.md)

## token 统计
如何统计不同类型的 token，参见 [docs/token_stats.md](docs/token_stats.md)
