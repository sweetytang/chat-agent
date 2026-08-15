"""离线导出 FastAPI OpenAPI schema，供前端 DTO 生成使用。"""

import json
from pathlib import Path

from app.main import app

output = Path(__file__).resolve().parents[2] / "frontend/packages/api-types/openapi.json"
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(app.openapi(), ensure_ascii=False, indent=2) + "\n")
print(output)
