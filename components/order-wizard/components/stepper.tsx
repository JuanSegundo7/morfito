import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { WizardStep } from "../order-wizard-context";

const steps: { key: WizardStep; label: string }[] = [
  { key: "customer", label: "Cliente" },
  { key: "burgers", label: "Hamburguesas" },
  { key: "summary", label: "Resumen" },
];

export function Stepper({ current }: { current: WizardStep }) {
  const currentIndex = steps.findIndex((s) => s.key === current);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center">
          <div
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full text-caption font-medium",
              i < currentIndex
                ? "bg-green-500 text-white"
                : i === currentIndex
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground",
            )}
          >
            {i < currentIndex ? <Check className="h-4 w-4" /> : i + 1}
          </div>
          <span className="ml-2 text-subheadline">{s.label}</span>
          {i < steps.length - 1 && <div className="mx-3 h-px w-8 bg-border" />}
        </div>
      ))}
    </div>
  );
}
