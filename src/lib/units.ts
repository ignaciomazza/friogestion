export const UNIT_VALUES = ["u", "m", "m2", "m3", "kg", "lt", "pack"] as const;

export const UNIT_LABELS: Record<(typeof UNIT_VALUES)[number], string> = {
  u: "Unidad",
  m: "Metro",
  m2: "Metro cuadrado",
  m3: "Metro cubico",
  kg: "Kilogramo",
  lt: "Litro",
  pack: "Pack",
};

export const UNIT_OPTIONS = [
  { value: "u", label: "Unidad" },
  { value: "m", label: "Metro" },
  { value: "m2", label: "Metro cuadrado" },
  { value: "m3", label: "Metro cubico" },
  { value: "kg", label: "Kilogramo" },
  { value: "lt", label: "Litro" },
  { value: "pack", label: "Pack" },
] as const;
