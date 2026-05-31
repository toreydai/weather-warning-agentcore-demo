"""farming-advisor-fast: 常规农事建议 Agent (GLM-4.7-flash)"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent
from strands.models import BedrockModel
from shared.db_tools import query_field, query_weather, query_forecast

app = BedrockAgentCoreApp()

SYSTEM = """你是马铃薯种植专家。根据气象和生长阶段给建议。
阶段(播后天数):0-9催芽,10-19播种,20-34播后管理,35-49出苗,50-64苗期,
65-77现蕾,78-91开花,92-112膨大,113-127淀粉积累,128-142成熟,143-154收获。
药剂用量具体。中文回复。"""

_agent = None

def get_agent():
    global _agent
    if _agent is None:
        model = BedrockModel(model_id="zai.glm-4.7-flash", region_name="us-east-1")
        _agent = Agent(model=model, system_prompt=SYSTEM, tools=[query_field, query_weather, query_forecast])
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
