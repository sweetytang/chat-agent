export type GetWeatherInput = {
    location: string;
    adm?: string;
    range?: string;
    lang?: string;
};

export type QWeatherLocation = {
    name: string;
    id: string;
    lat?: string;
    lon?: string;
    adm1?: string;
    adm2?: string;
    country?: string;
    tz?: string;
    fxLink?: string;
};

type QWeatherLookupResponse = {
    code: string;
    location?: QWeatherLocation[];
    refer?: {
        sources?: string[];
        license?: string[];
    };
};

type QWeatherNowResponse = {
    code: string;
    updateTime?: string;
    fxLink?: string;
    now?: {
        obsTime?: string;
        temp?: string;
        feelsLike?: string;
        icon?: string;
        text?: string;
        windDir?: string;
        windScale?: string;
        windSpeed?: string;
        humidity?: string;
        precip?: string;
        pressure?: string;
        vis?: string;
        cloud?: string;
        dew?: string;
    };
    refer?: {
        sources?: string[];
        license?: string[];
    };
};

function getQWeatherApiHost() {
    const apiHost = process.env.QWEATHER_API_HOST?.trim();
    if (!apiHost) {
        throw new Error("Missing QWEATHER_API_HOST in .env");
    }

    const url = /^https?:\/\//i.test(apiHost) ? apiHost : `https://${apiHost}`;
    return url.replace(/\/+$/, "");
}

function getQWeatherApiKey() {
    const apiKey = process.env.QWEATHER_API_KEY?.trim();
    if (!apiKey) {
        throw new Error("Missing QWEATHER_API_KEY in .env");
    }

    return apiKey;
}

async function requestQWeather<T>(pathname: string, params: Record<string, string | undefined>): Promise<T> {
    const url = new URL(pathname, getQWeatherApiHost());

    Object.entries(params).forEach(([key, value]) => {
        if (value) {
            url.searchParams.set(key, value);
        }
    });

    const response = await fetch(url.toString(), {
        headers: {
            Accept: "application/json",
            "X-QW-Api-Key": getQWeatherApiKey(),
        },
    });

    const raw = await response.text();

    let data: any = {};
    try {
        data = raw ? JSON.parse(raw) : {};
    } catch {
        throw new Error(`QWeather returned a non-JSON response (HTTP ${response.status})`);
    }

    if (!response.ok) {
        throw new Error(`QWeather request failed with HTTP ${response.status}${data?.code ? ` (code ${data.code})` : ""}`);
    }

    if (data?.code && data.code !== "200") {
        throw new Error(`QWeather API returned code ${data.code}`);
    }

    return data as T;
}

export async function fetchCurrentQWeather(input: GetWeatherInput) {
    const lookup = await requestQWeather<QWeatherLookupResponse>("/geo/v2/city/lookup", {
        location: input.location,
        adm: input.adm,
        range: input.range,
        number: "3",
        lang: input.lang ?? "zh",
    });

    const matchedLocation = lookup.location?.[0];
    if (!matchedLocation) {
        throw new Error(`QWeather could not resolve location "${input.location}"`);
    }

    const weather = await requestQWeather<QWeatherNowResponse>("/v7/weather/now", {
        location: matchedLocation.id,
        lang: input.lang ?? "zh",
        unit: "m",
    });

    return {
        matchedLocation,
        matchCount: lookup.location?.length ?? 0,
        locationRefer: lookup.refer,
        weather,
    };
}
