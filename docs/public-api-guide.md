# Public API 接入手册

面向外部接入方（第三方系统、合作伙伴）的使用说明。

**生产地址**：`http://weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com`

---

## 一、开通账号

联系平台管理员，告知需要使用哪些接口，管理员在后台 `/admin/oauth-clients` 为你创建客户端，并提供：

- `client_id`：客户端标识
- `client_secret`：客户端密钥（**请妥善保管，不要写入代码仓库**）

管理员会根据需求为客户端开通对应 scope，各接口所需 scope 如下：

| 接口 | 所需 scope |
|------|-----------|
| 天气预报 | `weather:read` |
| 当日预警 | `alert:read` |
| 农事建议 | `advice:read` |

如果调用某个接口时返回 `403 insufficient_scope`，联系管理员补充开通对应 scope。

---

## 二、获取访问令牌

每次调用 API 前需先获取 Bearer Token，有效期 **1 小时**。

```bash
curl -X POST http://{host}/api/v1/oauth/token \
  -H "Content-Type: application/json" \
  -d '{
    "grant_type": "client_credentials",
    "client_id": "YOUR_CLIENT_ID",
    "client_secret": "YOUR_CLIENT_SECRET"
  }'
```

成功响应：

```json
{
  "access_token": "eyJhbGci...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

> **最佳实践**：在业务系统中缓存 token，临近过期（如剩余 5 分钟时）主动刷新，避免每次请求都换 token。

---

## 三、调用接口

所有接口请求头携带：

```
Authorization: Bearer {access_token}
```

### 3.1 天气预报

获取指定地块未来 N 天的天气预报（最多 45 天）。

```
GET /api/v1/public/weather/forecast?field_id={id}&days={n}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `field_id` | integer | 是 | 地块 ID（由平台管理员提供） |
| `days` | integer | 否 | 预报天数，1–45，默认 7 |

```bash
curl "http://{host}/api/v1/public/weather/forecast?field_id=33&days=7" \
  -H "Authorization: Bearer $TOKEN"
```

响应示例：

```json
{
  "ok": true,
  "data": {
    "field_id": 33,
    "days": 7,
    "forecast": [
      {
        "date": "2026-05-18",
        "temp_max": 28.5,
        "temp_min": 18.2,
        "precipitation": 0,
        "wind_speed_max": 15.3,
        "humidity": 62,
        "weather_code": 1
      }
    ]
  },
  "meta": { "request_id": "uuid", "as_of": "2026-05-18T06:00:00.000Z" }
}
```

### 3.2 当日有效预警

获取指定地块今日有效的气象预警列表。

```
GET /api/v1/public/alerts/active?field_id={id}
```

```bash
curl "http://{host}/api/v1/public/alerts/active?field_id=33" \
  -H "Authorization: Bearer $TOKEN"
```

响应示例：

```json
{
  "ok": true,
  "data": {
    "field_id": 33,
    "date": "2026-05-18",
    "alerts": [
      {
        "id": 42,
        "date": "2026-05-18",
        "type": "heavy_rain",
        "severity": "orange",
        "title": "强降雨预警",
        "description": "未来 24 小时累计降水量预计超过 50mm",
        "stage": "块茎膨大期"
      }
    ]
  },
  "meta": { "request_id": "uuid", "as_of": "2026-05-18T06:00:00.000Z" }
}
```

无预警时 `alerts` 为空数组 `[]`，不会返回 404。

### 3.3 县级每日农事建议

获取指定县区的当日农事预警与建议内容。

```
GET /api/v1/public/advice/daily?county_code={code}&date={YYYY-MM-DD}
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `county_code` | string | 是 | 县级行政区划码，如 `420923` |
| `date` | string | 否 | 日期（YYYY-MM-DD），默认北京时间今日 |

```bash
curl "http://{host}/api/v1/public/advice/daily?county_code=420923&date=2026-05-18" \
  -H "Authorization: Bearer $TOKEN"
