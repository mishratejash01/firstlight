/**
 * A section's name as it reads inside a sentence, as in "More politics": lower
 * case, except a name written entirely in capitals, which is an abbreviation
 * and keeps them ("More AI", not "More ai").
 */
export function inSentence(name: string): string {
  return name === name.toUpperCase() ? name : name.toLowerCase();
}
