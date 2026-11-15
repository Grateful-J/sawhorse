import type { Part, Sizes } from "./cabinet.js";

/** The key every cabinet's stack of grain-matched fronts carries (one block per cabinet). */
export const MATCH_KEY: string;
/** The parts with grain matching applied: each front of the stack its own part, carrying
 * `together`; unchanged when matching is off or there are fewer than two fronts. Throws, saying
 * why, when the fronts cannot be one stack. */
export function matchFronts(parts: Part[], s: Sizes): Part[];