```

响应示例：

```json
{
  "ok": true,
  "data": {
    "county_code": "420923",
    "county_name": "天门市",
    "date": "2026-05-18",
    "stage": "块茎膨大期",
    "focus": "防涝排水",
    "content": "近期降水偏多，建议及时清理沟渠，防止田间积水...",
    "published_at": "2026-05-18T02:00:00.000Z"
  },
  "meta": { "request_id": "uuid", "as_of": "2026-05-18T06:00:00.000Z" }
}
```

当日无发布内容时返回 404。

---

## 四、错误处理

所有错误响应格式统一：

```json
{
  "ok": false,
  "errors": [{ "code": "invalid_param", "message": "field_id is required" }],
  "meta": { "request_id": "uuid", "as_of": "..." }
}
```

| HTTP 状态码 | 含义 | 处理建议 |
|-------------|------|----------|
| 400 | 参数错误 | 检查必填参数和格式 |
| 401 | token 无效或已过期 | 重新调用 `/oauth/token` 换取新 token |
| 403 | 无权访问该资源 | `insufficient_scope`：联系管理员开通对应接口的 scope；`forbidden`：确认 `field_id` 已授权给该客户端 |
| 404 | 数据不存在 | 正常情况（如当日无农事建议、地块 ID 不存在） |
| 429 | 超出限流 | 读取响应头 `Retry-After`（秒），等待后重试 |
| 500 | 服务器内部错误 | 记录 `meta.request_id` 联系平台方排查 |

---

## 五、限流说明

默认每个客户端 **60 次/分钟**。超限时：

- HTTP 状态码返回 `429`
- 响应头 `Retry-After: {秒数}` 指示最短等待时间

如业务需要更高配额，联系管理员在后台调整。

---

## 六、Python 接入示例

```python
import time
import requests

BASE = "http://weather-warning-agentcore-alb-54329175.us-east-1.elb.amazonaws.com"
CLIENT_ID = "YOUR_CLIENT_ID"
CLIENT_SECRET = "YOUR_CLIENT_SECRET"

class Weather WarningClient:
    def __init__(self):
        self._token = None
        self._token_expires_at = 0

    def _get_token(self):
        if time.time() < self._token_expires_at - 300:  # 提前 5 分钟刷新
            return self._token
        r = requests.post(f"{BASE}/api/v1/oauth/token", json={
            "grant_type": "client_credentials",
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        })
        r.raise_for_status()
        data = r.json()
        self._token = data["access_token"]
        self._token_expires_at = time.time() + data["expires_in"]
        return self._token

    def _headers(self):
        return {"Authorization": f"Bearer {self._get_token()}"}

    def get_forecast(self, field_id: int, days: int = 7):
        r = requests.get(f"{BASE}/api/v1/public/weather/forecast",
            params={"field_id": field_id, "days": days},
            headers=self._headers())
        r.raise_for_status()
        return r.json()["data"]

    def get_alerts(self, field_id: int):
        r = requests.get(f"{BASE}/api/v1/public/alerts/active",
            params={"field_id": field_id},
            headers=self._headers())
        r.raise_for_status()
        return r.json()["data"]["alerts"]

    def get_advice(self, county_code: str, date: str = None):
        params = {"county_code": county_code}
        if date:
            params["date"] = date
        r = requests.get(f"{BASE}/api/v1/public/advice/daily",
            params=params, headers=self._headers())
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.json()["data"]


# 使用示例
client = Weather WarningClient()
forecast = client.get_forecast(field_id=33, days=7)
alerts = client.get_alerts(field_id=33)
advice = client.get_advice(county_code="420923")
```

---

## 七、撤销令牌

如需主动使 token 失效：

```bash
curl -X POST http://{host}/api/v1/oauth/revoke \
  -H "Content-Type: application/json" \
  -d '{"token": "YOUR_ACCESS_TOKEN"}'
```

token 不存在时同样返回 200（符合 RFC 7009 规范）。
