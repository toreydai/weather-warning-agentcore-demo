"""farming-advisor-deep: 病虫害 + KB Agent (Qwen3-32b)"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from bedrock_agentcore import BedrockAgentCoreApp
from strands import Agent, tool
from strands.models import BedrockModel
from shared.db_tools import query_field, query_weather, query_forecast
import boto3

app = BedrockAgentCoreApp()

KB_ID = os.environ.get("KNOWLEDGE_BASE_ID", "R8OK5B4VRA")
kb_client = boto3.client("bedrock-agent-runtime", region_name="us-east-1")


@tool
def search_knowledge_base(query: str) -> list[str]:
    """在马铃薯病虫害知识库中检索相关专业资料"""
    resp = kb_client.retrieve(
        knowledgeBaseId=KB_ID,
        retrievalQuery={"text": query},
        retrievalConfiguration={"vectorSearchConfiguration": {"numberOfResults": 2}},
    )
    return [r["content"]["text"] for r in resp.get("retrievalResults", [])]


SYSTEM = """你是马铃薯种植专家，尤其擅长病虫害诊断与防治。
根据气象和生长阶段给建议。涉及病虫害时必须先调 search_knowledge_base 获取专业资料。
阶段(播后天数):0-9催芽,10-19播种,20-34播后管理,35-49出苗,50-64苗期,
65-77现蕾,78-91开花,92-112膨大,113-127淀粉积累,128-142成熟,143-154收获。
药剂名称和用量必须具体准确。中文回复。"""

_agent = None

def extract_text(message) -> str:
    """Normalize Strands/Bedrock message objects to plain assistant text."""
    if isinstance(message, str):
        return message
    if isinstance(message, dict):
        content = message.get("content")
        if isinstance(content, list):
            texts = []
            for item in content:
                if isinstance(item, dict) and isinstance(item.get("text"), str):
                    texts.append(item["text"])
            if texts:
                return "\n".join(texts)
        if isinstance(content, str):
            return content
        text = message.get("text")
        if isinstance(text, str):
            return text
    return str(message)

def get_agent():
    global _agent
    if _agent is None:
        model = BedrockModel(model_id="qwen.qwen3-32b-v1:0", region_name="us-east-1")
        _agent = Agent(model=model, system_prompt=SYSTEM,
                       tools=[query_field, query_weather, query_forecast, search_knowledge_base])
    return _agent


@app.entrypoint
def invoke(payload):
    message = payload.get("prompt", "")
    field_id = payload.get("field_id")
    history = payload.get("history", []) or []

    agent = get_agent()
    agent.messages = []

    parts = []
    if history:
        parts.append("以下是之前的对话历史，作为上下文参考：")
        for h in history:
            role = "用户" if h.get("role") == "user" else "助手"
            parts.append(f"{role}: {h.get('content', '')}")
        parts.append("")
        parts.append("当前问题：")
    body = f"(地块ID:{field_id}) {message}" if field_id else message
    task = "\n".join(parts + [body]) if parts else body

    result = agent(task)
    return {"result": extract_text(result.message)}


if __name__ == "__main__":
    app.run()
