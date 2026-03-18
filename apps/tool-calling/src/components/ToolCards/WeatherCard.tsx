/**
 * WeatherCard — 天气查询结果展示卡片
 */
import React from "react";
import styles from "./index.module.scss";
import { LoadingCard } from "./LoadingCard";
import { ErrorCard } from "./ErrorCard";

/** 根据天气状况返回对应 emoji */
function getWeatherEmoji(condition: string): string {
    switch (condition) {
        case "Sunny": return "☀️";
        case "Cloudy": return "☁️";
        case "Raining": return "🌧️";
        case "Snowing": return "❄️";
        default: return "🌤️";
    }
}

export function WeatherCard({ args, result }: { args: { location: string }; result?: any }) {
    if (!result || !result.content) return <LoadingCard name="get_weather" />;

    let data;
    try {
        data = JSON.parse(result.content as string);
    } catch {
        return <ErrorCard name="get_weather" error={{ content: "Failed to parse result" }} />;
    }

    return (
        <div className={styles.weatherCard}>
            <div className={styles.weatherHeader}>
                <div>
                    <h3 className={styles.weatherLabel}>Current Weather</h3>
                    <div className={styles.weatherLocation}>{args.location}</div>
                </div>
                <span className={styles.weatherIcon}>{getWeatherEmoji(data.condition)}</span>
            </div>
            <div className={styles.weatherTempRow}>
                <div className={styles.weatherTemp}>{data.temperature}°</div>
                <div className={styles.weatherUnit}>Fahrenheit</div>
            </div>
            <p className={styles.weatherCondition}>{data.condition}</p>
        </div>
    );
}
