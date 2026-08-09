/**
 * monadobject.ts — Réplica 1:1 de `include/monadobject.inc.php` de BibleOL.
 * Un SingleMonadObject es un word (un monad); un MultipleMonadObject es un
 * componente de nivel superior (phrase/clause/sentence o el patriarch).
 */

import type { OlMatchedObject } from "./sheaf.ts";
import type { OlMonadSet } from "./monads.ts";
import type { Dbinfo } from "./db-config.ts";

export abstract class MonadObject {
  mo: OlMatchedObject;
  private parent: MonadObject | null = null;
  private children: MonadObject[] | null;
  children_idds: number[] | null;

  constructor(mo: OlMatchedObject, hasChildren: boolean) {
    this.mo = mo;
    if (hasChildren) {
      this.children = [];
      this.children_idds = [];
    } else {
      this.children = null;
      this.children_idds = null;
    }
  }

  get_parent(): MonadObject | null {
    return this.parent;
  }

  add_child(child: MonadObject): void {
    this.children!.push(child);
    this.children_idds!.push(child.get_id_d());
    child.parent = this;
  }

  get_mo(): OlMatchedObject {
    return this.mo;
  }

  get_id_d(): number {
    return this.mo.get_id_d();
  }

  get_feature(name: string): string | undefined {
    return this.mo.get_feature(name);
  }

  get_monadset(): OlMonadSet {
    return this.mo.get_monadset();
  }

  abstract contained_in(mo: MonadObject): boolean;
}

export class SingleMonadObject extends MonadObject {
  private monad: number;
  text: string;
  suffix: string;
  bcv: (string | number)[] = [];
  bcv_loc: string | null = null;
  sameAsNext: boolean[] = [];
  sameAsPrev: boolean[] = [];
  pics: (string | number)[] | null = null;
  urls: { url: string; type: string }[] | null = null;

  constructor(mo: OlMatchedObject, dbinfo: Dbinfo, l10nJson: string) {
    super(mo, false);
    this.monad = mo.get_monadset().getSingleInteger();
    this.text = this.get_feature(dbinfo.surfaceFeature) ?? "";
    this.suffix = dbinfo.suffixFeature ? this.get_feature(dbinfo.suffixFeature) ?? " " : " ";
    this.bcv_loc = null;
    this.l10n = l10nJson;
  }

  private l10n: string;

  get_text(): string {
    return this.text;
  }

  get_suffix(): string {
    return this.suffix;
  }

  add_bcv(x: string | number): void {
    this.bcv.push(x);
    if (this.bcv.length === 3) {
      const loc = JSON.parse(this.l10n) as {
        universe: { reference: { _label: string } & Record<string, string> };
      };
      const ref = loc.universe.reference;
      const args = [ref[this.bcv[0]], this.bcv[1], this.bcv[2]];
      let i = 0;
      this.bcv_loc = ref._label.replace(/%[sd]/g, () => String(args[i++]));
    }
  }

  get_bcv(): (string | number)[] {
    return this.bcv;
  }

  add_sameAsPrev(b: boolean): void {
    this.sameAsPrev.push(b);
  }

  add_sameAsNext(b: boolean): void {
    this.sameAsNext.push(b);
  }

  set_pics(p: (string | number)[] | null): void {
    this.pics = p;
  }

  set_urls(u: { url: string; type: string }[] | null): void {
    this.urls = u;
  }

  contained_in(mo: MonadObject): boolean {
    return mo.mo.get_monadset().containsMonad(this.monad);
  }

  compareTo(o: SingleMonadObject): number {
    return this.monad - o.monad;
  }
}

export class MultipleMonadObject extends MonadObject {
  subobjects: OlMatchedObject[][] | null;

  constructor(mo: OlMatchedObject) {
    super(mo, true);
    if (mo.get_sheaf() !== null) {
      this.subobjects = mo.get_sheaf()!.get_straws().map((s) => s.get_matched_objects());
    } else {
      this.subobjects = null;
    }
  }

  contained_in(mo: MonadObject): boolean {
    return mo.mo.get_monadset().containsMonadSet(this.mo.get_monadset());
  }
}
