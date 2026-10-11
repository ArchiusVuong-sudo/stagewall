import type { Submission } from "./service";

/**
 * Messages the demo walkthrough and the end-to-end tests send. Their screener
 * responses are recorded into fixtures, so replay mode answers them exactly.
 */
export const DEMO_INPUTS: Submission[] = [
  {
    name: "Ines",
    track: "Glasshouse",
    message: "Glasshouse got me through finals, text me (415) 555-0134",
    displayConsent: true,
    recapConsent: false,
  },
  {
    name: "Ines",
    track: "Glasshouse",
    message: "selling 2 tix for lisbon, dm @ines_example",
    displayConsent: true,
    recapConsent: false,
  },
  {
    name: "Tavi",
    track: "Paper Moons",
    message: "Paper Moons on vinyl tonight, my heart is full",
    displayConsent: true,
    recapConsent: true,
  },
];
