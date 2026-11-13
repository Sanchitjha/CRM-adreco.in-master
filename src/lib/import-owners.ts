/**
 * Finding the salesperson a sheet row belongs to. A sheet may carry an email address ("rahul@adreco.in") or just a
 * name ("Rahul", "Rahul S.", "Rahul Sharma"), so a name is matched to the team's active people when exactly one fits.
 */

export type OwnerCandidate = { id: string; email: string; name: string };

export type OwnerMatch = { ok: true; id: string } | { ok: false; reason: "not found" | "more than one person" };

const words = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

export function resolveOwner(text: string, people: OwnerCandidate[]): OwnerMatch {
  const wanted = text.trim().toLowerCase();
  if (wanted === "") return { ok: false, reason: "not found" };

  const byEmail = people.find((p) => p.email.toLowerCase() === wanted);
  if (byEmail) return { ok: true, id: byEmail.id };

  const wantedWords = words(wanted);
  if (wantedWords.length === 0) return { ok: false, reason: "not found" };

  const sameName = people.filter((p) => words(p.name).join(" ") === wantedWords.join(" "));
  if (sameName.length === 1) return { ok: true, id: sameName[0].id };
  if (sameName.length > 1) return { ok: false, reason: "more than one person" };

  // "Rahul" or "Rahul S" for "Rahul Sharma": every word typed must start one of the person's name words.
  const fits = people.filter((p) => {
    const own = words(p.name);
    return wantedWords.every((w) => own.some((o) => o.startsWith(w)));
  });
  if (fits.length === 1) return { ok: true, id: fits[0].id };
  return { ok: false, reason: fits.length > 1 ? "more than one person" : "not found" };
}
