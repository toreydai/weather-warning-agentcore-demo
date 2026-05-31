import json
import os
import psycopg2

DB_URL = os.environ.get("DATABASE_URL", "")

def get_conn():
    return psycopg2.connect(DB_URL, sslmode="require")

def handler(event, context):
    api_path = event.get("apiPath", "")
    params = {}
    for p in event.get("requestBody", {}).get("content", {}).get("application/json", {}).get("properties", []):
        params[p["name"]] = p["value"]

    # Also check parameters from path/query
    for p in event.get("parameters", []):
        params[p["name"]] = p["value"]

    try:
        result = route(api_path, params)
    except Exception as e:
        result = {"error": str(e)}

    return {
        "messageVersion": "1.0",
        "response": {
            "actionGroup": event.get("actionGroup", ""),
            "apiPath": api_path,
            "httpMethod": event.get("httpMethod", "POST"),
            "httpStatusCode": 200,
            "responseBody": {
                "application/json": {"body": json.dumps(result, default=str)}
            }
        }
    }

def route(path, params):
    conn = get_conn()
    cur = conn.cursor()
    try:
        if path == "/query-field":
            cur.execute("SELECT id,name,latitude,longitude,variety,planting_date,area_mu FROM field WHERE id=%s", (params["field_id"],))
            row = cur.fetchone()
            if not row:
                return {"error": "not found"}
            return dict(zip(["id","name","latitude","longitude","variety","planting_date","area_mu"], row))

        elif path == "/query-weather":
            sql = "SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity FROM daily_weather WHERE field_id=%s"
            args = [params["field_id"]]
            if params.get("start_date"):
                sql += " AND date >= %s"; args.append(params["start_date"])
            if params.get("end_date"):
                sql += " AND date <= %s"; args.append(params["end_date"])
            sql += " ORDER BY date"
            cur.execute(sql, args)
            cols = ["date","temp_max","temp_min","temp_mean","precipitation","wind_speed_max","humidity"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

        elif path == "/query-forecast":
            cur.execute("SELECT date,temp_max,temp_min,temp_mean,precipitation,wind_speed_max,humidity FROM weather_forecast WHERE field_id=%s ORDER BY date", (params["field_id"],))
            cols = ["date","temp_max","temp_min","temp_mean","precipitation","wind_speed_max","humidity"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

        elif path == "/query-alerts":
            cur.execute("SELECT id,date,type,severity,title,description,start_date,end_date FROM alert WHERE field_id=%s ORDER BY date DESC LIMIT 50", (params["field_id"],))
            cols = ["id","date","type","severity","title","description","start_date","end_date"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

        elif path == "/query-thresholds":
            cur.execute("SELECT alert_type,yellow_condition,orange_condition,red_condition FROM alert_threshold")
            return [dict(zip(["alert_type","yellow","orange","red"], r)) for r in cur.fetchall()]

        elif path == "/query-advice-history":
            weeks = int(params.get("weeks", 4))
            cur.execute(
                "SELECT week_start,week_end,growth_stage,source,summary,fertilizer,pesticide,irrigation,field_work,reviewed_by "
                "FROM farming_advice_record WHERE field_id=%s ORDER BY week_start DESC LIMIT %s",
                (params["field_id"], weeks))
            cols = ["week_start","week_end","growth_stage","source","summary","fertilizer","pesticide","irrigation","field_work","reviewed_by"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

        elif path == "/query-historical-monthly":
            region = params.get("region", "xilinhaote")
            cur.execute("SELECT month,avg_temp_max,avg_temp_min,avg_temp_mean,avg_precipitation FROM historical_monthly WHERE region=%s ORDER BY month", (region,))
            cols = ["month","avg_temp_max","avg_temp_min","avg_temp_mean","avg_precipitation"]
            return [dict(zip(cols, r)) for r in cur.fetchall()]

        elif path == "/save-advice":
            cur.execute(
                "INSERT INTO farming_advice_record (field_id,week_start,week_end,growth_stage,source,summary,fertilizer,pesticide,irrigation,field_work,ai_model) "
                "VALUES (%s,%s,%s,%s,'agentcore',%s,%s,%s,%s,%s,'agentcore') "
                "ON CONFLICT (field_id,week_start) DO UPDATE SET "
                "week_end=EXCLUDED.week_end,growth_stage=EXCLUDED.growth_stage,summary=EXCLUDED.summary,"
                "fertilizer=EXCLUDED.fertilizer,pesticide=EXCLUDED.pesticide,irrigation=EXCLUDED.irrigation,"
                "field_work=EXCLUDED.field_work,ai_model='agentcore',source='agentcore',updated_at=NOW() "
                "WHERE farming_advice_record.source != 'manual'",
                (params["field_id"], params["week_start"], params.get("week_end",""),
                 params.get("growth_stage",""), params.get("summary",""), params.get("fertilizer",""),
                 params.get("pesticide",""), params.get("irrigation",""), params.get("field_work","")))
            conn.commit()
            return {"status": "saved"}

        elif path == "/send-notification":
            import boto3
            topic_arn = os.environ.get("SNS_ALERT_TOPIC_ARN")
            if not topic_arn:
                return {"status": "skipped", "reason": "no topic ARN"}
            sns = boto3.client("sns")
            level = "红色" if params["severity"] == "red" else "橙色"
            subject = f"[{level}预警] {params['field_name']}: {params['title']}"[:100]
            sns.publish(TopicArn=topic_arn, Subject=subject, Message=f"{subject}\n\n{params['description']}")
            return {"status": "sent"}

        return {"error": f"unknown path: {path}"}
    finally:
        cur.close()
        conn.close()
