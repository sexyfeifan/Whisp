import { useApp } from "./hooks/useApp";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SettingsApiPage } from "./pages/SettingsApiPage";
import { SettingsRecordingPage } from "./pages/SettingsRecordingPage";
import { SettingsBehaviorPage } from "./pages/SettingsBehaviorPage";
import { SettingsAppPage } from "./pages/SettingsAppPage";
import { SettingsModelsPage } from "./pages/SettingsModelsPage";
import { SettingsPolishPage } from "./pages/SettingsPolishPage";
import { DiagnosticsPage } from "./pages/DiagnosticsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { Skeleton } from "./components/ui/skeleton";
import { StatsPage } from "./pages/StatsPage";
import { AboutPage } from "./pages/AboutPage";

function App() {
  const app = useApp();
  const { view, settings } = app;

  if (!settings) {
    return (
      <div className="flex h-screen" style={{ background: "hsl(var(--background))" }}>
        <div className="w-[180px] shrink-0 flex flex-col border-r p-4 space-y-3" style={{ background: "hsl(var(--sidebar-bg))", borderColor: "hsl(var(--sidebar-border))" }}>
          <Skeleton className="h-6 w-20 mb-4" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
        <div className="flex-1 p-6 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  switch (view) {
    case "onboarding":
      return <OnboardingPage {...app} />;
    case "stats":
      return <StatsPage {...app} />;
    case "settingsApi":
      return <SettingsApiPage {...app} />;
    case "settingsRecording":
      return <SettingsRecordingPage {...app} />;
    case "settingsBehavior":
      return <SettingsBehaviorPage {...app} />;
    case "settingsApp":
      return <SettingsAppPage {...app} />;
    case "settingsPolish":
      return <SettingsPolishPage {...app} />;
    case "settingsModels":
      return <SettingsModelsPage {...app} />;
    case "diagnostics":
      return <DiagnosticsPage {...app} />;
    case "about":
      return <AboutPage {...app} />;
    default:
      return <HistoryPage {...app} />;
  }
}

export default App;
