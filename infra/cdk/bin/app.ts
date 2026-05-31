import * as cdk from "aws-cdk-lib"
import { WeatherWarningFoundationStack } from "../lib/weather-warning-foundation-stack"
import { WeatherWarningStack } from "../lib/weather-warning-stack"

const app = new cdk.App()
new WeatherWarningFoundationStack(app, "WeatherWarningFoundationStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Weather Warning AgentCore foundation resources",
  synthesizer: new cdk.CliCredentialsStackSynthesizer(),
})

new WeatherWarningStack(app, "WeatherWarningStack", {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: "us-east-1" },
  description: "Weather Warning AgentCore — ECS Fargate web + cron jobs + observability",
  synthesizer: new cdk.CliCredentialsStackSynthesizer(),
})
