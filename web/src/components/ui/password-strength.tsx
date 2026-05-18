"use client";

import { useMemo } from "react";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

const RULES = [
  { key: "length",  label: "At least 8 characters",        test: (p: string) => p.length >= 8 },
  { key: "upper",   label: "One uppercase letter (A–Z)",    test: (p: string) => /[A-Z]/.test(p) },
  { key: "lower",   label: "One lowercase letter (a–z)",    test: (p: string) => /[a-z]/.test(p) },
  { key: "digit",   label: "One number (0–9)",              test: (p: string) => /\d/.test(p) },
  { key: "special", label: "One special character (!@#$…)", test: (p: string) => /[^A-Za-z0-9]/.test(p) },
];

const STRENGTH_LABELS = ["", "Weak", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLORS = ["", "bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500"];

export function PasswordStrength({ password }: { password: string }) {
  const results = useMemo(() => RULES.map(r => ({ ...r, ok: r.test(password) })), [password]);
  const score = results.filter(r => r.ok).length;

  if (!password) return null;

  return (
    <div className="space-y-2 mt-1">
      {/* Strength bar */}
      <div className="flex gap-1 h-1.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn(
            "flex-1 rounded-full transition-colors",
            i < score ? STRENGTH_COLORS[score] : "bg-muted"
          )} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium">{STRENGTH_LABELS[score] || "—"}</span>
      </p>

      {/* Rule checklist */}
      <ul className="space-y-0.5">
        {results.map(r => (
          <li key={r.key} className="flex items-center gap-1.5 text-xs">
            {r.ok
              ? <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
              : <X className="h-3 w-3 text-muted-foreground flex-shrink-0" />}
            <span className={r.ok ? "text-green-600" : "text-muted-foreground"}>{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Returns null when valid, or an error string — mirrors the backend PasswordPolicy.
export function validatePassword(password: string): string | null {
  for (const rule of RULES) {
    if (!rule.test(password)) return rule.label + " is required.";
  }
  return null;
}
