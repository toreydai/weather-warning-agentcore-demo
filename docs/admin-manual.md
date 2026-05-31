# 薯问 AgentCore — 管理员手册

> 更新时间：2026-05-15

---

## 1. 系统概览

访问地址：

```text
http://weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com
```

当前底座：

| 项 | 当前值 |
|---|---|
| Web | ECS Fargate X86_64 service `weather-warning-web` |
| Job | EventBridge Scheduler + ECS RunTask `weather-warning-job` |
| DB | RDS PostgreSQL 16 `weather-warning-agentcore-db` |
| KB | Bedrock Knowledge Base `R8OK5B4VRA` |
| Logs | `/weather-warning/web`、`/weather-warning/job` |
| 告警 | SNS `weather-warning-cron-alerts` + SQS DLQ `weather-warning-cron-dlq` |
| IaC | CDK `Weather WarningFoundationStack`（47 资源）+ `Weather WarningStack`（35 资源）|

角色与权限：

| 角色 | 地块增删改 | 农事建议审核 | 每日预警审核/发布 | admin 后台 |
|---|:---:|:---:|:---:|:---:|
| `farmer` | ✅ | — | — | — |
| `agronomist` | ✅ | ✅ | — | — |
| `reviewer` | ✅ | ✅ | ✅ | — |
| `admin` | ✅ | ✅ | ✅ | ✅ |

---

## 2. 管理后台

| 页面 | 功能 |
|---|---|
| `/admin/dashboard` | 总览、数据管道状态、最近 cron |
| `/admin/users` | 创建用户、禁用/启用、重置密码、调整角色 |
| `/admin/thresholds` | 管理霜冻/暴雨/大风/高温阈值（JSON 格式） |
| `/admin/daily-alerts` | 生成、编辑、审核、发布每日县级农事预警 |
| `/admin/knowledge` | 上传/删除/同步 KB 文档 |
| `/admin/audit` | 审计日志 |
| `/admin/zones` | 产区创建/编辑/删除，成员管理 |
| `/admin/oauth-clients` | OAuth 客户端注册、撤销、API 调用日志查看 |

---

## 3. 日常运维命令

### 发布

```bash
./infra/sv.sh deploy web          # 快发布 Web：构建镜像 → 更新 ECS → smoke
./infra/sv.sh deploy job          # 构建 job 镜像 → 更新 cron schedules
./infra/sv.sh deploy all          # web + job
./infra/sv.sh deploy agent --all  # 更新所有 AgentCore Runtime
./infra/sv.sh smoke               # 只跑 smoke，不发版
./infra/sv.sh rollback            # Web 回滚到上一版 task definition
```

> **注意**：部署时不要手动 `stop-task`，让 ECS 滚动更新自己处理，避免短暂 5xx 触发告警邮件。

> **镜像构建机制**：`infra/build-image.sh` 支持 `BUILD_MODE=auto|local|remote`（默认 `auto`）。当前 ECS 为 X86_64，在 Cloud9/x86 主机上默认直接本地构建，不启动 ARM builder。详见 `docs/deployment-guide.md` 的「镜像构建模式」小节。

schema 变更时：

```bash
RUN_MIGRATIONS=1 ./infra/sv.sh deploy web
```

### 基础设施变更（IaC）

```bash
./infra/sv.sh cdk diff            # 预览将要变更的资源
./infra/sv.sh cdk deploy          # 应用基础设施变更
./infra/sv.sh cdk synth           # 只合成模板，不部署
```

### 观测

```bash
# 实时查看日志
aws logs tail /weather-warning/web --region us-east-1 --since 30m --follow
aws logs tail /weather-warning/job --region us-east-1 --since 30m --follow

# CloudWatch 告警状态
aws cloudwatch describe-alarms --region us-east-1 \
  --alarm-name-prefix weather-warning --query 'MetricAlarms[*].[AlarmName,StateValue]' --output table
```

---

## 4. 定时任务

调度组：`weather-warning-cron`（EventBridge Scheduler）

