/** Short device label from the User-Agent for the owner's member list («Android · Chrome»). */
export function deviceLabel(ua: string | null | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Windows/.test(ua)
        ? "Windows"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  const browser = /WhatsApp/.test(ua)
    ? "WhatsApp"
    : /EdgA?\//.test(ua)
      ? "Edge"
      : /YaBrowser\//.test(ua)
        ? "Yandex"
        : /SamsungBrowser\//.test(ua)
          ? "Samsung Internet"
          : /CriOS\/|Chrome\//.test(ua)
            ? "Chrome"
            : /FxiOS\/|Firefox\//.test(ua)
              ? "Firefox"
              : /Safari\//.test(ua)
                ? "Safari"
                : null;
  const label = [os, browser].filter(Boolean).join(" · ");
  return label || null;
}
