import { Pool } from "pg"
import { hash } from "bcryptjs"

const pool = new Pool({ connectionString: process.env.DATABASE_URL!, ssl: { rejectUnauthorized: false } })

async function main() {
  const client = await pool.connect()
  try {
    console.log("Creating tables...")
    await client.query(`
      CREATE TABLE IF NOT EXISTS field (
        id SERIAL PRIMARY KEY, name TEXT NOT NULL, latitude REAL NOT NULL, longitude REAL NOT NULL,
        area_mu REAL, variety TEXT, planting_date TEXT,
        region TEXT NOT NULL DEFAULT 'xilinhaote',
        created_at TIMESTAMP DEFAULT NOW()
      );
      ALTER TABLE field ADD COLUMN IF NOT EXISTS region TEXT NOT NULL DEFAULT 'xilinhaote';
      ALTER TABLE field ADD COLUMN IF NOT EXISTS province TEXT;
      ALTER TABLE field ADD COLUMN IF NOT EXISTS city TEXT;
      ALTER TABLE field ADD COLUMN IF NOT EXISTS county TEXT;
      ALTER TABLE field ADD COLUMN IF NOT EXISTS township TEXT;
      ALTER TABLE field ADD COLUMN IF NOT EXISTS admin_code TEXT;
      ALTER TABLE field ADD COLUMN IF NOT EXISTS address TEXT;
      CREATE TABLE IF NOT EXISTS daily_weather (
        id SERIAL PRIMARY KEY, field_id INTEGER NOT NULL REFERENCES field(id) ON DELETE CASCADE,
        date TEXT NOT NULL, temp_max REAL, temp_min REAL, temp_mean REAL, precipitation REAL,
        wind_speed_max REAL, humidity REAL, weather_code INTEGER,
        wind_gust REAL, soil_temp REAL,
        UNIQUE(field_id, date)
      );
      ALTER TABLE daily_weather ADD COLUMN IF NOT EXISTS wind_gust REAL;
      ALTER TABLE daily_weather ADD COLUMN IF NOT EXISTS soil_temp REAL;
      CREATE TABLE IF NOT EXISTS weather_forecast (
        id SERIAL PRIMARY KEY, field_id INTEGER NOT NULL REFERENCES field(id) ON DELETE CASCADE,
        date TEXT NOT NULL, temp_max REAL, temp_min REAL, temp_mean REAL, precipitation REAL,
        wind_speed_max REAL, humidity REAL, weather_code INTEGER,
        wind_gust REAL, soil_temp REAL,
        fetched_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(field_id, date)
      );
      CREATE TABLE IF NOT EXISTS weather_forecast_history (
        id SERIAL PRIMARY KEY,
        field_id INTEGER NOT NULL REFERENCES field(id) ON DELETE CASCADE,
        forecast_run_at TIMESTAMP NOT NULL,
        forecast_date TEXT NOT NULL,
        lead_days INTEGER NOT NULL,
        temp_max REAL,
        temp_min REAL,
        temp_mean REAL,
        precipitation REAL,
        wind_speed_max REAL,
        humidity REAL,
        weather_code INTEGER,
        wind_gust REAL,
        soil_temp REAL,
        provider TEXT NOT NULL DEFAULT 'openmeteo',
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(field_id, forecast_run_at, forecast_date)
      );
      CREATE INDEX IF NOT EXISTS idx_weather_forecast_history_field_date ON weather_forecast_history(field_id, forecast_date);
      CREATE INDEX IF NOT EXISTS idx_weather_forecast_history_run ON weather_forecast_history(forecast_run_at);
      ALTER TABLE weather_forecast ADD COLUMN IF NOT EXISTS wind_gust REAL;
      ALTER TABLE weather_forecast ADD COLUMN IF NOT EXISTS soil_temp REAL;
      CREATE TABLE IF NOT EXISTS alert (
        id SERIAL PRIMARY KEY, field_id INTEGER NOT NULL REFERENCES field(id) ON DELETE CASCADE,
        date TEXT NOT NULL, type TEXT NOT NULL, severity TEXT NOT NULL, title TEXT NOT NULL,
        description TEXT, emergency_plan TEXT, start_date TEXT, end_date TEXT, stage TEXT
      );
      CREATE TABLE IF NOT EXISTS alert_threshold (
        id SERIAL PRIMARY KEY, alert_type TEXT NOT NULL, stage TEXT, label TEXT NOT NULL,
        yellow_condition TEXT NOT NULL, orange_condition TEXT NOT NULL, red_condition TEXT NOT NULL,
        reference_source TEXT, reference_note TEXT
      );
      CREATE UNIQUE INDEX IF NOT EXISTS alert_threshold_alert_type_stage_unique
        ON alert_threshold (alert_type, COALESCE(stage, '__default__'));
      CREATE TABLE IF NOT EXISTS daily_farming_alert (
        id SERIAL PRIMARY KEY,
        county_code TEXT NOT NULL,
        county_name TEXT NOT NULL,
        date TEXT NOT NULL,
        stage TEXT,
        focus TEXT,
        signals_json TEXT,
        draft_content TEXT NOT NULL,
        draft_model TEXT,
        draft_prompt_hash TEXT,
        final_content TEXT,
        status TEXT NOT NULL DEFAULT 'draft',
        reviewed_by TEXT,
        reviewed_at TIMESTAMP,
        published_at TIMESTAMP,
        archived_month TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(county_code, date)
      );
      CREATE TABLE IF NOT EXISTS kb_document (
        id SERIAL PRIMARY KEY,
        s3_key TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        content_type TEXT,
        size_bytes INTEGER,
        uploaded_by TEXT NOT NULL,
        uploaded_at TIMESTAMP DEFAULT NOW(),
        deleted_at TIMESTAMP,
        last_ingestion_job_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_kb_document_s3_key ON kb_document (s3_key);
      CREATE TABLE IF NOT EXISTS historical_monthly (
        id SERIAL PRIMARY KEY, region TEXT NOT NULL, month INTEGER NOT NULL,
        avg_temp_max REAL, avg_temp_min REAL, avg_temp_mean REAL, avg_precipitation REAL,
        avg_wind_speed_max REAL, avg_humidity REAL,
        UNIQUE(region, month)
      );
      -- Deduplicate existing rows and add unique constraint if missing
      DELETE FROM historical_monthly WHERE id NOT IN (SELECT MAX(id) FROM historical_monthly GROUP BY region, month);
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'historical_monthly_region_month_key') THEN
          ALTER TABLE historical_monthly ADD CONSTRAINT historical_monthly_region_month_key UNIQUE (region, month);
        END IF;
      END $$;
      CREATE TABLE IF NOT EXISTS "user" (
        id SERIAL PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'farmer', is_active BOOLEAN NOT NULL DEFAULT true,
        must_change_password BOOLEAN NOT NULL DEFAULT true, last_login_at TIMESTAMP,
        password_expires_at TIMESTAMP, failed_login_count INTEGER DEFAULT 0,
        locked_until TIMESTAMP, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY, user_id INTEGER, username TEXT NOT NULL, action TEXT NOT NULL,
        target_type TEXT, target_id INTEGER, detail TEXT, ip TEXT, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS password_history (
        id SERIAL PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        password_hash TEXT NOT NULL, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS farming_advice_record (
        id SERIAL PRIMARY KEY, field_id INTEGER NOT NULL REFERENCES field(id) ON DELETE CASCADE,
        week_start TEXT NOT NULL, week_end TEXT NOT NULL, growth_stage TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'auto', summary TEXT, fertilizer TEXT, pesticide TEXT,
        irrigation TEXT, field_work TEXT, ai_model TEXT, ai_prompt_hash TEXT,
        reviewed_by TEXT, reviewed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(field_id, week_start)
      );
      CREATE TABLE IF NOT EXISTS agent_session (
        id SERIAL PRIMARY KEY, session_id TEXT NOT NULL UNIQUE,
        user_id INTEGER REFERENCES "user"(id), field_id INTEGER REFERENCES field(id),
        created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS agent_message (
        id SERIAL PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
        agent_name TEXT, tokens_used INTEGER, latency_ms INTEGER, created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_agent_message_session_created
        ON agent_message (session_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS cron_run (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        status TEXT NOT NULL DEFAULT 'running',
        error TEXT,
        items_processed INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_cron_run_name_started ON cron_run (name, started_at DESC);
      CREATE TABLE IF NOT EXISTS refresh_token (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        expires_at TIMESTAMP NOT NULL,
        revoked_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_token_user ON refresh_token (user_id);
      CREATE TABLE IF NOT EXISTS rate_limit_bucket (
        bucket_key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rate_limit_bucket_reset_at ON rate_limit_bucket (reset_at);
    `)
    console.log("Tables created.")

    // Seed data — only when field table is empty (idempotent across reruns).
    // ON CONFLICT DO NOTHING here is a no-op because there's no UNIQUE on name,
    // so we explicitly guard with NOT EXISTS to avoid re-seeding duplicates.
    console.log("Seeding fields...")
    await client.query(`
      INSERT INTO field (name, latitude, longitude, area_mu, variety, planting_date, province, city, county, township, admin_code)
      SELECT * FROM (VALUES
        ('东岭一号田', 43.95::real, 116.07::real, 150::real, '荷兰15号', '2026-04-25', '内蒙古自治区', '锡林郭勒盟', '锡林浩特市', '希日塔拉街道', '152502'),
        ('西坡试验田', 43.93::real, 116.05::real, 80::real,  '克新1号',  '2026-04-20', '内蒙古自治区', '锡林郭勒盟', '锡林浩特市', '宝力根街道',   '152502'),
        ('河谷大田',   43.97::real, 116.10::real, 200::real, '荷兰15号', '2026-04-28', '内蒙古自治区', '锡林郭勒盟', '锡林浩特市', '楚古兰街道',   '152502')
      ) AS seed(name, latitude, longitude, area_mu, variety, planting_date, province, city, county, township, admin_code)
      WHERE NOT EXISTS (SELECT 1 FROM field);
    `)

    // Seed admin user
    const adminHash = await hash("admin123", 10)
    const expires = new Date(); expires.setDate(expires.getDate() + 90)
    await client.query(`
      INSERT INTO "user" (username, password_hash, role, must_change_password, password_expires_at) VALUES
        ('admin', $1, 'admin', false, $2)
      ON CONFLICT (username) DO NOTHING;
    `, [adminHash, expires])

    // Seed alert thresholds
    await client.query(`
      INSERT INTO alert_threshold (alert_type, stage, label, yellow_condition, orange_condition, red_condition, reference_source, reference_note) VALUES
        ('frost', NULL, '霜冻', '{"match_mode":"all","temp_min_lte":5,"temp_min_lte_days_gte":3}', '{"match_mode":"all","temp_min_lte":2,"temp_min_lte_days_gte":4}', '{"match_mode":"all","temp_min_lte":1,"temp_min_lte_days_gte":5}', 'DB15/T 4315-2026 表2 霜冻', '按持续日数下限折算为连续预报天数'),
        ('heavy_rain', NULL, '洪涝', '{"precip_3d_gte":200}', '{"precip_3d_gte":250}', '{"precip_3d_gte":300}', 'DB15/T 4315-2026 表2 洪涝', '3日累计降水量'),
        ('strong_wind', NULL, '风灾', '{"wind_gte":50}', '{"wind_gte":62}', '{"wind_gte":103}', 'DB15/T 4315-2026 表2 风灾', '按日最大风力7级/8级/11级近似换算为km/h'),
        ('dry_hot_wind', NULL, '干热风', '{"match_mode":"all","temp_max_gte":30,"humidity_lte":30,"wind_gte":10.8}', '{"match_mode":"all","temp_max_gte":33,"humidity_lte":25,"wind_gte":14.4}', '{"temp_max_gte":999}', 'DB15/T 4315-2026 表2 干热风', '风速由m/s换算为km/h；标准仅轻度/重度两级，红色禁用'),
        ('heat', NULL, '高温', '{"temp_max_gte":30}', '{"temp_max_gte":999}', '{"temp_max_gte":999}', 'FAO Crop Information: Potato', 'FAO指出块茎生长在>30℃明显受抑制；公开资料未给三色分级，橙/红禁用')
      ON CONFLICT DO NOTHING;
    `)

    // Seed historical monthly data for xilinhaote
    await client.query(`
      INSERT INTO historical_monthly (region, month, avg_temp_max, avg_temp_min, avg_temp_mean, avg_precipitation) VALUES
        ('xilinhaote', 1, -11.2, -23.5, -17.4, 2.1), ('xilinhaote', 2, -7.1, -20.2, -13.7, 3.2),
        ('xilinhaote', 3, 1.8, -11.5, -4.9, 5.8), ('xilinhaote', 4, 12.5, -2.1, 5.2, 12.3),
        ('xilinhaote', 5, 21.3, 5.8, 13.6, 28.5), ('xilinhaote', 6, 26.1, 11.2, 18.7, 52.3),
        ('xilinhaote', 7, 27.8, 14.1, 21.0, 78.6), ('xilinhaote', 8, 25.9, 12.3, 19.1, 65.2),
        ('xilinhaote', 9, 20.1, 4.8, 12.5, 32.1), ('xilinhaote', 10, 11.2, -4.2, 3.5, 12.8),
        ('xilinhaote', 11, -0.5, -14.8, -7.7, 5.2), ('xilinhaote', 12, -9.1, -21.8, -15.5, 2.5)
      ON CONFLICT (region, month) DO UPDATE SET
        avg_temp_max = EXCLUDED.avg_temp_max, avg_temp_min = EXCLUDED.avg_temp_min,
        avg_temp_mean = EXCLUDED.avg_temp_mean, avg_precipitation = EXCLUDED.avg_precipitation;
    `)

    // Eval tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS eval_case (
        id SERIAL PRIMARY KEY,
        input TEXT NOT NULL UNIQUE,
        field_id INTEGER DEFAULT 1,
        expected_signals TEXT NOT NULL,
        category TEXT NOT NULL,
        critical BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS eval_run (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMP,
        total INTEGER NOT NULL DEFAULT 0,
        passed INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        critical_failed INTEGER NOT NULL DEFAULT 0,
        avg_latency_ms INTEGER,
        p95_latency_ms INTEGER,
        results_json TEXT
      );
    `)
    console.log("Eval tables created.")

    // Seed eval cases
    await client.query(`
      INSERT INTO eval_case (input, category, expected_signals, critical) VALUES
        ('你好', 'greeting', '["你好","助手","帮"]', false),
        ('早上好', 'greeting', '["你好","助手"]', false),
        ('hello', 'greeting', '["你好","助手","帮"]', false),
        ('天气怎么样', 'weather', '["温度","天气","℃"]', true),
        ('未来一周降水情况', 'weather', '["降水","毫米","mm"]', true),
        ('温度趋势分析', 'weather', '["温度","趋势","℃"]', false),
        ('和历史同期对比怎么样', 'weather', '["历史","对比","平均"]', false),
        ('施肥建议', 'farming', '["施肥","肥料","建议"]', true),
        ('病虫害防治措施', 'farming', '["病虫害","防治","喷"]', false),
        ('灌溉建议', 'farming', '["灌溉","水","浇"]', false),
        ('本周农事管理建议', 'farming', '["农事","管理","建议","本周"]', true),
        ('霜冻风险评估', 'alert', '["霜冻","温度","风险"]', true),
        ('暴雨预警分析', 'alert', '["暴雨","降水","预警"]', false),
        ('大风预警', 'alert', '["大风","风速","预警"]', false),
        ('综合风险评估', 'alert', '["风险","预警","评估"]', false)
      ON CONFLICT DO NOTHING;
    `)
    console.log("Eval seed data inserted.")

    console.log("Seed data inserted.")
    console.log("Done!")
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
