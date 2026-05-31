import * as cdk from "aws-cdk-lib"
import { Construct } from "constructs"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ecr from "aws-cdk-lib/aws-ecr"
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2"
import * as rds from "aws-cdk-lib/aws-rds"
import * as s3 from "aws-cdk-lib/aws-s3"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import * as iam from "aws-cdk-lib/aws-iam"
import * as bedrock from "aws-cdk-lib/aws-bedrock"
import * as agentcore from "aws-cdk-lib/aws-bedrockagentcore"
import * as aoss from "aws-cdk-lib/aws-opensearchserverless"

const REGION = "us-east-1"
const ACCOUNT = "564535962140"

const VPC_ID = "vpc-eaab3390"
const VPC_CIDR = "172.31.0.0/16"

const PRIVATE_ROUTE_TABLE_ID = "rtb-0c78c1f40d7f36ea5"
const NAT_GATEWAY_ID = "nat-0c83b05a3b2dc1861"
const NAT_EIP_ALLOCATION_ID = "eipalloc-0960a0abfee400b84"
const NAT_EIP_PUBLIC_IP = "174.129.104.70"
const PRIVATE_SUBNETS = [
  { id: "subnet-0b2d6a7e941540c9e", az: "us-east-1b", cidr: "172.31.128.0/24", name: "weather-warning-private-1b", associationId: "rtbassoc-038f0d9f47b2c7e3a" },
  { id: "subnet-0508e05881b38c314", az: "us-east-1c", cidr: "172.31.129.0/24", name: "weather-warning-private-1c", associationId: "rtbassoc-0f5e94b995b17c1e5" },
]

const ALB_SUBNETS = [
  { id: "subnet-e9d79cc7", az: "us-east-1b", cidr: "172.31.80.0/20" },
  { id: "subnet-5b839f11", az: "us-east-1c", cidr: "172.31.16.0/20" },
]

const ALB_SG_ID = "sg-0d5c5be4755ce93ff"
const FARGATE_SG_ID = "sg-040b4aedfef5411d0"
const RDS_SG_ID = "sg-0b43c3a5d0bcaf4da"

const ALB_ARN = "arn:aws:elasticloadbalancing:us-east-1:564535962140:loadbalancer/app/weather-warning-agentcore-alb/5682860b231bc07f"
const LISTENER_ARN = "arn:aws:elasticloadbalancing:us-east-1:564535962140:listener/app/weather-warning-agentcore-alb/5682860b231bc07f/42f9e80eb0859b8e"
const CANARY_RULE_ARN = "arn:aws:elasticloadbalancing:us-east-1:564535962140:listener-rule/app/weather-warning-agentcore-alb/5682860b231bc07f/42f9e80eb0859b8e/a682a33c2bb6baed"
const WEB_TARGET_GROUP_ARN = "arn:aws:elasticloadbalancing:us-east-1:564535962140:targetgroup/weather-warning-web-tg/fac6479541815717"

