import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ecs from "aws-cdk-lib/aws-ecs"
import * as ecr from "aws-cdk-lib/aws-ecr"
import * as iam from "aws-cdk-lib/aws-iam"
import * as logs from "aws-cdk-lib/aws-logs"
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import * as sqs from "aws-cdk-lib/aws-sqs"
import * as sns from "aws-cdk-lib/aws-sns"
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch"
import * as cloudwatchActions from "aws-cdk-lib/aws-cloudwatch-actions"
import * as events from "aws-cdk-lib/aws-events"
import * as eventsTargets from "aws-cdk-lib/aws-events-targets"
import * as scheduler from "aws-cdk-lib/aws-scheduler"

// ── constants ───────────────────────────────────────────────────────────────
const REGION = "us-east-1"
const ACCOUNT = process.env.CDK_DEFAULT_ACCOUNT ?? ""
const VPC_ID = "vpc-eaab3390"
const VPC_CIDR = "172.31.0.0/16"
const PRIVATE_SUBNETS = ["subnet-0b2d6a7e941540c9e", "subnet-0508e05881b38c314"]
const PRIVATE_SUBNET_AZS = ["us-east-1b", "us-east-1c"]
const PRIVATE_SUBNET_CIDRS = ["172.31.128.0/24", "172.31.129.0/24"]
const PRIVATE_SUBNET_ROUTE_TABLES = ["rtb-0c78c1f40d7f36ea5", "rtb-0c78c1f40d7f36ea5"]
const ALB_SG_ID = "sg-0d5c5be4755ce93ff"
const RDS_SG_ID = "sg-0b43c3a5d0bcaf4da"
const FARGATE_SG_ID = "sg-040b4aedfef5411d0"
const ALB_ARN = "arn:aws:elasticloadbalancing:us-east-1:564535962140:loadbalancer/app/weather-warning-agentcore-alb/5682860b231bc07f"
const ALB_DNS_NAME = "weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com"
const ALB_CANONICAL_HOSTED_ZONE_ID = "Z35SXDOTRQ7X7K"
const SECRET_NAME = "weather-warning/agentcore/app"
const CLUSTER_NAME = "weather-warning"
const SERVICE_NAME = "weather-warning-web"
const WEB_TASK_FAMILY = "weather-warning-web"
const JOB_TASK_FAMILY = "weather-warning-job"
const EXECUTION_ROLE_NAME = "weather-warning-ecsTaskExecutionRole"
const TASK_ROLE_NAME = "weather-warning-ecsTaskRole"
const SCHEDULER_ROLE_NAME = "weather-warning-scheduler-role"
const WEB_LOG_GROUP = "/weather-warning/web"
const JOB_LOG_GROUP = "/weather-warning/job"
const TARGET_GROUP_NAME = "weather-warning-web-tg"
const SCHEDULE_GROUP_NAME = "weather-warning-cron"
const DLQ_NAME = "weather-warning-cron-dlq"
const SNS_TOPIC_NAME = "weather-warning-cron-alerts"
const WEB_ECR_REPO = "weather-warning-agentcore"
const JOB_ECR_REPO = "weather-warning-agentcore-job"

const WEB_SECRETS = [
  "DATABASE_URL", "AUTH_SECRET", "AUTH_TRUST_HOST", "PASSWORD_EXPIRE_DAYS",
  "KNOWLEDGE_BASE_ID", "KNOWLEDGE_BASE_BUCKET", "KNOWLEDGE_BASE_DATA_SOURCE_ID",
  "USE_AGENTCORE_FARMING",
  "FARMING_ADVISOR_FAST_ARN", "FARMING_ADVISOR_DEEP_ARN",
  "WEATHER_ANALYST_ARN", "ALERT_ANALYST_ARN",
  "FEATURE_DAILY_ALERT", "FEATURE_FORECAST_45D", "FEATURE_WECOM_PUSH",
  "FEATURE_KB_UPLOAD", "LOG_LEVEL", "CHAT_MEMORY_ID",
  "CHAT_PG_TRANSCRIPT_MODE", "RATE_LIMIT_STORE",
]

