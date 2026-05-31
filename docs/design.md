# 薯问 AgentCore — 设计文档

> 更新时间：2026-05-15  
> 面向开发者和运维人员，说明当前生产架构、数据模型、部署入口和扩展点。

---

## 1. 当前架构

```
Internet
  │
  ▼
ALB :80  weather-warning-agentcore-alb
  │
  ▼
ECS Fargate X86_64  service: weather-warning-web  (private subnet)
  │
  ├─ RDS PostgreSQL 16
  ├─ Bedrock Runtime / AgentCore Runtime
  ├─ AgentCore Memory (4 个 memory，按 agent 隔离)
  ├─ Bedrock Knowledge Base + OpenSearch Serverless
  ├─ S3: knowledge-base / build-context
  └─ CloudWatch Logs / Metrics / Alarms

EventBridge Scheduler (group: weather-warning-cron)
  ▼
ECS RunTask  task family: weather-warning-job
  ├─ fetch-weather
  ├─ check-alerts
  ├─ generate-daily-alert
  ├─ push-daily-alert
  ├─ generate-advice          （当前周 + 下一周）
  ├─ archive-alerts
  ├─ archive-daily-alerts-monthly
  ├─ fetch-historical（每年 1 月 1 日）
  ├─ backfill-recent          （每日补填 ERA5 近 21 天）
  ├─ refresh-cumulative-view  （每日刷新物化视图）
  └─ check-zone-alerts        （每日检测产区预警）
```

---

## 2. 技术栈

| 层 | 技术 |
|---|---|
| Web | Next.js 15 App Router + React 19 + Tailwind CSS 4 |
| 数据库 | PostgreSQL 16 RDS + Drizzle ORM |
| 部署 | ECS Fargate X86_64 + ALB |
| Cron | EventBridge Scheduler + ECS RunTask |
| AI | Amazon Bedrock Converse + Bedrock AgentCore Runtime |
| Memory | AgentCore Memory，PG transcript 作为 fallback/归档 |
| KB | Bedrock Knowledge Base + OpenSearch Serverless + S3 |
| 认证 | jose HS256 JWT，access 24h + refresh 30d |
| 观测 | CloudWatch Logs, alarms, SNS, SQS DLQ, pino |
| IaC | AWS CDK v2 (TypeScript)，两个 CloudFormation stack |

---

## 3. 主要模块

### 目录结构

```
src/app                  Next.js 页面和 API routes
src/components           UI 组件
src/lib/db               Drizzle schema 和 DB 连接
src/lib/services         业务服务层
scripts/                 cron/job/评估脚本
infra/                   sv.sh + build-image.sh
infra/cdk/               CDK 基础设施代码
agents/                  AgentCore Runtime Python agents
knowledge-base/          种子知识库文档
```

### 核心服务文件

| 文件 | 作用 |
|---|---|
| `src/lib/services/agentcore.ts` | Agent 编排入口 |
| `src/lib/services/router.ts` | fast route + supervisor route |
| `src/lib/services/prefetch.ts` | DB 数据预取并压缩进 prompt |
| `src/lib/services/invoke.ts` | Converse / AgentCore Runtime 调用 |
| `src/lib/services/daily-alert.ts` | 每日县级农事预警生成、聚合、归档 |
| `src/lib/services/knowledge.ts` | S3 文档管理 + KB ingestion |
| `src/lib/services/memory.ts` | AgentCore Memory 读写和 PG fallback |
| `src/lib/services/weather.ts` | 天气和预报查询 |
| `src/lib/services/cumulative.ts` | 有效积温（GDD）和累计降水计算 |
| `src/lib/services/cumulative-view.ts` | 物化视图查询（多年积温/降水对比） |
| `src/lib/services/suitability.ts` | 4 项气象适宜度评分 |
| `src/lib/services/advice.ts` | 农事建议生成、生育期阶段判断 |
| `src/lib/services/alert.ts` | 地块级灾害预警检测和查询 |
| `src/lib/services/wecom.ts` | 企业微信群机器人推送 |
| `src/lib/services/audit.ts` | 关键操作审计日志写入 |