const SECRET_NAME = "weather-warning/agentcore/app"
const WEB_ECR_REPO = "weather-warning-agentcore"
const JOB_ECR_REPO = "weather-warning-agentcore-job"
const DB_INSTANCE_ID = "weather-warning-agentcore-db"
const DB_SUBNET_GROUP_NAME = "default"
const KB_BUCKET_NAME = `weather-warning-backups-${ACCOUNT}`
const KB_ID = "R8OK5B4VRA"
const KB_DATA_SOURCE_ID = "SG4J4FPRDZ"
const AOSS_COLLECTION_ID = "0sncarqgb26oqxuw1fcg"
const AOSS_COLLECTION_ARN = `arn:aws:aoss:${REGION}:${ACCOUNT}:collection/${AOSS_COLLECTION_ID}`
const AGENTCORE_CODE_BUCKET = `bedrock-agentcore-codebuild-sources-${ACCOUNT}-${REGION}`
const AGENTCORE_RUNTIME_ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/weather-warning-agentcore-runtime-role`
const KB_ROLE_ARN = `arn:aws:iam::${ACCOUNT}:role/weather-warning-kb-role`
const DATABASE_URL_DYNAMIC_REFERENCE = `{{resolve:secretsmanager:${SECRET_NAME}:SecretString:DATABASE_URL}}`
const BUILDER_SG_ID = "sg-0b2c53fd8dea10398"
const BUILDER_SUBNET_ID = "subnet-77a9e510"
const BUILDER_AMI = "ami-0f8245b8fac4d601a"
const BUILDER_INSTANCE_TYPE = "c7g.2xlarge"
const BUILDER_KEY_NAME = "kp_virginia"

function retain(resource: cdk.CfnResource) {
  resource.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN)
  return resource
}

export class WeatherWarningFoundationStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: cdk.StackProps) {
    super(scope, id, props)

    const vpc = retain(new ec2.CfnVPC(this, "Vpc", {
      cidrBlock: VPC_CIDR,
      enableDnsHostnames: true,
      enableDnsSupport: true,
    }))

    PRIVATE_SUBNETS.forEach((subnet, index) => {
      retain(new ec2.CfnSubnet(this, `PrivateSubnet${index + 1}`, {
        vpcId: VPC_ID,
        availabilityZone: subnet.az,
        cidrBlock: subnet.cidr,
        mapPublicIpOnLaunch: false,
        tags: [{ key: "Name", value: subnet.name }],
      }))
    })

    ALB_SUBNETS.forEach((subnet, index) => {
      retain(new ec2.CfnSubnet(this, `AlbSubnet${index + 1}`, {
        vpcId: VPC_ID,
        availabilityZone: subnet.az,
        cidrBlock: subnet.cidr,
        mapPublicIpOnLaunch: true,
      }))
    })

    retain(new ec2.CfnRouteTable(this, "PrivateRouteTable", {
      vpcId: VPC_ID,
      tags: [
        { key: "Name", value: "weather-warning-private-rt" },
        { key: "Project", value: "weather-warning-agentcore-demo" },
      ],
    }))

    retain(new ec2.CfnEIP(this, "NatEip", {
      domain: "vpc",
      tags: [{ key: "Name", value: "weather-warning-nat" }],
    }))

    retain(new ec2.CfnNatGateway(this, "NatGateway", {
      allocationId: NAT_EIP_ALLOCATION_ID,
      subnetId: "subnet-e9d79cc7",
      connectivityType: "public",
      tags: [{ key: "Name", value: "weather-warning-nat" }],
    }))

    retain(new ec2.CfnRoute(this, "PrivateDefaultRoute", {
      routeTableId: PRIVATE_ROUTE_TABLE_ID,
      destinationCidrBlock: "0.0.0.0/0",
      natGatewayId: NAT_GATEWAY_ID,
    }))

    PRIVATE_SUBNETS.forEach((subnet, index) => {
      retain(new ec2.CfnSubnetRouteTableAssociation(this, `PrivateSubnetRouteAssociation${index + 1}`, {
        routeTableId: PRIVATE_ROUTE_TABLE_ID,
        subnetId: subnet.id,
      }))
    })

    retain(new ec2.CfnSecurityGroup(this, "AlbSecurityGroup", {
      groupDescription: "ALB for weather-warning agentcore",
      groupName: "weather-warning-agentcore-alb-sg",
      vpcId: VPC_ID,
      securityGroupEgress: [],
    }))

    retain(new ec2.CfnSecurityGroupIngress(this, "AlbIngressHttp", {
      groupId: ALB_SG_ID,
      ipProtocol: "tcp", fromPort: 80, toPort: 80, cidrIp: "0.0.0.0/0",
    }))
    retain(new ec2.CfnSecurityGroupEgress(this, "AlbEgressAll", {
      groupId: ALB_SG_ID,
      ipProtocol: "-1", cidrIp: "0.0.0.0/0",
    }))

    retain(new ec2.CfnSecurityGroup(this, "FargateSecurityGroup", {
      groupDescription: "Fargate tasks for weather-warning agentcore demo",
      groupName: "weather-warning-fargate-sg",
      vpcId: VPC_ID,
      securityGroupEgress: [],
      tags: [
        { key: "Name", value: "weather-warning-fargate-sg" },
        { key: "Project", value: "weather-warning-agentcore-demo" },
      ],
    }))

    retain(new ec2.CfnSecurityGroupIngress(this, "FargateIngressFromAlb", {
      groupId: FARGATE_SG_ID,
      ipProtocol: "tcp", fromPort: 3000, toPort: 3000,
      sourceSecurityGroupId: ALB_SG_ID,
      description: "HTTP from weather-warning agentcore ALB",
    }))
    retain(new ec2.CfnSecurityGroupEgress(this, "FargateEgressAll", {
      groupId: FARGATE_SG_ID,
      ipProtocol: "-1", cidrIp: "0.0.0.0/0",
    }))

    retain(new ec2.CfnSecurityGroup(this, "RdsSecurityGroup", {
      groupDescription: "RDS for weather-warning agentcore demo",
      groupName: "weather-warning-agentcore-rds-sg",
      vpcId: VPC_ID,
      securityGroupEgress: [],
    }))

    retain(new ec2.CfnSecurityGroupIngress(this, "RdsIngressFromFargate", {
      groupId: RDS_SG_ID,
      ipProtocol: "tcp", fromPort: 5432, toPort: 5432,
      sourceSecurityGroupId: FARGATE_SG_ID,
      description: "Postgres from Fargate tasks",
    }))
    retain(new ec2.CfnSecurityGroupIngress(this, "RdsIngressPublicPostgres", {
      groupId: RDS_SG_ID,
      ipProtocol: "tcp", fromPort: 5432, toPort: 5432, cidrIp: "0.0.0.0/0",
    }))
    retain(new ec2.CfnSecurityGroupEgress(this, "RdsEgressAll", {
      groupId: RDS_SG_ID,
      ipProtocol: "-1", cidrIp: "0.0.0.0/0",
    }))

    retain(new elbv2.CfnLoadBalancer(this, "ApplicationLoadBalancer", {
      name: "weather-warning-agentcore-alb",
      scheme: "internet-facing",
      type: "application",
      ipAddressType: "ipv4",
      securityGroups: [ALB_SG_ID],
      subnets: ALB_SUBNETS.map(subnet => subnet.id),
      loadBalancerAttributes: [
        { key: "idle_timeout.timeout_seconds", value: "120" },
        { key: "routing.http2.enabled", value: "true" },
      ],
    }))

    retain(new elbv2.CfnListener(this, "HttpListener", {
      loadBalancerArn: ALB_ARN,
      port: 80,
      protocol: "HTTP",
      defaultActions: [{ type: "forward", targetGroupArn: WEB_TARGET_GROUP_ARN }],
    }))

    retain(new elbv2.CfnListenerRule(this, "FargateCanaryRule", {
      listenerArn: LISTENER_ARN,
      priority: 90,
      actions: [{ type: "forward", targetGroupArn: WEB_TARGET_GROUP_ARN }],
      conditions: [{ field: "path-pattern", values: ["/__fargate/*"] }],
    }))

    for (const repoName of [WEB_ECR_REPO, JOB_ECR_REPO]) {
      retain(new ecr.CfnRepository(this, `Ecr${repoName === WEB_ECR_REPO ? "Web" : "Job"}Repository`, {
        repositoryName: repoName,
        imageTagMutability: "MUTABLE",
        imageScanningConfiguration: { scanOnPush: true },
        encryptionConfiguration: { encryptionType: "AES256" },
      }))
    }

    retain(new secretsmanager.CfnSecret(this, "AppSecret", {
      name: SECRET_NAME,
      description: "Runtime env for Weather Warning AgentCore ECS tasks",
      tags: [{ key: "Project", value: "weather-warning-agentcore-demo" }],
    }))

    retain(new rds.CfnDBSubnetGroup(this, "DbSubnetGroup", {
      dbSubnetGroupName: DB_SUBNET_GROUP_NAME,
      dbSubnetGroupDescription: "default",
      subnetIds: [
        "subnet-e9d79cc7",
        "subnet-b9898fb6",
        "subnet-77a9e510",
        "subnet-dcce5de2",
        "subnet-69e1a835",
        "subnet-5b839f11",
        "subnet-02eec2629f8e93eec",
      ],
    }))

    retain(new rds.CfnDBInstance(this, "Database", {
      dbInstanceIdentifier: DB_INSTANCE_ID,
      dbInstanceClass: "db.t3.micro",
      engine: "postgres",
      engineVersion: "16.10",
      dbName: "weather-warning",
      masterUsername: "weather-warning",
      allocatedStorage: "20",
      storageType: "gp3",
      iops: 3000,
      storageThroughput: 125,
      publiclyAccessible: true,
      multiAz: false,
      backupRetentionPeriod: 1,
      preferredBackupWindow: "08:53-09:23",
      preferredMaintenanceWindow: "sun:03:11-sun:03:41",
      autoMinorVersionUpgrade: true,
      dbSubnetGroupName: DB_SUBNET_GROUP_NAME,
      vpcSecurityGroups: [RDS_SG_ID],
      deletionProtection: false,
      storageEncrypted: false,
      copyTagsToSnapshot: false,
      monitoringInterval: 0,
      caCertificateIdentifier: "rds-ca-rsa2048-g1",
    }))

    retain(new s3.CfnBucket(this, "KnowledgeBaseBucket", {
      bucketName: KB_BUCKET_NAME,
      publicAccessBlockConfiguration: {
        blockPublicAcls: true,
        blockPublicPolicy: true,
        ignorePublicAcls: true,
        restrictPublicBuckets: true,
      },
      bucketEncryption: {
        serverSideEncryptionConfiguration: [{
          serverSideEncryptionByDefault: { sseAlgorithm: "AES256" },
          bucketKeyEnabled: false,
        }],
      },
    }))

    retain(new s3.CfnBucket(this, "AgentCoreCodeBucket", {
      bucketName: AGENTCORE_CODE_BUCKET,
      bucketEncryption: {
        serverSideEncryptionConfiguration: [{
          serverSideEncryptionByDefault: { sseAlgorithm: "AES256" },
          bucketKeyEnabled: false,
        }],
      },
    }))

    retain(new iam.CfnRole(this, "KnowledgeBaseRole", {
      roleName: "weather-warning-kb-role",
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { Service: "bedrock.amazonaws.com" },
          Action: "sts:AssumeRole",
        }],
      },
      maxSessionDuration: 3600,
      policies: [{
        policyName: "kb-permissions",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Action: ["bedrock:InvokeModel"],
              Resource: "*",
            },
            {
              Effect: "Allow",
              Action: ["s3:GetObject", "s3:ListBucket"],
              Resource: [
                `arn:aws:s3:::${KB_BUCKET_NAME}`,
                `arn:aws:s3:::${KB_BUCKET_NAME}/*`,
              ],
            },
            {
              Effect: "Allow",
              Action: ["aoss:APIAccessAll"],
              Resource: AOSS_COLLECTION_ARN,
            },
          ],
        },
      }],
    }))

    retain(new iam.CfnRole(this, "AgentCoreRuntimeRole", {
      roleName: "weather-warning-agentcore-runtime-role",
      assumeRolePolicyDocument: {
        Version: "2012-10-17",
        Statement: [{
          Effect: "Allow",
          Principal: { Service: "bedrock-agentcore.amazonaws.com" },
          Action: "sts:AssumeRole",
          Condition: { StringEquals: { "aws:SourceAccount": ACCOUNT } },
        }],
      },
      maxSessionDuration: 3600,
      managedPolicyArns: [
        "arn:aws:iam::aws:policy/CloudWatchLogsFullAccess",
        "arn:aws:iam::aws:policy/AmazonBedrockFullAccess",
      ],
      policies: [{
        policyName: "rds-access",
        policyDocument: {
          Version: "2012-10-17",
          Statement: [{
            Effect: "Allow",
            Action: ["rds-data:*", "rds:DescribeDBClusters"],
            Resource: "*",
          }],
        },
      }],
    }))

    const aossEncryptionPolicy = retain(new aoss.CfnSecurityPolicy(this, "KnowledgeBaseEncryptionPolicy", {
      name: "weather-warning-kb-enc",
      type: "encryption",
      policy: JSON.stringify({
        Rules: [{ Resource: ["collection/weather-warning-kb"], ResourceType: "collection" }],
        AWSOwnedKey: true,
      }),
    }))

    retain(new aoss.CfnSecurityPolicy(this, "KnowledgeBaseNetworkPolicy", {
      name: "weather-warning-kb-net",
      type: "network",
      policy: JSON.stringify([{
        Rules: [
          { Resource: ["collection/weather-warning-kb"], ResourceType: "collection" },
          { Resource: ["collection/weather-warning-kb"], ResourceType: "dashboard" },
        ],
        AllowFromPublic: true,
      }]),
    }))

    retain(new aoss.CfnAccessPolicy(this, "KnowledgeBaseAccessPolicy", {
      name: "weather-warning-kb-access",
      type: "data",
      policy: JSON.stringify([{
        Rules: [
          {
            Resource: ["collection/weather-warning-kb"],
            Permission: ["aoss:*"],
            ResourceType: "collection",
          },
          {
            Resource: ["index/weather-warning-kb/*"],
            Permission: ["aoss:*"],
            ResourceType: "index",
          },
        ],
        Principal: [
          "arn:aws:sts::564535962140:assumed-role/AdminRole/i-0006f7f51220ebdd2",
          KB_ROLE_ARN,
          `arn:aws:iam::${ACCOUNT}:role/AdminRole`,
        ],
      }]),
    }))

    const collection = retain(new aoss.CfnCollection(this, "KnowledgeBaseCollection", {
      name: "weather-warning-kb",
      type: "VECTORSEARCH",
      standbyReplicas: "ENABLED",
    }))
    collection.addDependency(aossEncryptionPolicy)

    retain(new bedrock.CfnKnowledgeBase(this, "KnowledgeBase", {
      name: "weather-warning-potato-kb",
      roleArn: KB_ROLE_ARN,
      knowledgeBaseConfiguration: {
        type: "VECTOR",
        vectorKnowledgeBaseConfiguration: {
          embeddingModelArn: `arn:aws:bedrock:${REGION}::foundation-model/amazon.titan-embed-text-v2:0`,
        },
      },
      storageConfiguration: {
        type: "OPENSEARCH_SERVERLESS",
        opensearchServerlessConfiguration: {
          collectionArn: AOSS_COLLECTION_ARN,
          vectorIndexName: "bedrock-kb-index",
          fieldMapping: {
            vectorField: "bedrock-knowledge-base-default-vector",
            textField: "AMAZON_BEDROCK_TEXT_CHUNK",
            metadataField: "AMAZON_BEDROCK_METADATA",
          },
        },
      },
    }))

    retain(new bedrock.CfnDataSource(this, "KnowledgeBaseDataSource", {
      knowledgeBaseId: KB_ID,
      name: "potato-farming-docs",
      dataDeletionPolicy: "DELETE",
      dataSourceConfiguration: {
        type: "S3",
        s3Configuration: {
          bucketArn: `arn:aws:s3:::${KB_BUCKET_NAME}`,
          inclusionPrefixes: ["knowledge-base/"],
        },
      },
      vectorIngestionConfiguration: {
        chunkingConfiguration: {
          chunkingStrategy: "FIXED_SIZE",
          fixedSizeChunkingConfiguration: {
            maxTokens: 300,
            overlapPercentage: 15,
          },
        },
      },
    }))

    for (const memory of [
      { id: "WeatherAnalystMemory", name: "weather-warning_weather_analyst_mem", description: "Memory for agent weather-warning_weather_analyst with STM only" },
      { id: "FarmingAdvisorFastMemory", name: "weather-warning_farming_advisor_fast_mem", description: "Memory for agent weather-warning_farming_advisor_fast with STM only" },
      { id: "FarmingAdvisorDeepMemory", name: "weather-warning_farming_advisor_deep_mem", description: "Memory for agent weather-warning_farming_advisor_deep with STM only" },
      { id: "AlertAnalystMemory", name: "weather-warning_alert_analyst_mem", description: "Memory for agent weather-warning_alert_analyst with STM only" },
    ]) {
      retain(new agentcore.CfnMemory(this, memory.id, {
        name: memory.name,
        description: memory.description,
        eventExpiryDuration: 30,
        memoryStrategies: [],
      }))
    }

    // AgentCore Runtime 由 sv.sh deploy agent 管理，不通过 CloudFormation 控制

    // ── ARM64 builder 安全组 ────────────────────────────────────────────────
    retain(new ec2.CfnSecurityGroup(this, "BuilderSecurityGroup", {
      groupDescription: "Temporary ARM builder for Weather Warning AgentCore demo",
      groupName: "weather-warning-agentcore-arm-builder-sg",
      vpcId: VPC_ID,
      securityGroupIngress: [{
        ipProtocol: "tcp",
        fromPort: 22,
        toPort: 22,
        cidrIp: "172.31.0.0/16",
        description: "SSH from default VPC only",
      }],
      securityGroupEgress: [{
        ipProtocol: "-1",
        cidrIp: "0.0.0.0/0",
      }],
      tags: [{ key: "Project", value: "weather-warning-agentcore-demo" }],
    }))

    // ── ARM64 builder EC2 实例 ──────────────────────────────────────────────
    retain(new ec2.CfnInstance(this, "ArmBuilder", {
      instanceType: BUILDER_INSTANCE_TYPE,
      imageId: BUILDER_AMI,
      subnetId: BUILDER_SUBNET_ID,
      securityGroupIds: [BUILDER_SG_ID],
      iamInstanceProfile: "AdminRole",
      keyName: BUILDER_KEY_NAME,
      tags: [
        { key: "Name", value: "Weather Warning-AgentCore-ARM64-Builder" },
        { key: "Project", value: "weather-warning-agentcore-demo" },
        { key: "Lifecycle", value: "stop-after-build" },
        { key: "Purpose", value: "arm64-build" },
      ],
    }))

    new cdk.CfnOutput(this, "VpcId", { value: VPC_ID, exportName: "Weather WarningFoundationVpcId" })
    new cdk.CfnOutput(this, "AlbArn", { value: ALB_ARN, exportName: "Weather WarningFoundationAlbArn" })
    new cdk.CfnOutput(this, "AppSecretName", { value: SECRET_NAME, exportName: "Weather WarningFoundationAppSecretName" })
    new cdk.CfnOutput(this, "KnowledgeBaseId", { value: KB_ID, exportName: "Weather WarningFoundationKnowledgeBaseId" })
    new cdk.CfnOutput(this, "KnowledgeBaseDataSourceId", { value: KB_DATA_SOURCE_ID, exportName: "Weather WarningFoundationKnowledgeBaseDataSourceId" })
    new cdk.CfnOutput(this, "CanaryRuleArn", { value: CANARY_RULE_ARN })
    new cdk.CfnOutput(this, "PrivateRouteTableId", { value: PRIVATE_ROUTE_TABLE_ID })
    new cdk.CfnOutput(this, "NatGatewayId", { value: NAT_GATEWAY_ID })
    new cdk.CfnOutput(this, "NatEipAllocationId", { value: NAT_EIP_ALLOCATION_ID })
    new cdk.CfnOutput(this, "NatEipPublicIp", { value: NAT_EIP_PUBLIC_IP })
    void vpc
  }
}