| 任务 | Cron UTC | 北京时间 | 脚本 |
|---|---:|---:|---|
| fetch-weather | `0 22 * * ? *` | 每日 06:00 | `scripts/fetch-weather.ts` |
| check-alerts | `10 22 * * ? *` | 每日 06:10 | `scripts/check-alerts.ts` |
| generate-daily-alert | `0 22 * * ? *` | 每日 06:00 | `scripts/generate-daily-alert.ts` |
| push-daily-alert | `30 22 * * ? *` | 每日 06:30 | `scripts/push-daily-alert.ts` |
| generate-advice | `0 23 ? * MON *` | 周一 07:00 | `scripts/generate-advice.ts`（当前周 + 下一周） |
| archive-alerts | `10 23 * * ? *` | 每日 07:10 | `scripts/archive-alerts.ts` |
| archive-daily-alerts-monthly | `0 18 L * ? *` | 每月末 02:00 | `scripts/archive-daily-alerts-monthly.ts` |
| fetch-historical | `0 18 1 1 ? *` | 每年 1 月 1 日 18:00 | `scripts/fetch-historical.ts` |
| backfill-recent | `0 20 * * ? *` | 每日 04:00 | `scripts/backfill-recent.ts`（补填 ERA5 近 21 天） |
| refresh-cumulative-view | `30 22 * * ? *` | 每日 06:30 | `scripts/reconcile-cumulative.ts`（增量维护累计表） |
| check-zone-alerts | `15 22 * * ? *` | 每日 06:15 | `scripts/check-zone-alerts.ts`（检测产区预警） |

失败排查：

```bash
aws scheduler list-schedules --region us-east-1 --group-name weather-warning-cron
aws ecs describe-tasks --region us-east-1 --cluster weather-warning --tasks <taskArn>
aws logs tail /weather-warning/job --region us-east-1 --since 30m
```

---

## 5. 历史数据管理

### ERA5 历史数据

系统已回填 2015-01-01 至今所有地块的 ERA5 历史数据（`source='openmeteo-archive'`），共约 20000+ 行。

手动触发全量回填（如新增地块后）：

```bash
DATABASE_URL="..." npx tsx scripts/backfill-historical.ts
# 只回填指定地块
DATABASE_URL="..." npx tsx scripts/backfill-historical.ts --field 1
# 预览不写库
DATABASE_URL="..." npx tsx scripts/backfill-historical.ts --dry-run
```

### 累计表

`field_daily_cumulative` 是**普通表**（非物化视图），由脚本增量维护，每日 06:30 自动运行。

手动触发增量维护：

```bash
DATABASE_URL="..." npx tsx scripts/reconcile-cumulative.ts
```

> **注意**：`scripts/refresh-cumulative-view.ts` 已废弃（原物化视图时代遗留），执行会报错；请使用上面的 `reconcile-cumulative.ts`。

---

## 6. Knowledge Base

入口：`/admin/knowledge`

支持 `.md / .txt / .pdf`，单文件建议 10MB 以内。上传后触发 Bedrock KB ingestion（异步）。

CLI 批量同步：

```bash
aws s3 sync knowledge-base/ s3://weather-warning-backups-564535962140/knowledge-base/ --region us-east-1
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id R8OK5B4VRA \
  --data-source-id SG4J4FPRDZ \
  --region us-east-1
```

---

## 7. AgentCore

部署 agent：

```bash
./infra/sv.sh deploy agent --all
./infra/sv.sh deploy agent farming-advisor-deep
```

回退开关（通过 Secrets Manager 中 `USE_AGENTCORE_FARMING` 控制）：

| 变量 | 说明 |
|---|---|
| `USE_AGENTCORE_FARMING=false` | 病虫害回退到本地 Converse |
| `CHAT_PG_TRANSCRIPT_MODE=fallback` | Memory 有效时不写 PG transcript |
| `CHAT_PG_TRANSCRIPT_MODE=dual` | Memory + PG 双写 |

---

## 8. 故障排查

