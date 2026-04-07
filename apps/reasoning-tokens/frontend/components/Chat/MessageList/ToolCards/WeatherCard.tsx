/**
 * WeatherCard — 天气查询结果展示卡片
 */
import React from "react";
import styles from "./index.module.scss";
import { LoadingCard } from "./LoadingCard";
import { ErrorCard } from "./ErrorCard";

/** 根据天气状况返回对应 emoji */
function getWeatherEmoji(condition?: string): string {
    const text = condition?.toLowerCase() ?? "";

    if (text.includes("thunder") || condition?.includes("雷")) return "⛈️";
    if (text.includes("snow") || condition?.includes("雪")) return "❄️";
    if (text.includes("rain") || condition?.includes("雨")) return "🌧️";
    if (text.includes("fog") || condition?.includes("雾") || condition?.includes("霾")) return "🌫️";
    if (text.includes("cloud") || condition?.includes("云") || condition?.includes("阴")) return "☁️";
    if (text.includes("sun") || text.includes("clear") || condition?.includes("晴")) return "☀️";

    return "🌤️";
}

function formatObservedTime(value?: string | null) {
    if (!value) {
        return null;
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return new Intl.DateTimeFormat("zh-CN", {
        dateStyle: "medium",
        timeStyle: "short",
    }).format(date);
}

function formatMetric(value: number | null | undefined, unit?: string) {
    if (value === null || value === undefined) {
        return "--";
    }

    return unit ? `${value} ${unit}` : `${value}`;
}

export function WeatherCard({ args, result }: { args: { location: string }; result?: any }) {
    if (!result || !result.content) return <LoadingCard name="get_weather" />;

    let data;
    try {
        data = JSON.parse(result.content as string);
    } catch {
        if (typeof result.content === "string" && result.content.startsWith("Error:")) {
            return <ErrorCard name="get_weather" error={{ content: result.content }} />;
        }
        return <ErrorCard name="get_weather" error={{ content: "Failed to parse weather result" }} />;
    }

    if (data?.error) {
        return <ErrorCard name="get_weather" error={{ content: data.error }} />;
    }

    const locationTitle = data.locationName || args.location;
    const resolvedLocation = data.resolvedLocation && data.resolvedLocation !== locationTitle
        ? data.resolvedLocation
        : null;
    const observedAt = formatObservedTime(data.observedAt || data.updatedAt);
    const hasFeelsLike = data.feelsLike !== null && data.feelsLike !== undefined;
    const hasWindSpeed = data.windSpeed !== null && data.windSpeed !== undefined;

    return (
        <div className={styles.weatherCard}>
            <div className={styles.weatherHeader}>
                <div>
                    <div className={styles.weatherEyebrow}>
                        <h3 className={styles.weatherLabel}>Real-time Weather</h3>
                        <span className={styles.weatherSourceBadge}>{data.source || "QWeather"}</span>
                    </div>
                    <div className={styles.weatherLocation}>{locationTitle}</div>
                    {resolvedLocation && <div className={styles.weatherResolvedLocation}>{resolvedLocation}</div>}
                </div>
                <span className={styles.weatherIcon}>{getWeatherEmoji(data.condition)}</span>
            </div>
            <div className={styles.weatherTempRow}>
                <div className={styles.weatherTemp}>
                    {data.temperature ?? "--"}
                    {data.temperatureSymbol ?? "°C"}
                </div>
                <div className={styles.weatherUnit}>{data.temperatureUnit ?? "Celsius"}</div>
            </div>
            <p className={styles.weatherCondition}>{data.condition}</p>
            {(hasFeelsLike || observedAt) && (
                <div className={styles.weatherSummary}>
                    {hasFeelsLike && <span>体感 {data.feelsLike}{data.temperatureSymbol ?? "°C"}</span>}
                    {observedAt && <span>观测时间 {observedAt}</span>}
                </div>
            )}
            <div className={styles.weatherDetailsGrid}>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Humidity</div>
                    <div className={styles.weatherMetricValue}>
                        {data.humidity === null || data.humidity === undefined ? "--" : `${data.humidity}%`}
                    </div>
                </div>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Wind</div>
                    <div className={styles.weatherMetricValue}>
                        {data.windDirection || "--"}
                        {hasWindSpeed ? ` ${data.windSpeed} ${data.windSpeedUnit ?? ""}` : ""}
                    </div>
                </div>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Pressure</div>
                    <div className={styles.weatherMetricValue}>{formatMetric(data.pressure, data.pressureUnit)}</div>
                </div>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Visibility</div>
                    <div className={styles.weatherMetricValue}>{formatMetric(data.visibility, data.visibilityUnit)}</div>
                </div>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Precip (1h)</div>
                    <div className={styles.weatherMetricValue}>{formatMetric(data.precipitation)}</div>
                </div>
                <div className={styles.weatherMetric}>
                    <div className={styles.weatherMetricLabel}>Location ID</div>
                    <div className={styles.weatherMetricValue}>{data.locationId ?? "--"}</div>
                </div>
            </div>
            {data.ambiguityNote && (
                <div className={styles.weatherHint}>{data.ambiguityNote}</div>
            )}
            {data.fxLink && (
                <a
                    className={styles.weatherLink}
                    href={data.fxLink}
                    target="_blank"
                    rel="noreferrer"
                >
                    在和风天气查看完整页面
                </a>
            )}
        </div>
    );
}
