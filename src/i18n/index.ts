import messages from "./messages";

export type UiLanguage = "zh-CN" | "en" | "ja";

export function createI18n(lang: UiLanguage) {
  const msg = messages[lang] ?? messages["zh-CN"];
  
  function t(key: string): string {
    return (msg as Record<string, string>)[key] ?? key;
  }
  
  function tr(
    zhCN: string,
    en: string,
    ja: string
  ): string {
    switch (lang) {
      case "en":
        return en;
      case "ja":
        return ja;
      default:
        return zhCN;
    }
  }
  
  return { t, tr, lang };
}

export { messages };
