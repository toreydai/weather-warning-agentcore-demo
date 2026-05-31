import { getDb } from "@/lib/db"
import { zone, zoneMember, field } from "@/lib/db/schema"
import { eq, and } from "drizzle-orm"

export type ZoneRow = typeof zone.$inferSelect
export type ZoneMemberRow = typeof zoneMember.$inferSelect

export async function getAllZones(): Promise<(ZoneRow & { member_count: number })[]> {
  const db = getDb()
  const zones = await db.select().from(zone).orderBy(zone.created_at)
  const members = await db.select({ zone_id: zoneMember.zone_id }).from(zoneMember)
  const countMap: Record<number, number> = {}
  for (const m of members) countMap[m.zone_id] = (countMap[m.zone_id] ?? 0) + 1
  return zones.map(z => ({ ...z, member_count: countMap[z.id] ?? 0 }))
}

export async function getZoneById(id: number): Promise<ZoneRow | null> {
  const db = getDb()
  const rows = await db.select().from(zone).where(eq(zone.id, id))
  return rows[0] ?? null
}

export async function getZoneWithMembers(id: number) {
  const db = getDb()
  const [zoneRow, members] = await Promise.all([
    getZoneById(id),
    db.select({
      id: zoneMember.id,
      zone_id: zoneMember.zone_id,
      member_type: zoneMember.member_type,
      field_id: zoneMember.field_id,
      admin_code: zoneMember.admin_code,
      township: zoneMember.township,
      county: zoneMember.county,
      // field 成员的经纬度来自 field 表；township/county 成员的经纬度来自 zone_member 自身
      latitude: zoneMember.latitude,
      longitude: zoneMember.longitude,
      field_latitude: field.latitude,
      field_longitude: field.longitude,
      field_name: field.name,
      field_county: field.county,
      field_township: field.township,
    })
      .from(zoneMember)
      .leftJoin(field, eq(zoneMember.field_id, field.id))
      .where(eq(zoneMember.zone_id, id)),
  ])
  if (!zoneRow) return null
  return { ...zoneRow, members }
}

export async function createZone(data: {
  name: string
  description?: string | null
  scope_type: string
  created_by?: number
}): Promise<ZoneRow> {
  const rows = await getDb().insert(zone).values({
    name: data.name,
    description: data.description ?? null,
    scope_type: data.scope_type,
    created_by: data.created_by ?? null,
  }).returning()
  return rows[0]
}

export async function updateZone(id: number, data: {
  name?: string
  description?: string | null
  scope_type?: string
}): Promise<ZoneRow | null> {
  const rows = await getDb()
    .update(zone)
    .set({ ...data, updated_at: new Date() })
    .where(eq(zone.id, id))
    .returning()
  return rows[0] ?? null
}

export async function deleteZone(id: number): Promise<boolean> {
  const rows = await getDb().delete(zone).where(eq(zone.id, id)).returning()
  return rows.length > 0
}

export async function addZoneMember(data: {
  zone_id: number
  member_type: string
  field_id?: number | null
  admin_code?: string | null
  township?: string | null
  county?: string | null
  latitude?: number | null
  longitude?: number | null
}): Promise<ZoneMemberRow> {
  const db = getDb()
  // dedup check
  if (data.member_type === "field" && data.field_id) {
    const existing = await db.select().from(zoneMember)
      .where(and(eq(zoneMember.zone_id, data.zone_id), eq(zoneMember.member_type, "field"), eq(zoneMember.field_id, data.field_id)))
    if (existing.length > 0) throw new Error("该地块已在此产区中")
  } else if (data.admin_code) {
    const existing = await db.select().from(zoneMember)
      .where(and(eq(zoneMember.zone_id, data.zone_id), eq(zoneMember.admin_code, data.admin_code)))
    if (existing.length > 0) throw new Error("该行政单元已在此产区中")
  }
  const rows = await db.insert(zoneMember).values({
    zone_id: data.zone_id,
    member_type: data.member_type,
    field_id: data.field_id ?? null,
    admin_code: data.admin_code ?? null,
    township: data.township ?? null,
    county: data.county ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
  }).returning()
  return rows[0]
}

export async function removeZoneMember(memberId: number): Promise<boolean> {
  const rows = await getDb().delete(zoneMember).where(eq(zoneMember.id, memberId)).returning()
  return rows.length > 0
}

export const ZONE_LIMIT = 5
export const MEMBER_LIMIT = 50
