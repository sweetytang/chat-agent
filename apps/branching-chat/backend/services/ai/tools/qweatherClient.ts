import { fetchCurrentQWeather, fetchForecastQWeather, GetWeatherInput, QWeatherLocation } from "./qweatherApi.js";

function toOptionalNumber(value?: string | null) {
    if (value === undefined || value === null || value === "") {
        return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatResolvedLocation(location: QWeatherLocation) {
    const parts = [location.name, location.adm2, location.adm1, location.country].filter(Boolean) as string[];
    return [...new Set(parts)].join(", ");
}

export async function getCurrentWeather(input: GetWeatherInput) {
    const { matchedLocation, matchCount, locationRefer, weather } = await fetchCurrentQWeather(input);

    const current = weather.now;
    if (!current) {
        throw new Error(`QWeather returned no current weather for "${input.location}"`);
    }

    return {
        source: "QWeather",
        locationQuery: input.location,
        locationName: matchedLocation.name,
        resolvedLocation: formatResolvedLocation(matchedLocation),
        locationId: matchedLocation.id,
        latitude: toOptionalNumber(matchedLocation.lat),
        longitude: toOptionalNumber(matchedLocation.lon),
        timezone: matchedLocation.tz ?? null,
        condition: current.text ?? "Unknown",
        iconCode: current.icon ?? null,
        temperature: toOptionalNumber(current.temp),
        temperatureUnit: "Celsius",
        temperatureSymbol: "°C",
        feelsLike: toOptionalNumber(current.feelsLike),
        humidity: toOptionalNumber(current.humidity),
        windDirection: current.windDir ?? null,
        windScale: current.windScale ?? null,
        windSpeed: toOptionalNumber(current.windSpeed),
        windSpeedUnit: "km/h",
        pressure: toOptionalNumber(current.pressure),
        pressureUnit: "hPa",
        visibility: toOptionalNumber(current.vis),
        visibilityUnit: "km",
        precipitation: toOptionalNumber(current.precip),
        cloudCover: toOptionalNumber(current.cloud),
        dewPoint: toOptionalNumber(current.dew),
        observedAt: current.obsTime ?? null,
        updatedAt: weather.updateTime ?? null,
        fxLink: weather.fxLink ?? matchedLocation.fxLink ?? null,
        ambiguityNote: matchCount > 1
            ? `Matched the top QWeather location for "${input.location}". Add adm or range to narrow ambiguous city names.`
            : null,
        refer: weather.refer ?? locationRefer ?? null,
    };
}

export async function getForecastWeather(input: GetWeatherInput) {
    const dayOffset = input.dayOffset ?? 1;
    const { matchedLocation, matchCount, locationRefer, weather } = await fetchForecastQWeather(input);
    const forecast = weather.daily?.[dayOffset];

    if (!forecast) {
        throw new Error(`QWeather returned no daily forecast for day offset ${dayOffset} at "${input.location}"`);
    }

    return {
        source: "QWeather",
        mode: "forecast",
        dayOffset,
        locationQuery: input.location,
        locationName: matchedLocation.name,
        resolvedLocation: formatResolvedLocation(matchedLocation),
        locationId: matchedLocation.id,
        forecastDate: forecast.fxDate ?? null,
        conditionDay: forecast.textDay ?? "Unknown",
        conditionNight: forecast.textNight ?? null,
        iconDay: forecast.iconDay ?? null,
        iconNight: forecast.iconNight ?? null,
        temperatureMin: toOptionalNumber(forecast.tempMin),
        temperatureMax: toOptionalNumber(forecast.tempMax),
        temperatureUnit: "Celsius",
        temperatureSymbol: "°C",
        humidity: toOptionalNumber(forecast.humidity),
        precipitation: toOptionalNumber(forecast.precip),
        pressure: toOptionalNumber(forecast.pressure),
        visibility: toOptionalNumber(forecast.vis),
        cloudCover: toOptionalNumber(forecast.cloud),
        uvIndex: toOptionalNumber(forecast.uvIndex),
        windDirectionDay: forecast.windDirDay ?? null,
        windScaleDay: forecast.windScaleDay ?? null,
        windSpeedDay: toOptionalNumber(forecast.windSpeedDay),
        windDirectionNight: forecast.windDirNight ?? null,
        windScaleNight: forecast.windScaleNight ?? null,
        windSpeedNight: toOptionalNumber(forecast.windSpeedNight),
        sunrise: forecast.sunrise ?? null,
        sunset: forecast.sunset ?? null,
        updatedAt: weather.updateTime ?? null,
        fxLink: weather.fxLink ?? matchedLocation.fxLink ?? null,
        ambiguityNote: matchCount > 1
            ? `Matched the top QWeather location for "${input.location}". Add adm or range to narrow ambiguous city names.`
            : null,
        refer: weather.refer ?? locationRefer ?? null,
    };
}
