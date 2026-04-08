export const PRESETS = [
    "Write a quick-start guide for building a REST API with Express.js",
    "Compare Python and Rust in a table with pros and cons",
    "Explain the merge sort algorithm with code examples",
];

export const SERVER_PORT = 3000;

export const SERVER_URL = `http://localhost:${SERVER_PORT}`;

export const ASSISTANT_ID = "tool_calling_agent";

export enum MessageTypeEnum {
    HUMAN = "human",
    AI = "ai",
    TOOL = "tool",
    SYSTEM = 'system'
}
