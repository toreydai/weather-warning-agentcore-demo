import { z } from "zod"

const fieldSchemaBase = z.object({
  name: z.string().min(1, "名称不能为空"),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  area_mu: z.number().positive().nullable().optional(),
  variety: z.string().nullable().optional(),
  planting_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  region: z.string().min(1).optional(),
  province: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1).nullable().optional(),
  county: z.string().trim().min(1).nullable().optional(),
  township: z.string().trim().min(1).nullable().optional(),
  admin_code: z.string().trim().min(1).nullable().optional(),
  address: z.string().trim().min(1).nullable().optional(),
  harvest_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  harvest_type: z.enum(["normal", "early", "late"]).nullable().optional(),
  notes: z.string().trim().nullable().optional(),
})

export const createFieldSchema = fieldSchemaBase
  .refine(d => (d.latitude == null) === (d.longitude == null), {
    message: "经纬度必须同时提供",
    path: ["longitude"],
  })
  .refine(d => d.latitude != null || d.admin_code != null || d.county != null, {
    message: "缺少坐标时必须提供县/旗",
    path: ["latitude"],
  })

export const updateFieldSchema = fieldSchemaBase.partial()
  .refine(d => (d.latitude == null) === (d.longitude == null), {
    message: "经纬度必须同时提供",
    path: ["longitude"],
  })

const validJson = z.string().refine(s => { try { JSON.parse(s); return true } catch { return false } }, "无效 JSON")
const stageSchema = z.enum(["preplant", "seedling", "vegetative", "budding", "flowering", "bulking", "maturation", "harvested"]).nullable().optional()

export const updateThresholdSchema = z.object({
  id: z.number(),
  stage: stageSchema,
  reference_source: z.string().trim().nullable().optional(),
  reference_note: z.string().trim().nullable().optional(),
  yellow_condition: validJson,
  orange_condition: validJson,
  red_condition: validJson,
})

export const createThresholdSchema = z.object({
  alert_type: z.string().min(1).max(64).regex(/^[a-z0-9_]+$/, "只能包含小写字母、数字和下划线"),
  stage: stageSchema,
  label: z.string().min(1).max(20),
  reference_source: z.string().trim().nullable().optional(),
  reference_note: z.string().trim().nullable().optional(),
  yellow_condition: validJson,
  orange_condition: validJson,
  red_condition: validJson,
})

export const chatSchema = z.object({
  message: z.string().min(1, "message required").max(2000, "消息过长"),
  fieldId: z.number().int().positive().optional(),
  sessionId: z.string().optional(),
})

export const chatSessionSchema = z.object({
  sessionId: z.string().min(1, "sessionId required").max(120, "sessionId too long"),
})

export const createZoneSchema = z.object({
  name: z.string().min(1, "名称不能为空").max(64),
  description: z.string().max(200).nullable().optional(),
  scope_type: z.enum(["fields", "admin", "mixed"]).default("fields"),
})

export const updateZoneSchema = z.object({
  name: z.string().min(1).max(64).optional(),
  description: z.string().max(200).nullable().optional(),
  scope_type: z.enum(["fields", "admin", "mixed"]).optional(),
})

export const addZoneMemberSchema = z.object({
  member_type: z.enum(["field", "township", "county"]),
  field_id: z.number().int().positive().optional(),
  admin_code: z.string().min(1).optional(),
  township: z.string().optional(),
  county: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
}).refine(
  d => (d.member_type === "field" ? d.field_id != null : d.admin_code != null),
  { message: "field 成员需提供 field_id，township/county 成员需提供 admin_code" }
)

export const createUserSchema = z.object({
  username: z.string().min(2, "用户名至少2位").max(50),
  password: z.string().min(6, "密码至少6位"),
  role: z.enum(["farmer", "agronomist", "reviewer", "admin"]),
})
