// Offline contract for a future, deliberately restricted postprocessor. This is not a
// controller emulator or an authorization to run a program on a machine.
export type Point = { x: number; y: number; z: number };
export type Contract = {
  min: Point; max: Point; initial: Point;
  clearance: number; maxFeed: number; maxPlunge: number; minRpm: number; maxRpm: number;
};

export function checkLinearProgram(program: string, c: Contract): string[] {
  const errors: string[] = [];
  const fail = (line: number, message: string) => errors.push(`line ${line}: ${message}`);
  const axes = ["x", "y", "z"] as const;
  if (axes.some(a => !Number.isFinite(c.min[a]) || !Number.isFinite(c.max[a]) || !Number.isFinite(c.initial[a]) || c.min[a] >= c.max[a] || c.initial[a] < c.min[a] || c.initial[a] > c.max[a]) ||
      ![c.clearance, c.maxFeed, c.maxPlunge, c.minRpm, c.maxRpm].every(Number.isFinite) ||
      c.clearance < c.min.z || c.clearance > c.max.z || c.initial.z < c.clearance || c.maxFeed <= 0 || c.maxPlunge <= 0 || c.minRpm <= 0 || c.minRpm > c.maxRpm) return ["invalid or incomplete contract"];
  const lines = program.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const header = ["G21", "G90", "G94", "G54"];
  if (header.some((s, i) => lines[i] !== s)) return ["missing required explicit header"];
  let pos = { ...c.initial }, running = false, ended = false;
  for (let i = header.length; i < lines.length; i++) {
    const line = lines[i], n = i + 1;
    if (ended) { fail(n, "content after program end"); continue; }
    if (line === "M5") { running = false; continue; }
    if (line === "M2") {
      if (running || pos.z < c.clearance) fail(n, "end requires spindle off and clearance");
      ended = true; continue;
    }
    const spindle = /^M3 S(\d+(?:\.\d+)?)$/.exec(line);
    if (spindle) {
      const rpm = Number(spindle[1]);
      if (running || !Number.isFinite(rpm) || rpm < c.minRpm || rpm > c.maxRpm) fail(n, "invalid spindle speed or state");
      else running = true;
      continue;
    }
    // Each motion is explicit; no modal motion, comments, expressions, arcs or offsets.
    const words = line.split(/\s+/);
    if ((words[0] !== "G0" && words[0] !== "G1") || words.length < 2) { fail(n, "unsupported command"); continue; }
    const values: Record<string, number> = {};
    let valid = true;
    for (const word of words.slice(1)) {
      const m = /^([XYZF])(-?(?:\d+(?:\.\d*)?|\.\d+))$/.exec(word);
      if (!m || m[1] in values || !Number.isFinite(Number(m[2]))) { valid = false; break; }
      values[m[1]] = Number(m[2]);
    }
    if (!valid || !["X", "Y", "Z"].some(a => a in values) || (words[0] === "G0" && "F" in values) || (words[0] === "G1" && !("F" in values))) { fail(n, "invalid motion words"); continue; }
    const next = { x: values.X ?? pos.x, y: values.Y ?? pos.y, z: values.Z ?? pos.z };
    if (axes.some(a => next[a] < c.min[a] || next[a] > c.max[a])) fail(n, "outside configured work envelope");
    const xy = next.x !== pos.x || next.y !== pos.y;
    if (words[0] === "G0") {
      if ((xy && (pos.z < c.clearance || next.z < c.clearance)) || next.z < c.clearance) fail(n, "rapid below clearance");
    } else {
      if (!running) fail(n, "feed move with spindle off");
      if (values.F <= 0 || values.F > c.maxFeed || (next.z < pos.z && values.F > c.maxPlunge)) fail(n, "feed outside configured limit");
    }
    pos = next;
  }
  if (!ended) errors.push("missing program end");
  return errors;
}
