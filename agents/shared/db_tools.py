"""共享数据库工具 — 所有 Agent 统一使用，避免重复代码"""
import os
from datetime import datetime
from strands import tool
import psycopg2
from psycopg2.extras import RealDictCursor

DB_URL = os.environ.get("DATABASE_URL", "")


def get_conn():
    return psycopg2.connect(DB_URL, cursor_factory=RealDictCursor)


@tool
def query_field(field_id: int) -> dict:
    """查询地块基本信息（名称、经纬度、品种、播种日期、面积）"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id,name,latitude,longitude,variety,planting_date,area_mu FROM field WHERE id=%s",
                (field_id,),
            )
            row = cur.fetchone()
            return dict(row) if row else {}
    finally:
        conn.close()


@tool
def query_weather(field_id: int, days: int = 5) -> list:
    """查询最近实况天气（温度、降水、风速、湿度）"""
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity "
                "FROM daily_weather WHERE field_id=%s AND date<=%s ORDER BY date DESC LIMIT %s",
                (field_id, today, days),
            )
            return [dict(r) for r in cur.fetchall()][::-1]
    finally:
        conn.close()


@tool
def query_forecast(field_id: int, limit: int = 7) -> list:
    """查询未来天气预报（7-14天逐日预报）"""
    today = datetime.now().strftime("%Y-%m-%d")
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity "
                "FROM weather_forecast WHERE field_id=%s AND date>=%s ORDER BY date LIMIT %s",
                (field_id, today, limit),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@tool
def query_alerts(field_id: int) -> list:
    """查询现有预警记录（霜冻、暴雨、大风、高温等）"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT type,severity,title,date FROM alert WHERE field_id=%s ORDER BY date DESC LIMIT 5",
                (field_id,),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@tool
def query_thresholds() -> list:
    """查询预警阈值配置（黄橙红三级）"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT alert_type,yellow_condition,orange_condition,red_condition FROM alert_threshold")
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@tool
def query_advice_history(field_id: int, weeks: int = 4) -> list:
    """查询历史农事建议记录"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT week_start,growth_stage,summary FROM farming_advice_record "
                "WHERE field_id=%s ORDER BY week_start DESC LIMIT %s",
                (field_id, weeks),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@tool
def query_historical_monthly(region: str = "xilinhaote") -> list:
    """查询历史同期月均气象数据"""
    cur_month = datetime.now().month
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT month,avg_temp_max,avg_temp_min,avg_temp_mean,avg_precipitation "
                "FROM historical_monthly WHERE region=%s AND month BETWEEN %s AND %s ORDER BY month",
                (region, max(1, cur_month - 1), min(12, cur_month + 1)),
            )
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


@tool
def save_advice(field_id: int, week_start: str, week_end: str = "", growth_stage: str = "",
                summary: str = "", fertilizer: str = "", pesticide: str = "",
                irrigation: str = "", field_work: str = "") -> dict:
    """保存农事建议到数据库（不覆盖人工编辑版本）"""
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO farming_advice_record (field_id,week_start,week_end,growth_stage,source,"
                "summary,fertilizer,pesticide,irrigation,field_work,ai_model) "
                "VALUES (%s,%s,%s,%s,'agentcore',%s,%s,%s,%s,%s,'mixed') "
                "ON CONFLICT (field_id,week_start) DO UPDATE SET "
                "week_end=EXCLUDED.week_end,growth_stage=EXCLUDED.growth_stage,"
                "summary=EXCLUDED.summary,fertilizer=EXCLUDED.fertilizer,"
                "pesticide=EXCLUDED.pesticide,irrigation=EXCLUDED.irrigation,"
                "field_work=EXCLUDED.field_work,ai_model='mixed',source='agentcore',updated_at=NOW() "
                "WHERE farming_advice_record.source != 'manual'",
                (field_id, week_start, week_end, growth_stage, summary,
                 fertilizer, pesticide, irrigation, field_work),
            )
            conn.commit()
            return {"status": "saved"}
    finally:
        conn.close()
