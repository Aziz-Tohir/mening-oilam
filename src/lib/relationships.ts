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
  { value: "step_father", label: "O'gay otam" },
  { value: "step_mother", label: "O'gay onam" },
  { value: "step_son", label: "O'gay o'g'lim" },
  { value: "step_daughter", label: "O'gay qizim" },
  { value: "half_brother", label: "O'gay akam/ukam" },
  { value: "half_sister", label: "O'gay opam/singlim" },
  { value: "great_grandfather", label: "Buvamning otasi" },
  { value: "great_grandmother", label: "Buvamning onasi" },
  { value: "great_grandson", label: "Chevaram (o'g'il)" },
  { value: "great_granddaughter", label: "Chevaram (qiz)" },
  { value: "godfather", label: "Otaxon" },
  { value: "godmother", label: "Onaxon" },
  { value: "family_friend", label: "Oila do'sti" },
  { value: "other", label: "Boshqa qarindosh" },
] as const;

export type RelationshipValue = typeof RELATIONSHIP_OPTIONS[number]["value"];

export function relationshipLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return RELATIONSHIP_OPTIONS.find(r => r.value === value)?.label ?? value;
}
