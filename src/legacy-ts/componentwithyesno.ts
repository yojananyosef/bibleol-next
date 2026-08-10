// -*- js -*-
// componentwithyesno.ts — port de BibleOL/ts/componentwithyesno.ts.
// Sin DOM: el estado del icono de correcto/incorrecto se modela de forma
// pura; el acceso al valor del campo se hace vía InputHandle (provisto por
// el componente React).

export const COMPONENT_TYPE = {
  textField: "textField",
  textFieldWithVirtKeyboard: "textFieldWithVirtKeyboard",
  textFieldForeign: "textFieldForeign",
  comboBox: "comboBox",
  checkBoxes: "checkBoxes",
} as const;

export type COMPONENT_TYPE = (typeof COMPONENT_TYPE)[keyof typeof COMPONENT_TYPE];

/** Acceso al valor de un campo de entrada (inyectado por el componente React). */
export interface InputHandle {
  getValue(): string;
  setValue(v: string): void;
  /** Lista de valores marcados (checkBoxes) o null si no aplica. */
  getCheckedValues?(): string[];
  /** Marca los valores indicados (checkBoxes). */
  setCheckedValues?(values: string[]): void;
  /** Todos los valores posibles (checkBoxes). */
  getAllValues?(): string[];
}

export type YesNoState = "none" | "yes" | "no";

/**
 * ComponentWithYesNo: componente con icono de corrección. En el port React,
 * el estado se devuelve con getState() para renderizar el icono.
 */
export class ComponentWithYesNo {
  private state: YesNoState = "none";
  private changed = false;
  public readonly elemType: COMPONENT_TYPE;
  public readonly handle: InputHandle;
  public readonly elemId: string;

  constructor(elemType: COMPONENT_TYPE, handle: InputHandle, elemId: string) {
    this.elemType = elemType;
    this.handle = handle;
    this.elemId = elemId;
  }

  /** El usuario cambió el valor → icono vacío. */
  onChange(): void {
    this.changed = true;
    this.setNone();
  }

  setYesNo(yes: boolean): void {
    this.state = yes ? "yes" : "no";
    this.changed = false;
  }

  setNone(): void {
    this.state = "none";
  }

  getState(): YesNoState {
    return this.state;
  }

  /** ¿Cambió el valor desde el último setYesNo? (virtual keyboard polling). */
  isChanged(): boolean {
    return this.changed;
  }
}