### Agent 路由

| 场景 | 路径 | 模型/能力 |
|---|---|---|
| 问候 | 本地 Converse | Nova Micro |
| 天气/农事/预警 | Next.js prefetch + Converse | GLM-4.7-flash |
| 病虫害深度分析 | AgentCore Runtime | Qwen3-32b + KB |
| 路由不明确 | supervisor route | Qwen3-32b 判断目标 |

---

## 4. 数据模型

核心关系：

```
field
  ├─ daily_weather          （含 source 字段区分 openmeteo-daily / openmeteo-archive）
  ├─ weather_forecast
  ├─ weather_forecast_history
  ├─ alert
  └─ farming_advice_record

zone
  ├─ zone_member            （成员地块）
  └─ zone_alert             （产区预警）

zone_alert_threshold        # 产区预警阈值配置
township_weather            # 镇级气象数据（ERA5 历史 + Open-Meteo 预报）
daily_farming_alert         # 县级每日农事预警
kb_document                 # 知识库上传记录
cron_run                    # 定时任务观测
backfill_progress           # ERA5 历史回填断点续传进度
field_daily_cumulative      # 物化视图：每日累计 GDD 和降水（2015 至今）
oauth_client                # OAuth 2.0 客户端注册信息
oauth_token                 # 已签发的访问令牌（token_hash 存储）
api_call_log                # Public API 调用记录
agent_session/message
eval_case/run
user / refresh_token / password_history / audit_log
```

重要表：

| 表 | 说明 |
|---|---|
| `field` | 地块、坐标（精确到小数点后两位）、行政区划、品种、播种日期 |
| `daily_weather` | 历史实况，`source` 字段区分近实时（`openmeteo-daily`）和 ERA5 回填（`openmeteo-archive`）；2015-01-01 至今 |
| `weather_forecast` | 最新 45 天预报，按 field/date 覆盖更新 |
| `weather_forecast_history` | 每次抓取的预报快照，用于准确性回溯 |
| `historical_monthly` | 月粒度气候参考值（气温、降水、风速、湿度），用于"与历史同期比较" |
| `backfill_progress` | ERA5 回填进度，按 ERA5 网格（0.25°）记录 `last_date`，支持断点续传 |
| `field_daily_cumulative` | 物化视图，预计算每日累计 GDD 和降水，每日 22:30 刷新 |
| `daily_farming_alert` | 按县每天一条，支持审核/发布/归档 |
| `farming_advice_record` | 周度农事建议，含当前周和下一周预测 |
| `zone` | 产区（名称、描述，含多个成员地块） |
| `zone_member` | 产区成员（field_id 关联，唯一性在应用层保证） |
| `township_weather` | 镇级气象（ERA5 历史 + Open-Meteo 预报），供产区视图聚合 |
| `zone_alert` | 产区级预警，由 `check-zone-alerts` 每日生成 |
| `zone_alert_threshold` | 产区预警阈值，可按产区独立配置 |
| `oauth_client` | OAuth 2.0 客户端注册，含 client_secret_hash、scopes、rate_limit |
| `oauth_token` | Bearer token（SHA-256 hash），过期/撤销字段 |
| `api_call_log` | Public API 调用日志（fire-and-forget 写入） |

Schema 变更必须走 Drizzle migration：

```bash
npm run db:generate   # 生成 migration 文件
npm run db:check      # 校验 migration 一致性
RUN_MIGRATIONS=1 ./infra/sv.sh deploy web  # 发版时自动执行
```

---

## 5. 天气数据流

### 近实时数据（每日 06:00）

`scripts/fetch-weather.ts` 拉取Open-Meteo 45 天预报，写入 `weather_forecast`（`source='openmeteo-daily'`）。

### ERA5 历史数据

- **一次性回填**：`scripts/backfill-historical.ts` 回填 2015-01-01 至 7 天前，写入 `daily_weather`（`source='openmeteo-archive'`），按 ERA5 网格（0.25°）去重，断点续传
- **滚动补填**：`scripts/backfill-recent.ts` 每日 20:00 补填最近 21 天（覆盖 ERA5 5-7 天滞后窗口）
- **不覆盖近实时数据**：upsert 时 `WHERE source='openmeteo-archive'`，保护 `openmeteo-daily` 数据

