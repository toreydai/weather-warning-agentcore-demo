"""weather-analyst: 气象分析 Agent (GLM-4.7-flash)"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from shared.db_tools import query_field, query_weather, query_forecast, query_historical_monthly

app = BedrockAgentCoreApp()

SYSTEM = """你是锡林浩特气象分析专家。根据数据分析趋势，评估对马铃薯的影响。
中温带半干旱气候，年均温1.7°C，无霜期110天(5月中-9月初)，年降水300mm。
中文回复，数据具体。"""

_agent = None

def get_agent():
    global _agent
    if _agent is None:
        model = BedrockModel(model_id="zai.glm-4.7-flash", region_name="us-east-1")
        _agent = Agent(model=model, system_prompt=SYSTEM,
                       tools=[query_field, query_weather, query_forecast, query_historical_monthly])
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
