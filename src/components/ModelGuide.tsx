import { Button } from "./ui/button";
import { modelCatalog } from "../lib/constants";
import type { UiLanguage } from "../lib/constants";

export function ModelGuide({
  currentModel, onSelectModel, uiLanguage, toggleText, selectedText, chooseText,
}: {
  currentModel: string; onSelectModel: (modelName: string) => void;
  uiLanguage: UiLanguage; toggleText: string; selectedText: string; chooseText: string;
}) {
  return (
    <div className="mt-2 space-y-2">
      {modelCatalog.map((item) => {
        const selected = currentModel === item.name;
        return (
          <div
            key={item.name}
            className="rounded-lg p-3"
            style={{
              background: "hsl(var(--canvas))",
              border: selected ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--hairline))",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium" style={{ color: "hsl(var(--ink))" }}>{item.name}</p>
                <p className="text-xs mt-0.5" style={{ color: "hsl(var(--steel))" }}>{item.provider}</p>
              </div>
              <Button
                variant={selected ? "primary" : "secondary"}
                size="sm"
                onClick={() => onSelectModel(item.name)}
              >
                {selected ? selectedText : chooseText}
              </Button>
            </div>
            <p className="text-xs mt-2" style={{ color: "hsl(var(--steel))" }}>{item.description[uiLanguage]}</p>
            <p className="text-xs mt-1" style={{ color: "hsl(var(--steel))" }}>{toggleText}: {item.baseUrlHint}</p>
            {item.note && (
              <p className="text-xs mt-1" style={{ color: "hsl(var(--warning))" }}>{item.note[uiLanguage]}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