### 物化视图刷新

`scripts/refresh-cumulative-view.ts` 每日 22:30 刷新 `field_daily_cumulative`，预计算各地块各年的累计 GDD 和降水。

### 预警检测（每日 06:10）

1. 删除 `date >= today` 的全部旧预警（全量刷新）
2. 查询未来 7 天预报
3. 按气象局标准阈值逐日检测
4. 暴雪检查含气温守卫：`temp_max ≥ 4°C` 时跳过
5. 写入新预警，写 `cron_run`

---

## 6. 气象适宜度评分

`src/lib/services/suitability.ts` 提供 4 项评分（0-100）：

| 评分 | 数据来源 | 计算方法 |
|---|---|---|
| 马铃薯气候适宜度 | 近 14 天历史实况 | 温度（50%）+ 水分（30%）+ 昼夜温差（20%）加权，按生育阶段调整权重 |
| 植保适宜度 | 未来 3 天预报 | 降水（50%）+ 风速（30%）+ 温度（20%） |
| 施肥适宜度 | 未来 7 天预报 | 降水条件（60%）+ 温度（40%） |
| 灌溉适宜度 | 未来 7 天预报 | 降水缺口（70%）+ 温度（30%） |

水分阈值按 7 个生育阶段（preplant/seedling/vegetative/budding/flowering/bulking/maturation）分别设定，参考 FAO KC 系数。v1 为经验参数，v2 待采购 QX/T 229-2014 标准后升级。

---

## 7. 有效积温（GDD）计算

采用修正法（Method 2），避免简化法在低温季节低估积温：

```
Tmax' = min(Tmax, 30)   # 上限封顶
Tmin' = max(Tmin, 7)    # 下限封底（基温 7°C）
GDD_day = max(0, (Tmax' + Tmin') / 2 - 7)
```

---

## 8. 每日县级预警

一县一天一条，和地块级突发预警并存。生成逻辑、县级聚合规则同前版本。

---

## 9. API 概览

### 内部 API（需登录 Cookie）

| API | 说明 |
|---|---|
| `/api/auth/*` | 登录、刷新、改密 |
| `/api/fields` | 地块列表/创建 |
| `/api/fields/:id` | 地块详情/编辑/删除 |
| `/api/fields/:id/weather` | 历史天气 |
| `/api/fields/:id/forecast` | 45 天预报 |
| `/api/fields/:id/alerts` | 地块级预警 |
| `/api/fields/:id/daily-alert` | 县级每日农事预警 |
| `/api/fields/:id/advice` | 周度建议生成 |
| `/api/fields/:id/cumulative` | 物化视图多年积温/降水数据 |
| `/api/zones` | 产区列表/创建 |
| `/api/zones/:id` | 产区详情/编辑/删除 |
| `/api/zones/:id/alerts` | 产区预警列表 |
| `/api/zones/:id/township-weather` | 镇级气象数据 |
| `/api/chat` / `/api/chat/stream` | AI 聊天 |
| `/api/admin/*` | 用户、阈值、审计、cron、eval、知识库、每日预警管理 |
| `/api/admin/oauth-clients` | OAuth 客户端 CRUD（需 admin 角色） |
| `/api/admin/oauth-clients/:id` | 撤销客户端（cascade 撤销全部 token） |
| `/api/admin/oauth-clients/:id/logs` | 查看 API 调用日志 |

### Public API（Bearer Token，OAuth 2.0 Client Credentials）

| API | 说明 |
|---|---|
| `POST /api/v1/oauth/token` | 获取访问令牌（grant_type=client_credentials） |
| `POST /api/v1/oauth/revoke` | 撤销令牌（RFC 7009） |
| `GET /api/v1/public/weather/forecast` | 地块天气预报（?field_id=&days=1-45） |
| `GET /api/v1/public/alerts/active` | 地块当日活跃预警（?field_id=） |
| `GET /api/v1/public/advice/daily` | 县级每日农事建议（?county_code=&date=） |

