import pino from "pino"
import { NextRequest } from "next/server"
import { env } from "@/lib/env"

export const logger = pino({ level: env.LOG_LEVEL })

export function getRequestId(req: NextRequest): string {
  return req.headers.get("x-request-id") ?? "unknown"
}

export function reqLogger(req: NextRequest) {
  return logger.child({ requestId: getRequestId(req) })
}
