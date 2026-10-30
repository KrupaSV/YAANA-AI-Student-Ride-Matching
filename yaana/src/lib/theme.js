const KEY = "yaana-theme";

export function readTheme() {
  const saved = localStorage.getItem(KEY);
  return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
}

export function resolvedTheme(choice = readTheme()) {
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return choice === "dark" || (choice === "system" && systemDark) ? "dark" : "light";
}

export function applyTheme(choice) {
  const next = choice === "light" || choice === "dark" || choice === "system" ? choice : "system";
  document.documentElement.dataset.theme = resolvedTheme(next);
  document.documentElement.dataset.themeChoice = next;
  localStorage.setItem(KEY, next);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = resolvedTheme(next) === "dark" ? "#182126" : "#F7F5EF";
  return next;
}

export function initTheme() {
  applyTheme(readTheme());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (readTheme() === "system") applyTheme("system");
  });
}
