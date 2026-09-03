import { Button } from "./ui/button";

export function SettingsPageHeader({
  title, savingSettings, settingsFeedback, m, onDone,
}: {
  title: string;
  savingSettings: boolean;
  settingsFeedback: { tone: "success" | "error"; message: string } | null;
  m: Record<string, string>;
  onDone: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-6" role="banner">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: "hsl(var(--ink))" }}>{title}</h1>
        <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>
          {savingSettings ? m.saving : settingsFeedback?.message ?? ""}
        </p>
      </div>
      <Button
        variant="primary"
        size="sm"
        onClick={onDone}
      >
        {savingSettings ? m.saving : m.done}
      </Button>
    </div>
  );
}
