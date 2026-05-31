import { Pool } from "pg"
import { PublishCommand, SNSClient } from "@aws-sdk/client-sns"

export interface CronReporter {
  success(items: number): Promise<void>
  fail(err: unknown): Promise<void>
}

async function publishAlert(name: string, msg: string) {
  const topic = process.env.CRON_ALERT_SNS_TOPIC_ARN
  if (!topic) return
  try {
    const sns = new SNSClient({ region: process.env.AWS_REGION ?? "us-east-1" })
    await sns.send(new PublishCommand({
      TopicArn: topic,
      Subject: `[weather-warning cron failed] ${name}`,
      Message: `cron job: ${name}\nstarted: ${new Date().toISOString()}\nerror: ${msg}`,
    }))
  } catch (publishErr) {
    console.error(`[cron-report] SNS publish failed: ${publishErr instanceof Error ? publishErr.message : publishErr}`)
  }
}

export async function startCronRun(pool: Pool, name: string): Promise<CronReporter> {
  const r = await pool.query("INSERT INTO cron_run (name, status) VALUES ($1, 'running') RETURNING id", [name])
  const id = r.rows[0].id as number
  return {
    async success(items: number) {
      await pool.query(
        "UPDATE cron_run SET finished_at = NOW(), status = 'success', items_processed = $1 WHERE id = $2",
        [items, id]
      )
    },
    async fail(err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      await pool.query(
        "UPDATE cron_run SET finished_at = NOW(), status = 'failed', error = $1 WHERE id = $2",
        [msg.slice(0, 2000), id]
      )
      await publishAlert(name, msg.slice(0, 2000))
    },
  }
}
