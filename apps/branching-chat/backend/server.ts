import { SERVER_PORT } from "@common/constants";
import { createBackendApp } from "./app.js";

const app = createBackendApp();

app.listen(SERVER_PORT, () => {
    console.log(`\n🚀 LangGraph Agent 服务已启动: http://localhost:${SERVER_PORT}\n`);
});
