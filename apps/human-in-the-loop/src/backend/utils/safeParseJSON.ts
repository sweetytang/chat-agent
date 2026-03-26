import { IObj } from '../../types';

export function safeParseJSON<T = IObj>(value: string, fallback: T = {} as T): T {
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}