const JOB_SECRETS = [
  "DATABASE_URL", "AUTH_SECRET", "AUTH_TRUST_HOST", "PASSWORD_EXPIRE_DAYS",
  "KNOWLEDGE_BASE_ID", "KNOWLEDGE_BASE_BUCKET", "KNOWLEDGE_BASE_DATA_SOURCE_ID",
  "USE_AGENTCORE_FARMING",
  "FARMING_ADVISOR_FAST_ARN", "FARMING_ADVISOR_DEEP_ARN",
  "WEATHER_ANALYST_ARN", "ALERT_ANALYST_ARN",
  "CRON_ALERT_SNS_TOPIC_ARN",
  "FEATURE_DAILY_ALERT", "FEATURE_FORECAST_45D", "FEATURE_WECOM_PUSH",
  "FEATURE_KB_UPLOAD", "LOG_LEVEL",
]

const SCHEDULES: { name: string; cron: string; script: string }[] = [
  { name: "fetch-weather",                 cron: "cron(0 22 * * ? *)",     script: "scripts/fetch-weather.ts" },
  { name: "check-alerts",                  cron: "cron(10 22 * * ? *)",    script: "scripts/check-alerts.ts" },
  { name: "generate-daily-alert",          cron: "cron(0 22 * * ? *)",     script: "scripts/generate-daily-alert.ts" },
  { name: "push-daily-alert",              cron: "cron(30 22 * * ? *)",    script: "scripts/push-daily-alert.ts" },
  { name: "generate-advice",               cron: "cron(0 23 ? * MON *)",   script: "scripts/generate-advice.ts" },
  { name: "archive-alerts",               cron: "cron(10 23 * * ? *)",    script: "scripts/archive-alerts.ts" },
  { name: "archive-daily-alerts-monthly", cron: "cron(0 18 L * ? *)",     script: "scripts/archive-daily-alerts-monthly.ts" },
  { name: "fetch-historical",             cron: "cron(0 18 1 1 ? *)",     script: "scripts/fetch-historical.ts" },
  { name: "backfill-recent",              cron: "cron(0 20 * * ? *)",     script: "scripts/backfill-recent.ts" },
  { name: "refresh-cumulative-view",      cron: "cron(30 22 * * ? *)",    script: "scripts/reconcile-cumulative.ts" },
  { name: "check-zone-alerts",           cron: "cron(15 22 * * ? *)",    script: "scripts/check-zone-alerts.ts" },
]

