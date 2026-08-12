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
import { StatsPage } from "./pages/StatsPage";

function App() {
  const app = useApp();
  const { view, settings, m } = app;

  if (!settings) {
    return (
      <div className="h-screen flex items-center justify-center text-sm" style={{ color: "hsl(var(--steel))" }}>
        {m.loading}
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
    default:
      return <HistoryPage {...app} />;
  }
}

export default App;
