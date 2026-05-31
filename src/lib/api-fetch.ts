/**
 * 统一 fetch 封装：401 自动跳登录，非 2xx 抛错
 */
export async function apiFetch(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (res.status === 401) {
    window.location.href = "/login"
    // 返回一个永不 resolve 的 Promise，阻止后续代码执行
    return new Promise(() => {})
  }
  return res
}
