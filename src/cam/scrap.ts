// "Find your number": the research's step-by-step scrap test (§6 of
// docs/research/feeds-speeds-sources.md), each step with the sources that say it. The
// starting values are starting points; this test finds the number for your bit, your
// material and your machine.
import type { SourceId } from "./sources";

export interface ScrapStep {
  title: string;
  text: string;
  /** Who says it: their words in quotation marks, or what the report says they say. */
  says: { src: SourceId; words: string }[];
}

export const SCRAP_TEST: ScrapStep[] = [
  {
    title: "Start low",
    text: "Take the bit maker's chart value for your bit and material, and start at its low end. The starting value above is the lowest bit maker's figure, or lower where the panel says so.",
    says: [
      { src: "freud", words: '"start your tests with the lower feed rates yielded by our formulas"' },
      { src: "rennie", words: '"Always start out at the lower feed rate and work your way up"' },
    ],
  },
  {
    title: "Start shallow",
    text: "Make the first passes shallow. A compression bit is the exception: its first pass must still be deeper than its up-cut part.",
    says: [
      { src: "freud", words: '"Always start with shallow passes in your test cuts"' },
      { src: "atoz", words: 'start DOC/WOC "small, conservative … then increase"' },
    ],
  },
  {
    title: "Cut scrap of the same sheet",
    text: "Use an offcut of the sheet you will cut, at the same thickness, held down the way you will hold the sheet.",
    says: [{ src: "toolstoday", words: '"Make a test cut in scrap material."' }],
  },
  {
    title: "Hold the RPM, change the feed",
    text: "Keep the dial where it is and raise the feed in steps with Carbide Motion's feed override. Change one thing at a time.",
    says: [
      { src: "atoz", words: '"a great way to tune the chipload value"' },
      { src: "toolstoday", words: '"one variable at a time"' },
    ],
  },
  {
    title: "Judge each step",
    text: "Chips, not dust (dust means the chipload is too low, except in MDF). A clean edge: no burn, fuzz, chatter marks or tear-out. The bit at most slightly warm after the pass. No chatter in the sound.",
    says: [
      { src: "atoz", words: "dust instead of chips means the chipload is too low (MDF is an exception); the bit should be at most slightly warm; listen for chatter" },
      { src: "toolstoday", words: "look for burn, fuzz, chatter marks or tear-out" },
    ],
  },
  {
    title: "Back off and write it down",
    text: "Go back from the first step that chatters or spoils the edge. Record the last good feed for that bit, that material and this machine.",
    says: [{ src: "toolstoday", words: '"Record what works"' }],
  },
  {
    title: "Only then cut deeper",
    text: "Raise the depth of cut after the feed is found. Past 1 × the bit's diameter take 25% off the feed, past 2 × take 50% off.",
    says: [
      { src: "amana-charts", words: "1×D: the chart value; 2×D: reduce by 25%; 3×D: reduce by 50%" },
      { src: "freud", words: 'worked example: ".019" × .75 = .014""' },
    ],
  },
];
