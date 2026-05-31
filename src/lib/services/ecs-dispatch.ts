import { ECSClient, RunTaskCommand } from "@aws-sdk/client-ecs"
import { env } from "@/lib/env"

const CLUSTER_ARN = `arn:aws:ecs:${env.AWS_REGION}:564535962140:cluster/weather-warning`
const JOB_TASK_FAMILY = "weather-warning-job"
const SUBNETS = ["subnet-0b2d6a7e941540c9e", "subnet-0508e05881b38c314"]
const SECURITY_GROUP = "sg-040b4aedfef5411d0"

let _client: ECSClient | null = null
function getClient() {
  return (_client ??= new ECSClient({ region: env.AWS_REGION }))
}

export async function dispatchEcsTask(script: string, args: string[] = []): Promise<void> {
  const command = [script, ...args]
  await getClient().send(new RunTaskCommand({
    cluster: CLUSTER_ARN,
    taskDefinition: JOB_TASK_FAMILY,
    launchType: "FARGATE",
    platformVersion: "LATEST",
    networkConfiguration: {
      awsvpcConfiguration: {
        subnets: SUBNETS,
        securityGroups: [SECURITY_GROUP],
        assignPublicIp: "DISABLED",
      },
    },
    overrides: {
      containerOverrides: [{ name: "job", command }],
    },
    count: 1,
  }))
}