| 问题 | 排查 |
|---|---|
| 页面打不开 | `aws ecs describe-services --cluster weather-warning --services weather-warning-web --region us-east-1`，再看 `/weather-warning/web` |
| 收到大量告警邮件 | 检查 CloudWatch 告警历史，通常是部署期间短暂 5xx 触发；部署时不要手动 stop-task |
| 积温/降水对比图无数据 | 检查 `field_daily_cumulative` 表是否有数据，手动运行 `DATABASE_URL="..." npx tsx scripts/reconcile-cumulative.ts` |
| 去年同期显示"暂无数据" | 检查 `daily_weather` 中去年同期数据是否存在（`source='openmeteo-archive'`） |
| 适宜度评分全为 0 | 检查 `weather_forecast` 是否有未来 7 天数据 |
| 登录失败 | 检查用户是否禁用、密码是否过期、是否触发限流 |
| 聊天超时 | 查 `/weather-warning/web` 中 `chat.start/ok/failed` |
| 病虫害失败 | 检查 AgentCore Runtime、`USE_AGENTCORE_FARMING`、`FARMING_ADVISOR_DEEP_ARN` |
| KB 无结果 | 重新触发 ingestion，确认 `KNOWLEDGE_BASE_ID` 和 data source ID |
| 每日预警未生成 | 查 `cron_run`、`/weather-warning/job`、Scheduler 状态 |
| 产区预警未生成 | 查 `cron_run`（job=check-zone-alerts）+ `/weather-warning/job` 日志；确认 `zone_alert_threshold` 表有配置 |
| OAuth token 认证失败（401） | 确认 Bearer token 未过期（TTL 3600s）、客户端未被撤销（`oauth_client.revoked_at`）；检查 30s token 缓存是否命中旧状态（最多等 30s 自动失效） |
| Public API 限流（429） | 查 `rate_limit_bucket` 表对应 `api:{client_id}` 的计数；默认 60 req/min，可在 `/admin/oauth-clients` 调整客户端 rate_limit |
| CDK diff 有意外变更 | 检查是否手动改过 AWS 控制台导致 drift |

---

## 9. 当前版本

| 项 | 当前值 |
|---|---|
| Web task definition | `weather-warning-web:123`（X86_64） |
| Job task definition | `weather-warning-job:21` |
| 最新 migration | `0018_lowly_phil_sheldon.sql` |
| Cron schedules | 11 条（fetch-weather / check-alerts / generate-daily-alert / push-daily-alert / generate-advice / archive-alerts / archive-daily-alerts-monthly / fetch-historical / backfill-recent / refresh-cumulative-view / check-zone-alerts） |
| Foundation Stack | UPDATE_COMPLETE（47 资源） |
| App Stack | UPDATE_COMPLETE（35 资源） |
| 历史数据 | 2015-01-01 至今，5 个地块，共 ~20000+ 行 |
| 累计表 | `field_daily_cumulative`（普通表，20728 行，每日 06:30 reconcile） |
| EC2 根盘 | 50 GB（已扩容，2026-05-15） |

---

## 10. 已知限制

| 限制 | 处理计划 |
|---|---|
| HTTP 未启用 HTTPS | 等域名确定后加 ACM + 443 listener |
| ECS 当前为 X86_64 | 正式上线后切回 ARM64（Graviton）降低成本 |
| historical_monthly 数据来源未确认 | 待客户确认后更新 UI 标注 |
| 适宜度评分为 v1 经验参数 | 待农艺师评审后调整，或采购 QX/T 229-2014 |
| 旧口/柴湖镇真实行政边界缺失 | OSM 无数据，当前退回 8km buffer 圆；可用 Lambda 中转天地图或手动 GeoJSON |
| Staging 环境暂无 | 靠 smoke + rollback；多人高频发布后再建 |

---

## 11. 磁盘管理

EC2 根盘已扩容至 **50 GB**（2026-05-15）。Docker 构建缓存会随时间累积。部署时如出现 `ENOSPC` 错误：

```bash
docker system prune -f
```

可安全清除构建缓存，不影响正在运行的容器。
