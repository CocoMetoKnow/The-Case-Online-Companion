const PATTERNS = {
  tap: [10],
  mark: [9],
  card: [8, 28, 12],
  dice: [16, 32, 18, 40, 12, 48, 10],
  snake: [22, 40, 28, 50, 36],
  win: [12, 40, 12, 40, 20],
} as const;

export type HapticKind = keyof typeof PATTERNS;

let switchLabel: HTMLLabelElement | null = null;
let lastAt = 0;

function iosSwitch(): HTMLLabelElement | null {
  if (typeof document === "undefined") return null;
  if (switchLabel) return switchLabel;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.tabIndex = -1;
  input.setAttribute("switch", "");
  input.setAttribute("aria-hidden", "true");
  label.append(input);
  document.body.append(label);
  switchLabel = label;
  return label;
}

export function haptic(kind: HapticKind) {
  if (typeof window === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  lastAt = performance.now();
  const pattern = PATTERNS[kind];
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* this browser has no vibration motor */
  }
  const label = iosSwitch();
  if (!label) return;
  const taps = kind === "dice" || kind === "snake" || kind === "win" ? 3 : kind === "card" ? 2 : 1;
  label.click();
  for (let i = 1; i < taps; i++) window.setTimeout(() => label.click(), i * 46);
}

export function hapticTap() {
  if (performance.now() - lastAt < 50) return;
  haptic("tap");
}
