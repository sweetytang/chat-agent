/**
 * ToolCards/index.tsx — 工具卡片统一入口
 * 根据工具名称自动分发到对应的专用卡片组件。
 */
import React from "react";
import CollapsibleBox from "@frontend/components/CollapsibleBox";
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
    let content: React.ReactNode;

    if (toolCall.state === "pending") {
        content = <LoadingCard name={toolCall.call.name} />;
    } else if (toolCall.state === "error") {
        content = <ErrorCard name={toolCall.call.name} error={toolCall.result} />;
    } else {
        switch (toolCall.call.name) {
            case "get_weather":
                content = <WeatherCard args={toolCall.call.args as any} result={toolCall.result} />;
                break;
            case "calculator":
                content = <CalculatorCard args={toolCall.call.args as any} result={toolCall.result} />;
                break;
            case "web_search":
                content = <SearchCard args={toolCall.call.args as any} result={toolCall.result} />;
                break;
            default:
                content = <GenericToolCard toolCall={toolCall} />;
                break;
        }
    }

    return (
        <CollapsibleBox
            collapseKey={`tool-${toolCall.id ?? toolCall.call?.id ?? toolCall.call?.name}`}
            maxCollapsedHeight={300}
            expandLabel="展开工具卡片"
            collapseLabel="收起工具卡片"
        >
            {content}
        </CollapsibleBox>
    );
}