统一响应格式：`{ok, data, meta: {request_id, as_of}}`。API 规范详见 `infra/public-api-openapi.yaml`（OpenAPI 3.1.0）。

---

## 10. 安全与权限

同前版本，无变更。

---

## 11. 观测

同前版本，新增：

| 层 | 实现 |
|---|---|
| 物化视图刷新 | `cron_run` 记录 `refresh-cumulative-view` 执行状态 |
| ERA5 回填进度 | `backfill_progress` 表 |

---

## 12. 基础设施（IaC）

CDK 栈同前版本。`Weather WarningStack` 中 `SCHEDULES` 数组完整列表：

| 任务 | Cron UTC | 北京时间 | 脚本 |
|---|---|---|---|
| `fetch-weather` | `0 22 * * ? *` | 每日 06:00 | `scripts/fetch-weather.ts` |
| `check-alerts` | `10 22 * * ? *` | 每日 06:10 | `scripts/check-alerts.ts` |
| `generate-daily-alert` | `0 22 * * ? *` | 每日 06:00 | `scripts/generate-daily-alert.ts` |
| `push-daily-alert` | `30 22 * * ? *` | 每日 06:30 | `scripts/push-daily-alert.ts` |
| `generate-advice` | `0 23 ? * MON *` | 周一 07:00 | `scripts/generate-advice.ts` |
| `archive-alerts` | `10 23 * * ? *` | 每日 07:10 | `scripts/archive-alerts.ts` |
| `archive-daily-alerts-monthly` | `0 18 L * ? *` | 每月末 02:00 | `scripts/archive-daily-alerts-monthly.ts` |
| `fetch-historical` | `0 18 1 1 ? *` | 每年 1 月 1 日 | `scripts/fetch-historical.ts` |
| `backfill-recent` | `0 20 * * ? *` | 每日 04:00 | `scripts/backfill-recent.ts` |
| `refresh-cumulative-view` | `30 22 * * ? *` | 每日 06:30 | `scripts/refresh-cumulative-view.ts` |
| `check-zone-alerts` | `15 22 * * ? *` | 每日 06:15 | `scripts/check-zone-alerts.ts` |

---

## 13. 部署入口

同前版本。

---

## 14. 当前 AWS 资源

| 资源 | 标识 |
|---|---|
| CloudFormation Foundation Stack | `Weather WarningFoundationStack` |
| CloudFormation App Stack | `Weather WarningStack` |
| ALB | `weather-warning-agentcore-alb` |
| ECS cluster | `weather-warning` |
| Web service | `weather-warning-web` |
| Web task definition | `weather-warning-web:123`（X86_64） |
| Job task definition | `weather-warning-job:21` |
| ECR web | `564535962140.dkr.ecr.us-east-1.amazonaws.com/weather-warning-agentcore` |
| ECR job | `564535962140.dkr.ecr.us-east-1.amazonaws.com/weather-warning-agentcore-job` |
| RDS | `weather-warning-agentcore-db` |
| S3 | `weather-warning-backups-564535962140` |
| Knowledge Base | `R8OK5B4VRA` |
| KB data source | `SG4J4FPRDZ` |
| OpenSearch Serverless | `0sncarqgb26oqxuw1fcg` |
| SNS alerts | `arn:aws:sns:us-east-1:564535962140:weather-warning-cron-alerts` |
| Cron DLQ | `arn:aws:sqs:us-east-1:564535962140:weather-warning-cron-dlq` |
| ARM builder | `i-03e513e93ea4f615d`（stopped；仅当需要构建 ARM64 镜像时由 `build-image.sh` 按需启动，构建后自动 stop）|

---

## 15. 成本备注

主要固定成本：OpenSearch Serverless、NAT Gateway、ALB、RDS、Fargate 常驻 task。

优化方向：

1. 先观察 KB 检索质量，再决定是否换 pgvector（替换 AOSS）
2. 正式上线后将 ECS 切回 ARM64（Graviton），Web task 成本降低约 20%
3. 确认无回退需求后清理旧 EC2 和历史 S3 prefix
