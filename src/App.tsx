import { useEffect } from "react";
import AppShell from "@/components/layout/app-shell";
import StartPage from "@/pages/start";
import HistoryPage from "@/pages/history";
import SettingsPage from "@/pages/settings";
import { useAppStore } from "@/stores/app-store";
import useAppBootstrap from "@/hooks/use-app-bootstrap";

const App = () => {
  const activeView = useAppStore((state) => state.activeView);
  const themePreference = useAppStore((state) => state.themePreference);

  useAppBootstrap();

  useEffect(() => {
    const applyTheme = (shouldUseDark: boolean) => {
      document.documentElement.classList.toggle("dark", shouldUseDark);
    };

    if (themePreference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(media.matches);
      const listener = (event: MediaQueryListEvent) =>
        applyTheme(event.matches);
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    }

    applyTheme(themePreference === "dark");
  }, [themePreference]);

  useEffect(() => {
    document.body.classList.add("bg-background");
  }, []);

  const renderActiveView = () => {
    switch (activeView) {
      case "history":
        return <HistoryPage />;
      case "settings":
        return <SettingsPage />;
      case "start":
      default:
        return <StartPage />;
    }
  };

  return <AppShell>{renderActiveView()}</AppShell>;
};

export default App;
