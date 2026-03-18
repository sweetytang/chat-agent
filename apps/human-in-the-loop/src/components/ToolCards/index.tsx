/**
 * ToolCards/index.tsx — 工具卡片统一入口
 * 根据工具名称自动分发到对应的专用卡片组件。
 */
import React from "react";
import { LoadingCard } from "./LoadingCard";
import { ErrorCard } from "./ErrorCard";
import { WeatherCard } from "./WeatherCard";
import { CalculatorCard } from "./CalculatorCard";
import { SearchCard } from "./SearchCard";
import { GenericToolCard } from "./GenericToolCard";

// 统一导出所有子组件，方便外部按需引用
export { LoadingCard, ErrorCard, WeatherCard, CalculatorCard, SearchCard, GenericToolCard };

/**
 * ToolCard — 工具调用卡片路由组件
 * 根据 toolCall 的状态和名称，自动选择合适的展示卡片
 */
export function ToolCard({ toolCall }: { toolCall: any }) {
    if (toolCall.state === "pending") {
        return <LoadingCard name={toolCall.call.name} />;
    }
    if (toolCall.state === "error") {
        return <ErrorCard name={toolCall.call.name} error={toolCall.result} />;
    }

    switch (toolCall.call.name) {
        case "get_weather":
            return <WeatherCard args={toolCall.call.args as any} result={toolCall.result} />;
        case "calculator":
            return <CalculatorCard args={toolCall.call.args as any} result={toolCall.result} />;
        case "web_search":
            return <SearchCard args={toolCall.call.args as any} result={toolCall.result} />;
        default:
            return <GenericToolCard toolCall={toolCall} />;
    }
}
