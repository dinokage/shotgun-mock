/**
 * A shot's full name repeats its project/episode/sequence prefix (e.g.
 * "pes1_ep009_sc004_sh003") -- everywhere that shot is already shown inside
 * that same episode/sequence context (a card, a picker within an already-
 * scoped dropdown), that prefix is pure noise. This is just the shot
 * number, matching how an episode/sequence is already shown by its own
 * short code ("Ep009", "sc004") rather than a longer qualified name.
 */
export function shotNumber(fullName: string): string {
  const parts = fullName.split("_");
  return parts[parts.length - 1] || fullName;
}
