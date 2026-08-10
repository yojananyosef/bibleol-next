// -*- js -*-
// stringwithsort.ts — port de BibleOL/ts/stringwithsort.ts (puro, sin DOM).

/** Representa una string con un sort index opcional ("#8 Foobar"). */
export class StringWithSort {
  private sort: number; // -1 si no hay sort index
  private str: string; // La string sin sort index
  private internal: string; // El valor interno (independiente del idioma)

  constructor(s: string, internal: string | null = null) {
    if (s.length > 0 && s.charAt(0) === "#") {
      const sp = s.indexOf(" ");
      this.sort = +s.substring(1, sp);
      this.str = s.substring(sp + 1);
    } else {
      this.sort = -1;
      this.str = s;
    }
    this.internal = internal ?? "";
  }

  getInternal(): string {
    return this.internal;
  }

  getString(): string {
    return this.str;
  }

  static stripSortIndex(s: string): string {
    return s.length > 0 && s.charAt(0) === "#" ? s.substring(s.indexOf(" ") + 1) : s;
  }

  static compare(sws1: StringWithSort, sws2: StringWithSort): number {
    if (sws1.sort === -1 || sws2.sort === -1 || sws1.sort === sws2.sort) {
      if (sws1.internal === "othervalue") return 1;
      if (sws2.internal === "othervalue") return -1;
      const s1 = sws1.str.toLowerCase();
      const s2 = sws2.str.toLowerCase();
      return s1 < s2 ? -1 : s1 > s2 ? 1 : 0;
    }
    return sws1.sort < sws2.sort ? -1 : 1;
  }
}
