// CloudWatch Embedded Metric Format emitter.
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
//
// When this process runs under the CloudWatch agent (or any collector that parses EMF),
// writing this JSON to stdout automatically records the metrics. Free, no AWS SDK call.

type Unit =
  | "None" | "Count" | "Milliseconds" | "Seconds"
  | "Bytes" | "Kilobytes" | "Megabytes"
  | "Percent"

interface MetricDef { name: string; unit?: Unit; value: number }

export function emitMetric(namespace: string, metrics: MetricDef[], dimensions: Record<string, string> = {}) {
  if (!metrics.length) return
  const dimKeys = Object.keys(dimensions)
  const payload: Record<string, unknown> = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [{
        Namespace: namespace,
        Dimensions: [dimKeys],
        Metrics: metrics.map(m => ({ Name: m.name, Unit: m.unit ?? "None" })),
      }],
    },
    ...dimensions,
  }
  for (const m of metrics) payload[m.name] = m.value
  try {
    process.stdout.write(JSON.stringify(payload) + "\n")
  } catch {
    // swallow
  }
}
