import { NextResponse } from "next/server"
import { logger } from "@/lib/logger"

/**
 * 统一 API 错误处理：捕获未处理异常，记录日志，返回 500
 * 用法：return withHandler(pathname, () => { ... your logic ... })
 */
export async function withHandler(pathname: string, fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    logger.error({ url: pathname, err: msg }, "api.unhandled_error")
    return NextResponse.json({ error: "internal server error" }, { status: 500 })
  }
}
