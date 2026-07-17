# 薯问 AgentCore — 部署与维护指南

> 更新时间：2026-05-15  
> 面向首次部署的新手，从零开始把系统跑起来，以及后续日常维护操作。

---

## 前置条件

- AWS 账号，且有足够权限（ECS、RDS、Bedrock、S3、IAM、CloudFormation、EventBridge、CloudWatch）
- 本地安装：Node.js 18+、AWS CLI v2、CDK CLI（`npm install -g aws-cdk`）
- AWS CLI 已配置好凭证：`aws configure`
- 气象数据使用 Open-Meteo（免费，无需 API Key）

---

## 第一次部署（从零开始）

只需一条命令，脚本会交互式引导你填写配置，然后自动完成所有步骤：

```bash
npm install
./infra/setup.sh
```

脚本会依次执行：
1. 交互式收集配置（DB 地址、密钥、API Key 等）
2. CDK 部署基础设施（VPC、RDS、ECS、ALB、Bedrock KB 等，约 15-30 分钟）
3. 写入 Secrets Manager
4. 初始化数据库（建表 + 种子数据）
5. 上传知识库文档并触发 KB ingestion
6. 构建并部署 Web + Job 镜像

完成后终端会打印访问地址和默认账号。

> **AgentCore Runtime（病虫害功能）** 需要单独部署：
> ```bash
> ./infra/sv.sh deploy agent --all
> ./infra/sv.sh secrets   # 更新 FARMING_ADVISOR_FAST_ARN 和 FARMING_ADVISOR_DEEP_ARN
> ./infra/sv.sh deploy web
> ```

> **历史数据回填**（首次部署后执行一次）：
> ```bash
> DATABASE_URL="..." npx tsx scripts/backfill-historical.ts
> ```
> 回填 2015-01-01 至今所有地块的 ERA5 历史数据，约需 5-10 分钟。

---

## 日常维护

### 发布代码更新

```bash
./infra/sv.sh deploy web      # 只改了 Web 代码（最常见）
./infra/sv.sh deploy job      # 改了 cron 脚本
./infra/sv.sh deploy all      # 两者都改了
```

> **注意**：不要手动 `stop-task`，让 ECS 滚动更新处理，避免短暂 5xx 触发告警邮件。

### 发布含数据库 schema 变更

```bash
npm run db:generate    # 生成 migration 文件
npm run db:check       # 校验一致性
RUN_MIGRATIONS=1 ./infra/sv.sh deploy web
```

### 回滚

```bash
./infra/sv.sh rollback
```

### 更新基础设施（IaC）

```bash
./infra/sv.sh cdk diff     # 先预览
./infra/sv.sh cdk deploy   # 再执行
```

### 切换 ECS 架构（X86_64 ↔ ARM64）

当前为 X86_64（构建快，约 45 秒）。正式上线后切回 ARM64（Graviton，成本更低）：

1. 修改 `infra/cdk/lib/weather-warning-stack.ts` 中 task definition 的 `cpuArchitecture: "ARM64"`
2. `./infra/sv.sh cdk deploy` 使新 task def 生效
3. `./infra/sv.sh deploy web` —— `build-image.sh` 的 `auto` 模式会检测到新 task def 是 ARM64，自动回退到远端 ARM builder 构建（若从 x86_64 主机上发布）。若需显式指定，可 `BUILD_MODE=remote ./infra/sv.sh deploy web`

---

## 观测与排查

### 查看实时日志

```bash
aws logs tail /weather-warning/web --region us-east-1 --since 30m --follow
aws logs tail /weather-warning/job --region us-east-1 --since 30m --follow
```

### 查看告警状态

```bash
aws cloudwatch describe-alarms \
  --region us-east-1 \
  --alarm-name-prefix weather-warning \
  --query 'MetricAlarms[*].[AlarmName,StateValue]' \
  --output table
```

### 查看 ECS 服务状态

```bash
aws ecs describe-services \
  --cluster weather-warning \
  --services weather-warning-web \
  --region us-east-1
```

### 常见问题

| 现象 | 排查方向 |
|---|---|
| 页面打不开 | 查 ECS service 状态 + `/weather-warning/web` 日志 |
| 收到大量告警邮件 | 通常是部署期间短暂 5xx，检查 CloudWatch 告警历史 |
| 积温图无数据 | 检查物化视图是否存在，手动刷新 |
| smoke test 失败（TJWeather 503） | TJWeather API 偶发 503，确认是外部抖动而非代码问题后可用 `SKIP_SMOKE=1 npm run deploy:web` 跳过健康检查 |
| smoke test 失败（其他） | 查日志，确认 DB 连接和 Secrets 是否正确 |
| cron 任务没执行 | 查 `cron_run` 表 + `/weather-warning/job` 日志 + Scheduler 状态 |
| 病虫害 AI 不回答 | 检查 `USE_AGENTCORE_FARMING`、`FARMING_ADVISOR_DEEP_ARN` |
| KB 检索无结果 | 重新触发 ingestion，等待几分钟 |
| 登录失败 | 检查 `AUTH_SECRET` 是否设置，用户是否被禁用 |
| 容器日志 `exec format error` + exit 255 | 镜像架构与 ECS task def `cpuArchitecture` 不匹配。确认 `infra/build-image.sh` 的 `BUILD_MODE`（见下文），并检查构建机/ARM builder 与 task def 是否一致 |

---

## 镜像构建模式（BUILD_MODE）

`infra/build-image.sh` 支持三种模式，默认 `auto`：

| 模式 | 行为 | 适用 |
|---|---|---|
| `auto`（默认） | 查询 ECS 服务当前 task def 的 `cpuArchitecture`，若与当前机器架构一致且本机有可用 docker，则**本地构建**；否则回退到远端 ARM builder | 日常使用 |
| `local` | 强制在当前机器 `docker build` + push ECR（本机架构决定镜像架构） | 本地已有 docker，不想等 SSM/EC2 冷启动 |
| `remote` | 强制启动并通过 SSM 在 ARM builder `i-03e513e93ea4f615d`（c7g.2xlarge，arm64）上构建 | 需要构建 arm64 镜像（例如将 ECS 切回 ARM64 时） |

```bash
BUILD_MODE=local ./infra/sv.sh deploy web      # 跳过 ARM builder
BUILD_MODE=remote ./infra/sv.sh deploy web     # 强制走 ARM builder
```

> **历史背景**：早期 ECS 使用 ARM64（Graviton，成本低约 20%），脚本默认走远端 ARM builder。2026-04 后 ECS 临时切到 X86_64（构建快），但脚本默认仍是 remote → 产出 arm64 镜像，触发线上 `exec format error`。`auto` 模式通过对齐 task def 架构消除此类问题。

---

## 成本控制

主要固定成本：OpenSearch Serverless（~$691/月）、NAT Gateway（~$35/月）、ALB（~$18/月）、RDS（~$15/月）、Fargate 常驻 task（~$11/月）。

ARM builder（EC2 `i-03e513e93ea4f615d`，c7g.2xlarge）：

- **已停机**（2026-05-10 stopped），当前 ECS 架构为 X86_64，构建无需这台机器。
- 只有在切回 ARM64 或显式 `BUILD_MODE=remote` 时才会被自动启动。
- `auto` / `local` 模式不会启动它；`remote` 模式构建后默认会 `stop`（除非 `STOP_BUILDER=0`）。

### 磁盘空间

EC2 根盘已扩容至 50 GB（2026-05-15）。Docker 构建缓存随时间累积，部署失败时若出现 `ENOSPC`：

```bash
docker system prune -f
```
