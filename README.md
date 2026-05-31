# Weather Warning AgentCore Demo

基于 AWS Bedrock AgentCore 的农业气象预警平台演示项目。

## 技术栈

- **前端**：Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **AI**：AWS Bedrock AgentCore（多 Agent 编排）
- **数据库**：PostgreSQL（Drizzle ORM）
- **部署**：AWS ECS Fargate + ALB + CDK
- **地图**：天地图（Tianditu）+ Leaflet

## 架构概览

系统包含 4 个 AgentCore Runtime Agent：
- `weather-analyst`：气象数据分析
- `alert-analyst`：预警研判
- `farming-advisor-fast`：快速农事建议
- `farming-advisor-deep`：深度农事建议（带 Memory）

## 快速开始

### 前置条件

- Node.js 22+
- PostgreSQL 数据库
- AWS 账户（已配置 Bedrock AgentCore 权限）
- AWS CLI 已配置

### 本地开发

```bash
# 安装依赖
npm install

# 配置环境变量
cp .env.example .env.local
# 编辑 .env.local，填入实际配置

# 初始化数据库
npm run db:migrate

# 启动开发服务器
npm run dev
```

### 部署到 AWS

详见 [docs/deployment-guide.md](docs/deployment-guide.md)。

## 文档

- [系统设计](docs/design.md)
- [部署指南](docs/deployment-guide.md)
- [用户手册](docs/user-manual.md)
- [管理员手册](docs/admin-manual.md)
- [公开 API](docs/public-api-guide.md)

## 环境变量

参考 `.env.example` 中的说明，所有必填项均有注释。

## License

MIT

## 免责声明

本项目仅供学习与技术参考，不构成生产部署方案。运行过程中会创建 AWS 资源并产生费用，请在实验结束后及时清理。作者不对因使用本项目产生的任何费用或损失承担责任。本项目与 Amazon Web Services 无官方关联，相关服务的可用性与定价以 AWS 官方文档为准。生产环境使用前请根据实际需求进行安全评估与调整。
