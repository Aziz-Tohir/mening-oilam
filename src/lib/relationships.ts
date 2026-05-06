// Shared relationship type list (uzbek labels) — used in both bot keyboards and admin UI.
export const RELATIONSHIP_OPTIONS = [
  { value: "self", label: "Men (o'zim)" },
  { value: "father", label: "Otam" },
  { value: "mother", label: "Onam" },
  { value: "son", label: "O'g'lim" },
  { value: "daughter", label: "Qizim" },
  { value: "brother", label: "Akam/Ukam" },
  { value: "sister", label: "Opam/Singlim" },
  { value: "husband", label: "Erim" },
  { value: "wife", label: "Xotinim" },
  { value: "uncle_paternal", label: "Amakim" },
  { value: "uncle_maternal", label: "Tog'am" },
  { value: "aunt_paternal", label: "Ammam" },
  { value: "aunt_maternal", label: "Xolam" },
  { value: "cousin_male", label: "Amakivachcham (erkak)" },
  { value: "cousin_female", label: "Amakivachcham (ayol)" },
  { value: "grandfather", label: "Bobom" },
  { value: "grandmother", label: "Buvim" },
  { value: "grandson", label: "Nevaram (o'g'il)" },
  { value: "granddaughter", label: "Nevaram (qiz)" },
  { value: "father_in_law", label: "Qaynotam" },
  { value: "mother_in_law", label: "Qaynonam" },
  { value: "son_in_law", label: "Kuyovim" },
  { value: "daughter_in_law", label: "Kelinim" },
  { value: "brother_in_law", label: "Qaynaka/Qaynuka" },
  { value: "sister_in_law", label: "Qaynsingil" },
  { value: "nephew", label: "Jiyanim (o'g'il)" },
  { value: "niece", label: "Jiyanim (qiz)" },
  { value: "other", label: "Boshqa qarindosh" },
] as const;

export type RelationshipValue = typeof RELATIONSHIP_OPTIONS[number]["value"];

export function relationshipLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return RELATIONSHIP_OPTIONS.find(r => r.value === value)?.label ?? value;
}
