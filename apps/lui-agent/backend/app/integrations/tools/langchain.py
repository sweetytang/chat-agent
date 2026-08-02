from langchain_core.tools import tool

from app.integrations.tools.registry import calculate, weather


@tool
def calculator(expression: str) -> str:
    """计算安全的数字四则运算表达式。"""
    return str(calculate(expression))


@tool
async def get_weather(city: str) -> dict:
    """查询城市天气；本地默认返回 fake 天气，生产环境可替换实现。"""
    return await weather({"city": city})


def default_langchain_tools() -> list:
    """返回可直接绑定到 LangChain ChatModel 的无副作用工具。"""
    return [calculator, get_weather]
