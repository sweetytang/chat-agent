export enum ThemePreference {
  Light = 'light',
  Dark = 'dark',
  System = 'system',
}

export function isThemePreference(value: string | null): value is ThemePreference {
  return (
    value === ThemePreference.Light ||
    value === ThemePreference.Dark ||
    value === ThemePreference.System
  );
}

export function storedThemePreference(value: string | null): ThemePreference {
  return isThemePreference(value) ? value : ThemePreference.System;
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): Exclude<ThemePreference, ThemePreference.System> {
  return preference === ThemePreference.System
    ? systemDark
      ? ThemePreference.Dark
      : ThemePreference.Light
    : preference;
}
