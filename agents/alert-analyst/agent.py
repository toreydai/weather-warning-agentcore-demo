"""alert-analyst: 农业气象预警 Agent (GLM-4.7-flash)"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from shared.db_tools import query_field, query_weather, query_forecast, query_alerts, query_thresholds

app = BedrockAgentCoreApp()

SYSTEM = """你是农业气象预警专家。根据数据和阈值识别风险。
默认阈值:霜冻黄≤2°C橙≤0°C红≤-3°C,暴雨黄≥20mm橙≥30mm红≥50mm,大风黄≥40橙≥55红≥70km/h,高温黄≥33橙≥35红≥38°C。
有数据库阈值则优先用。中文回复，简明扼要。"""

_agent = None

def get_agent():
    global _agent
    if _agent is None:
        model = BedrockModel(model_id="zai.glm-4.7-flash", region_name="us-east-1")
        _agent = Agent(model=model, system_prompt=SYSTEM,
                       tools=[query_field, query_weather, query_forecast, query_alerts, query_thresholds])
    return _agent


@app.entrypoint
def invoke(payload):
    message = payload.get("prompt", "")
    field_id = payload.get("field_id")
    task = f"(地块ID:{field_id}) {message}" if field_id else message
    result = get_agent()(task)
    return {"result": str(result.message)}


if __name__ == "__main__":
    app.run()
