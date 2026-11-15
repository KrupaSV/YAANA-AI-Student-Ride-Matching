export const PICKUP_CHARACTERS = [
  { value: "neutral", label: "Neutral", symbol: "🧑" },
  { value: "woman", label: "Woman", symbol: "👩" },
  { value: "man", label: "Man", symbol: "👨" },
];
export const DESTINATION_SYMBOL = "🏁";
export const MEETING_SYMBOL = "✦";

export function pickupCharacter(value) {
  return PICKUP_CHARACTERS.find((option) => option.value === value) ?? PICKUP_CHARACTERS[0];
}
