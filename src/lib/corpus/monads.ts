/**
 * OlMonadSet — réplica 1:1 de `helpers/sheaf_helper.php` de BibleOL.
 *
 * JSON serializado al cliente: `{"segments":[{"low":..,"high":..}, ...]}`.
 */

export interface MonadPair {
  low: number;
  high: number;
}

/** Codifica un número en base-64 (6 bits por carácter) tal como Emdros lo
 *  serializa en el campo comprimido `monads` (EMdF/monads.cpp `num2string`).
 *  Los caracteres resultantes están en '0'..'o' (nunca 'y' ni 'z'). */
export function num2string(m: number): string {
  const m0 = m & 0x3f;
  const m1 = (m >> 6) & 0x3f;
  const m2 = (m >> 12) & 0x3f;
  const m3 = (m >> 18) & 0x3f;
  const m4 = (m >> 24) & 0x3f;
  const m5 = (m >> 30) & 0x3f;
  let result = "";
  let begun = false;
  for (const group of [m5, m4, m3, m2, m1, m0]) {
    if (group > 0 || begun) {
      result += String.fromCharCode(group + 0x30);
      begun = true;
    }
  }
  return result;
}

/** Descodifica la representación comprimida Emdros de un monad set
 *  (`SetOfMonads::fromCompactString`): números base-64 big-endian separados
 *  por 'z' (entre low y high de un rango) y 'y' (entre rangos). */
export function decodeCompactMonadSet(str: string): MonadPair[] {
  const segments: MonadPair[] = [];
  let i = 0;
  let prev = 0;
  const len = str.length;
  while (i < len) {
    let val = 0;
    while (i < len) {
      const c = str.charCodeAt(i);
      if (c === 0x79 /* 'y' */ || c === 0x7a /* 'z' */) break;
      val = (val << 6) | (c - 0x30);
      ++i;
    }
    const low = prev + val;
    let high: number;
    if (i < len && str[i] === "z") {
      ++i;
      let val2 = 0;
      while (i < len) {
        const c = str.charCodeAt(i);
        if (c === 0x79 || c === 0x7a) break;
        val2 = (val2 << 6) | (c - 0x30);
        ++i;
      }
      high = low + val2;
      prev = high;
    } else {
      high = low;
      prev = low;
    }
    segments.push({ low, high });
    if (i < len && str[i] === "y") {
      ++i;
    }
  }
  return segments;
}

/** Serializa un monad set al formato comprimido Emdros (`toCompactString`). */
export function encodeCompactMonadSet(segments: MonadPair[]): string {
  let result = "";
  let prev = 0;
  for (let idx = 0; idx < segments.length; ++idx) {
    const { low, high } = segments[idx];
    result += num2string(low - prev);
    prev = low;
    if (high !== low) {
      result += "z";
      result += num2string(high - prev);
      prev = high;
    }
    if (idx < segments.length - 1) result += "y";
  }
  return result;
}

export class OlMonadSet {
  segments: MonadPair[];

  constructor(segments: MonadPair[] = []) {
    this.segments = segments;
  }

  /** Convierte una cadena como "{ 1, 4-8, 13 }" en un OlMonadSet. */
  static str2MonadSet(str: string): OlMonadSet {
    const me = new OlMonadSet();
    const re = /-?\d+(?:--?\d+)?/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(str)) !== null) {
      const parts = m[0].split("-").map((s) => parseInt(s, 10));
      if (parts.length === 2) me.segments.push({ low: parts[0], high: parts[1] });
      else me.segments.push({ low: parts[0], high: parts[0] });
    }
    return me;
  }

  /** Crea un OlMonadSet desde la representación comprimida de Emdros. */
  static fromCompactString(str: string): OlMonadSet {
    return new OlMonadSet(decodeCompactMonadSet(str));
  }

  low(): number {
    return this.segments[0].low;
  }

  high1(): number {
    return this.segments[0].high;
  }

  high2(): number {
    return this.segments[this.segments.length - 1].high;
  }

  size(): number {
    let count = 0;
    for (const mp of this.segments) count += mp.high - mp.low + 1;
    return count;
  }

  /** Serializa como monset MQL: `{ 1-39, 45-47 }` (como __toString de PHP). */
  toString(): string {
    return `{ ${this.segments.map((s) => `${s.low}-${s.high}`).join(", ")} }`;
  }

  addOne(low: number, high: number): void {
    this.segments.push({ low, high });
    this.consolidate();
  }

  addSet(mset: OlMonadSet): void {
    for (const ms of mset.segments) this.segments.push(ms);
    this.consolidate();
  }

  addSetNoConsolidate(mset: OlMonadSet): void {
    for (const ms of mset.segments) this.segments.push(ms);
  }

  /** Ordena los segmentos por low y fusiona los solapados/adyacentes. */
  consolidate(): void {
    this.segments.sort((a, b) => a.low - b.low);
    const merged: MonadPair[] = [];
    for (const p of this.segments) {
      const last = merged[merged.length - 1];
      if (last && p.low <= last.high + 1) {
        if (p.high > last.high) last.high = p.high;
      } else {
        merged.push({ low: p.low, high: p.high });
      }
    }
    this.segments = merged;
  }

  /** Comprueba si este monad set contiene el monad dado. */
  containsMonad(m: number): boolean {
    for (const pc of this.segments) if (m >= pc.low && m <= pc.high) return true;
    return false;
  }

  /** Comprueba si este monad set es un superconjunto del dado. */
  containsMonadSet(m: OlMonadSet): boolean {
    outer: for (const pe of m.segments) {
      for (const pc of this.segments) {
        if (pe.low >= pc.low && pe.high <= pc.high) continue outer;
      }
      return false;
    }
    return true;
  }

  /** Comprueba si este monad set se solapa (intersección no vacía) con el dado. */
  overlaps(m: OlMonadSet): boolean {
    for (const pa of this.segments) {
      for (const pb of m.segments) {
        if (pa.low <= pb.high && pb.low <= pa.high) return true;
      }
    }
    return false;
  }

  getSingleInteger(): number {
    if (this.segments.length === 1) {
      const p = this.segments[0];
      if (p.low === p.high) return p.low;
    }
    throw new Error("Object is not a single monad");
  }

  *[Symbol.iterator](): Generator<number> {
    for (const p of this.segments) {
      for (let m = p.low; m <= p.high; ++m) yield m;
    }
  }

  /** Iterador tal como en el helper PHP (foreach de los monads en orden). */
  toArray(): number[] {
    const res: number[] = [];
    for (const p of this.segments) {
      for (let m = p.low; m <= p.high; ++m) res.push(m);
    }
    return res;
  }

  /** JSON igual que json_encode en PHP (propiedades públicas). */
  toJSON(): { segments: MonadPair[] } {
    return { segments: this.segments };
  }
}
