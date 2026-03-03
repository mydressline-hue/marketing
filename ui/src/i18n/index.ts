const translations: Record<string, Record<string, string>> = { en: {} };
let currentLocale = 'en';

export function t(key: string, params?: Record<string, string | number>): string {
  const value = translations[currentLocale]?.[key] || translations['en']?.[key] || key;
  if (!params) return value;
  return Object.entries(params).reduce((str, [k, v]) => str.replace(`{{${k}}}`, String(v)), value);
}

export function setLocale(locale: string) { currentLocale = locale; }
export function getLocale(): string { return currentLocale; }
export function addTranslations(locale: string, strings: Record<string, string>) {
  translations[locale] = { ...translations[locale], ...strings };
}