// ── stack ───────────────────────────────────────────────────────────────────
export class WeatherWarningStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    const webImageTag = this.node.tryGetContext("webImageTag") as string ?? "latest"
    const jobImageTag = this.node.tryGetContext("jobImageTag") as string ?? "latest"
    const manageSchedules = this.node.tryGetContext("manageSchedules") !== "false"

    // ── lookup existing network resources ──────────────────────────────────
    const vpc = ec2.Vpc.fromVpcAttributes(this, "Vpc", {
      vpcId: VPC_ID,
      vpcCidrBlock: VPC_CIDR,
      availabilityZones: PRIVATE_SUBNET_AZS,
      privateSubnetIds: PRIVATE_SUBNETS,
      privateSubnetRouteTableIds: PRIVATE_SUBNET_ROUTE_TABLES,
      privateSubnetIpv4CidrBlocks: PRIVATE_SUBNET_CIDRS,
    })

    const privateSubnets = PRIVATE_SUBNETS.map((id, i) =>
      ec2.Subnet.fromSubnetAttributes(this, `PrivateSubnet${i}`, {
        subnetId: id,
        availabilityZone: PRIVATE_SUBNET_AZS[i],
        ipv4CidrBlock: PRIVATE_SUBNET_CIDRS[i],
        routeTableId: PRIVATE_SUBNET_ROUTE_TABLES[i],
      })
    )

    const albSg = ec2.SecurityGroup.fromSecurityGroupId(this, "AlbSg", ALB_SG_ID)
    const rdsSg = ec2.SecurityGroup.fromSecurityGroupId(this, "RdsSg", RDS_SG_ID)
    const fargateSg = ec2.SecurityGroup.fromSecurityGroupId(this, "FargateSg", FARGATE_SG_ID)

    // suppress unused-var for rdsSg; it's kept for docs / future rule additions
    void rdsSg

    // ── secrets manager ────────────────────────────────────────────────────
    const appSecret = secretsmanager.Secret.fromSecretNameV2(this, "AppSecret", SECRET_NAME)

    // ── IAM: execution role ────────────────────────────────────────────────
    const executionRole = new iam.Role(this, "ExecutionRole", {
      roleName: EXECUTION_ROLE_NAME,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AmazonECSTaskExecutionRolePolicy"),
      ],
      inlinePolicies: {
        "weather-warning-execution-inline": new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["secretsmanager:GetSecretValue"],
              resources: [`${appSecret.secretArn}*`],
            }),
            new iam.PolicyStatement({
              actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [
                `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${WEB_LOG_GROUP}:*`,
                `arn:aws:logs:${REGION}:${ACCOUNT}:log-group:${JOB_LOG_GROUP}:*`,
              ],
            }),
          ],
        }),
      },
    })
    executionRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── IAM: task role ─────────────────────────────────────────────────────
    const taskRole = new iam.Role(this, "TaskRole", {
      roleName: TASK_ROLE_NAME,
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      inlinePolicies: {
        "weather-warning-runtime-inline": new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: [
                "bedrock:*",
                "bedrock-agentcore:*",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "sns:Publish",
              ],
              resources: ["*"],
            }),
            new iam.PolicyStatement({
              actions: ["ecs:RunTask"],
              resources: [`arn:aws:ecs:${REGION}:${ACCOUNT}:task-definition/${JOB_TASK_FAMILY}:*`],
              conditions: {
                ArnLike: { "ecs:cluster": `arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${CLUSTER_NAME}` },
              },
            }),
            new iam.PolicyStatement({
              actions: ["iam:PassRole"],
              resources: [
                `arn:aws:iam::${ACCOUNT}:role/${EXECUTION_ROLE_NAME}`,
                `arn:aws:iam::${ACCOUNT}:role/${TASK_ROLE_NAME}`,
              ],
            }),
          ],
        }),
      },
    })
    taskRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── log groups ─────────────────────────────────────────────────────────
    const webLogGroup = new logs.LogGroup(this, "WebLogGroup", {
      logGroupName: WEB_LOG_GROUP,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    const jobLogGroup = new logs.LogGroup(this, "JobLogGroup", {
      logGroupName: JOB_LOG_GROUP,
      retention: logs.RetentionDays.TWO_WEEKS,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // ── ECS cluster ────────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      clusterName: CLUSTER_NAME,
      vpc,
    })
    cluster.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── ECR repos (existing) ───────────────────────────────────────────────
    const webRepo = ecr.Repository.fromRepositoryName(this, "WebRepo", WEB_ECR_REPO)
    const jobRepo = ecr.Repository.fromRepositoryName(this, "JobRepo", JOB_ECR_REPO)

    // ── web task definition ────────────────────────────────────────────────
    const webTaskDef = new ecs.FargateTaskDefinition(this, "WebTaskDef", {
      family: WEB_TASK_FAMILY,
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      executionRole,
      taskRole,
    })
    webTaskDef.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    const secretFields = (keys: string[]): Record<string, ecs.Secret> =>
      Object.fromEntries(
        keys.map(k => [k, ecs.Secret.fromSecretsManager(appSecret, k)])
      )

    webTaskDef.addContainer("web", {
      containerName: "web",
      image: ecs.ContainerImage.fromEcrRepository(webRepo, webImageTag),
      portMappings: [{ containerPort: 3000, protocol: ecs.Protocol.TCP }],
      environment: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "0.0.0.0",
        AWS_REGION: REGION,
      },
      secrets: secretFields(WEB_SECRETS),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "web",
        logGroup: webLogGroup,
      }),
    })

    // ── ALB + target group ─────────────────────────────────────────────────
    const alb = elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(this, "Alb", {
      loadBalancerArn: ALB_ARN,
      loadBalancerDnsName: ALB_DNS_NAME,
      loadBalancerCanonicalHostedZoneId: ALB_CANONICAL_HOSTED_ZONE_ID,
      securityGroupId: ALB_SG_ID,
      vpc,
    })

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "WebTargetGroup", {
      targetGroupName: TARGET_GROUP_NAME,
      vpc,
      protocol: elbv2.ApplicationProtocol.HTTP,
      port: 3000,
      targetType: elbv2.TargetType.IP,
      healthCheck: {
        path: "/api/health",
        protocol: elbv2.Protocol.HTTP,
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
        healthyHttpCodes: "200",
      },
    })
    const targetGroupResource = targetGroup.node.defaultChild as elbv2.CfnTargetGroup
    targetGroupResource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── ECS web service ────────────────────────────────────────────────────
    const webService = new ecs.FargateService(this, "WebService", {
      serviceName: SERVICE_NAME,
      cluster,
      taskDefinition: webTaskDef,
      desiredCount: 1,
      assignPublicIp: false,
      minHealthyPercent: 100,
      vpcSubnets: { subnets: privateSubnets },
      securityGroups: [fargateSg],
      healthCheckGracePeriod: cdk.Duration.seconds(120),
    })
    webService.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    webService.attachToApplicationTargetGroup(targetGroup)

    // ALB listener rule (canary path-pattern) via L1 to avoid needing listener ARN at synth time
    // Use CfnListenerRule so the listener ARN can be injected via CloudFormation parameter if needed.
    // During `cdk import`, the existing rule is matched by priority 90.
    new cdk.CfnOutput(this, "TargetGroupArn", { value: targetGroup.targetGroupArn })

    // ── job task definition ────────────────────────────────────────────────
    const jobTaskDef = new ecs.FargateTaskDefinition(this, "JobTaskDef", {
      family: JOB_TASK_FAMILY,
      cpu: 512,
      memoryLimitMiB: 1024,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.X86_64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
      },
      executionRole,
      taskRole,
    })
    jobTaskDef.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    jobTaskDef.addContainer("job", {
      containerName: "job",
      image: ecs.ContainerImage.fromEcrRepository(jobRepo, jobImageTag),
      environment: {
        NODE_ENV: "production",
        AWS_REGION: REGION,
      },
      secrets: secretFields(JOB_SECRETS),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "job",
        logGroup: jobLogGroup,
      }),
    })

    // ── SQS DLQ for EventBridge Scheduler ─────────────────────────────────
    const dlq = new sqs.Queue(this, "CronDlq", {
      queueName: DLQ_NAME,
      retentionPeriod: cdk.Duration.days(14),
    })
    dlq.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    dlq.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowEventBridgeSchedulerDLQ",
      principals: [new iam.ServicePrincipal("scheduler.amazonaws.com")],
      actions: ["sqs:SendMessage"],
      resources: [dlq.queueArn],
      conditions: {
        StringEquals: { "aws:SourceAccount": ACCOUNT },
        ArnLike: { "aws:SourceArn": `arn:aws:scheduler:${REGION}:${ACCOUNT}:schedule/${SCHEDULE_GROUP_NAME}/*` },
      },
    }))

    // ── IAM: scheduler role ────────────────────────────────────────────────
    const schedulerRole = new iam.Role(this, "SchedulerRole", {
      roleName: SCHEDULER_ROLE_NAME,
      assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com", {
        conditions: { StringEquals: { "aws:SourceAccount": ACCOUNT } },
      }),
      inlinePolicies: {
        "weather-warning-scheduler-inline": new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              actions: ["ecs:RunTask"],
              resources: [`arn:aws:ecs:${REGION}:${ACCOUNT}:task-definition/${JOB_TASK_FAMILY}:*`],
              conditions: {
                ArnLike: { "ecs:cluster": `arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${CLUSTER_NAME}` },
              },
            }),
            new iam.PolicyStatement({
              actions: ["iam:PassRole"],
              resources: [executionRole.roleArn, taskRole.roleArn],
            }),
            new iam.PolicyStatement({
              actions: ["sqs:SendMessage"],
              resources: [dlq.queueArn],
            }),
          ],
        }),
      },
    })
    schedulerRole.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── EventBridge schedule group ─────────────────────────────────────────
    const scheduleGroup = new scheduler.CfnScheduleGroup(this, "ScheduleGroup", {
      name: SCHEDULE_GROUP_NAME,
    })
    scheduleGroup.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    // ── EventBridge schedules (7 cron jobs) ───────────────────────────────
    // TaskDefinition references the family name (no :revision) so that
    // `sv.sh deploy job` can register new revisions without a CDK deploy.
    const subnetList = PRIVATE_SUBNETS.join(",")

    if (manageSchedules) {
      SCHEDULES.forEach(({ name, cron, script }) => {
        const schedule = new scheduler.CfnSchedule(this, `Schedule-${name}`, {
          name,
          groupName: SCHEDULE_GROUP_NAME,
          scheduleExpression: cron,
          scheduleExpressionTimezone: "UTC",
          flexibleTimeWindow: { mode: "OFF" },
          state: "ENABLED",
          target: {
            roleArn: schedulerRole.roleArn,
            arn: "arn:aws:scheduler:::aws-sdk:ecs:runTask",
            input: JSON.stringify({
              Cluster: `arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${CLUSTER_NAME}`,
              TaskDefinition: JOB_TASK_FAMILY,
              LaunchType: "FARGATE",
              PlatformVersion: "LATEST",
              Count: 1,
              NetworkConfiguration: {
                AwsvpcConfiguration: {
                  Subnets: subnetList.split(","),
                  SecurityGroups: [FARGATE_SG_ID],
                  AssignPublicIp: "DISABLED",
                },
              },
              Overrides: {
                ContainerOverrides: [{ Name: "job", Command: [script] }],
              },
              PropagateTags: "TASK_DEFINITION",
            }),
            retryPolicy: { maximumEventAgeInSeconds: 3600, maximumRetryAttempts: 2 },
            deadLetterConfig: { arn: dlq.queueArn },
          },
        })
        schedule.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
      })
    }

    // ── SNS topic for alerts ───────────────────────────────────────────────
    const alertTopic = new sns.Topic(this, "AlertTopic", {
      topicName: SNS_TOPIC_NAME,
    })
    alertTopic.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)

    alertTopic.addToResourcePolicy(new iam.PolicyStatement({
      sid: "AllowCloudWatchAndEventBridgePublish",
      principals: [
        new iam.ServicePrincipal("cloudwatch.amazonaws.com"),
        new iam.ServicePrincipal("events.amazonaws.com"),
      ],
      actions: ["sns:Publish"],
      resources: [alertTopic.topicArn],
      conditions: { StringEquals: { "aws:SourceAccount": ACCOUNT } },
    }))

    const snsAction = new cloudwatchActions.SnsAction(alertTopic)

    // ── CloudWatch alarms ──────────────────────────────────────────────────
    // ALB metrics reference the load balancer by its suffix (part after "loadbalancer/")
    // which CDK needs from a lookup. Use CfnAlarm with literal dimension values
    // to avoid requiring a second CDK lookup for the ALB ARN at synth time.
    // These alarms are created with placeholder lb/tg dimension values; run
    // `cdk deploy` once after `cdk import` to reconcile actual ARN suffixes.

    const albMetricDimensions = (metricName: string): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName,
        dimensionsMap: {
          LoadBalancer: cdk.Fn.select(
            1,
            cdk.Fn.split("loadbalancer/", alb.loadBalancerArn)
          ),
        },
        period: cdk.Duration.seconds(300),
      })

    const albTgMetricDimensions = (metricName: string): cloudwatch.Metric =>
      new cloudwatch.Metric({
        namespace: "AWS/ApplicationELB",
        metricName,
        dimensionsMap: {
          LoadBalancer: cdk.Fn.select(
            1,
            cdk.Fn.split("loadbalancer/", alb.loadBalancerArn)
          ),
          TargetGroup: cdk.Fn.select(
            1,
            cdk.Fn.split("targetgroup/", targetGroup.targetGroupArn)
          ),
        },
        period: cdk.Duration.seconds(300),
      })

    const alb5xx = new cloudwatch.Alarm(this, "Alb5xx", {
      alarmName: "weather-warning-alb-5xx",
      alarmDescription: "ALB generated 5xx responses for Weather Warning web",
      metric: albMetricDimensions("HTTPCode_ELB_5XX_Count").with({ statistic: "Sum" }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    alb5xx.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    alb5xx.addAlarmAction(snsAction)

    const target5xx = new cloudwatch.Alarm(this, "Target5xx", {
      alarmName: "weather-warning-web-target-5xx",
      alarmDescription: "Weather Warning web target generated 5xx responses",
      metric: albTgMetricDimensions("HTTPCode_Target_5XX_Count").with({ statistic: "Sum" }),
      threshold: 5,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    target5xx.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    target5xx.addAlarmAction(snsAction)

    const responseSlow = new cloudwatch.Alarm(this, "ResponseSlow", {
      alarmName: "weather-warning-web-response-slow",
      alarmDescription: "Weather Warning web target response time p95 is high",
      metric: albTgMetricDimensions("TargetResponseTime").with({ statistic: "p95" }),
      threshold: 3,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    responseSlow.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    responseSlow.addAlarmAction(snsAction)

    const unhealthy = new cloudwatch.Alarm(this, "TargetUnhealthy", {
      alarmName: "weather-warning-target-unhealthy",
      alarmDescription: "Fargate target group has unhealthy targets",
      metric: albTgMetricDimensions("UnHealthyHostCount").with({
        statistic: "Maximum",
        period: cdk.Duration.seconds(60),
      }),
      threshold: 1,
      evaluationPeriods: 2,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    unhealthy.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    unhealthy.addAlarmAction(snsAction)

    const cpuHigh = new cloudwatch.Alarm(this, "CpuHigh", {
      alarmName: "weather-warning-web-cpu-high",
      alarmDescription: "ECS web service CPU is high",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ECS",
        metricName: "CPUUtilization",
        dimensionsMap: { ClusterName: CLUSTER_NAME, ServiceName: SERVICE_NAME },
        statistic: "Average",
        period: cdk.Duration.seconds(300),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    cpuHigh.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    cpuHigh.addAlarmAction(snsAction)

    const memHigh = new cloudwatch.Alarm(this, "MemHigh", {
      alarmName: "weather-warning-web-memory-high",
      alarmDescription: "ECS web service memory is high",
      metric: new cloudwatch.Metric({
        namespace: "AWS/ECS",
        metricName: "MemoryUtilization",
        dimensionsMap: { ClusterName: CLUSTER_NAME, ServiceName: SERVICE_NAME },
        statistic: "Average",
        period: cdk.Duration.seconds(300),
      }),
      threshold: 80,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    memHigh.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    memHigh.addAlarmAction(snsAction)

    const dlqVisible = new cloudwatch.Alarm(this, "DlqVisible", {
      alarmName: "weather-warning-cron-dlq-visible",
      alarmDescription: "EventBridge Scheduler failed events landed in the cron DLQ",
      metric: new cloudwatch.Metric({
        namespace: "AWS/SQS",
        metricName: "ApproximateNumberOfMessagesVisible",
        dimensionsMap: { QueueName: DLQ_NAME },
        statistic: "Maximum",
        period: cdk.Duration.seconds(60),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    dlqVisible.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    dlqVisible.addAlarmAction(snsAction)

    const fetchError = new cloudwatch.Alarm(this, "FetchError", {
      alarmName: "weather-warning-fetch-error",
      alarmDescription: "Weather fetch errors detected in job runner",
      metric: new cloudwatch.Metric({
        namespace: "Weather Warning",
        metricName: "WeatherFetchError",
        statistic: "Sum",
        period: cdk.Duration.seconds(300),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    })
    fetchError.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    fetchError.addAlarmAction(snsAction)

    // ── EventBridge rules ──────────────────────────────────────────────────
    const deployFailedRule = new events.Rule(this, "DeployFailedRule", {
      ruleName: "weather-warning-web-deployment-failed",
      description: "Notify when Weather Warning web ECS deployment fails",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Deployment State Change"],
        detail: {
          clusterArn: [`arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${CLUSTER_NAME}`],
          eventName: ["SERVICE_DEPLOYMENT_FAILED"],
          service: [{ suffix: `/${SERVICE_NAME}` }],
        },
      },
    })
    deployFailedRule.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    deployFailedRule.addTarget(new eventsTargets.SnsTopic(alertTopic))

    const taskStoppedRule = new events.Rule(this, "TaskStoppedRule", {
      ruleName: "weather-warning-web-task-stopped",
      description: "Notify when a Weather Warning web ECS task stops outside normal service scaling",
      eventPattern: {
        source: ["aws.ecs"],
        detailType: ["ECS Task State Change"],
        detail: {
          clusterArn: [`arn:aws:ecs:${REGION}:${ACCOUNT}:cluster/${CLUSTER_NAME}`],
          lastStatus: ["STOPPED"],
          group: [{ prefix: `service:${SERVICE_NAME}` }],
          stoppedReason: [{ "anything-but": { prefix: "Scaling activity initiated by" } }],
        },
      },
    })
    taskStoppedRule.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
    taskStoppedRule.addTarget(new eventsTargets.SnsTopic(alertTopic))

    // ── outputs ────────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "ClusterArn", { value: cluster.clusterArn, exportName: "Weather WarningClusterArn" })
    new cdk.CfnOutput(this, "WebServiceName", { value: webService.serviceName, exportName: "Weather WarningWebServiceName" })
    new cdk.CfnOutput(this, "WebEcrRepo", { value: webRepo.repositoryUri })
    new cdk.CfnOutput(this, "JobEcrRepo", { value: jobRepo.repositoryUri })
    new cdk.CfnOutput(this, "AlertTopicArn", { value: alertTopic.topicArn, exportName: "Weather WarningAlertTopicArn" })
    new cdk.CfnOutput(this, "CronDlqArn", { value: dlq.queueArn })
    new cdk.CfnOutput(this, "WebImageUsed", { value: webImageTag })
    new cdk.CfnOutput(this, "JobImageUsed", { value: jobImageTag })
  }
}
