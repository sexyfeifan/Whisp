import type React from "react";
import { Button } from "./ui/button";

export function IconButton({
  title, onClick, children, accent,
}: { title: string; onClick: () => void; children: React.ReactNode; accent?: boolean }) {
  return (
    <Button
      variant={accent ? "primary" : "ghost"}
      size="icon"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="h-7 w-7"
    >
      {children}
    </Button>
  );
}
