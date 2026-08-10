// -*- js -*-
// panelquestion.ts — port de BibleOL/ts/panelquestion.ts (puro, sin DOM).
//
// Construye un modelo de datos (quiz cards + filas de ítems) que el
// componente React renderiza 1:1 al HTML que generaba jQuery. El estado de
// corrección vive en ComponentWithYesNo; los atajos de teclado en KeyTable;
// la posición actual en Cursor.

import type { MonadSet, SingleMonadObject } from "./monadobject.ts";
import { getFirst, getMonadArray } from "./monadobject.ts";
import type { Charset } from "../lib/reader/charset.ts";
import type { Localization } from "./localization.ts";
import { localize, getFeatureFriendlyName, getFeatureValueFriendlyName } from "./localization.ts";
import type { TypeInfo } from "./configuration.ts";
import { getConfiguration, getFeatureSetting } from "./configuration.ts";
import type { FeatureSetting } from "./configuration.ts";
import type { QuizData } from "./quizdata.ts";
import { StringWithSort } from "./stringwithsort.ts";
import type { str2strArr } from "./util.ts";
import { ComponentWithYesNo } from "./componentwithyesno.ts";
import { COMPONENT_TYPE } from "./componentwithyesno.ts";
import type { InputHandle } from "./componentwithyesno.ts";
import { Answer } from "./answer.ts";
import { QuestionStatistics } from "./statistics.ts";
import type { Dictionary } from "./dictionary.ts";

//****************************************************************************************************
// Foreign2Shortcut class
//****************************************************************************************************
export class Foreign2Shortcut {
  private static map: { [letter: string]: string } = {};
  private static initDone = false;

  /** Initializes the shortcut map for the current character set. */
  public static init(): void {
    if (Foreign2Shortcut.initDone) return;
    Foreign2Shortcut.initDone = true;

    const map = Foreign2Shortcut.map;
    switch (getConfiguration().charSet) {
      case "hebrew":
        map["א"] = ">";
        map["ב"] = "b";
        map["ג"] = "g";
        map["ד"] = "d";
        map["ה"] = "h";
        map["ו"] = "w";
        map["ז"] = "z";
        map["ח"] = "x";
        map["ט"] = "v";
        map["י"] = "j";
        map["ך"] = "K";
        map["כ"] = "k";
        map["ל"] = "l";
        map["ם"] = "M";
        map["מ"] = "m";
        map["ן"] = "N";
        map["נ"] = "n";
        map["ס"] = "s";
        map["ע"] = "<";
        map["ף"] = "P";
        map["פ"] = "p";
        map["ץ"] = "Y";
        map["צ"] = "y";
        map["ק"] = "q";
        map["ר"] = "r";
        map["שׁ"] = "c";
        map["שׂ"] = "f";
        map["ש"] = "#";
        map["ת"] = "t";
        map["־"] = "&"; // Maqaf
        map["ֿ"] = "2"; // Rafe
        map["ּ"] = "."; // Dagesh
        map["ֽ"] = "$"; // Meteg
        map["ְ"] = ":"; // Sheva
        map["ֳ"] = "+"; // Hataf qamats
        map["ֲ"] = "A"; // Hataf patah
        map["ֱ"] = "E"; // Hataf segol
        map["ֵ"] = "1"; // Tsere
        map["ָ"] = "@"; // Qamats
        map["ַ"] = "a"; // Patah
        map["ֶ"] = "e"; // Segol
        map["ִ"] = "I"; // Hiriq
        map["ֹ"] = "o"; // Holam
        map["ֻ"] = "u"; // Qubuts
        map["-"] = "-"; // Empty answer indicator
        break;

      case "greek":
        map["α"] = "a";
        map["β"] = "b";
        map["γ"] = "g";
        map["δ"] = "d";
        map["ε"] = "e";
        map["ζ"] = "z";
        map["η"] = "h";
        map["θ"] = "q";
        map["ι"] = "i";
        map["κ"] = "k";
        map["λ"] = "l";
        map["μ"] = "m";
        map["ν"] = "n";
        map["ξ"] = "x";
        map["ο"] = "o";
        map["π"] = "p";
        map["ρ"] = "r";
        map["ς"] = "c";
        map["σ"] = "s";
        map["τ"] = "t";
        map["υ"] = "u";
        map["φ"] = "f";
        map["χ"] = "j";
        map["ψ"] = "q";
        map["ω"] = "w";

        map["Α"] = "A";
        map["Β"] = "B";
        map["Γ"] = "G";
        map["Δ"] = "D";
        map["Ε"] = "E";
        map["Ζ"] = "Z";
        map["Η"] = "H";
        map["Θ"] = "Q";
        map["Ι"] = "I";
        map["Κ"] = "K";
        map["Λ"] = "L";
        map["Μ"] = "M";
        map["Ν"] = "N";
        map["Ξ"] = "X";
        map["Ο"] = "O";
        map["Π"] = "P";
        map["Ρ"] = "R";
        map["Σ"] = "S";
        map["Τ"] = "T";
        map["Υ"] = "U";
        map["Φ"] = "F";
        map["Χ"] = "J";
        map["Ψ"] = "Q";
        map["Ω"] = "W";
        break;

      case "transliterated_hebrew":
        for (let a = 97; a < 123; ++a) map[String.fromCharCode(a)] = String.fromCharCode(a);
        map["ʔ"] = ">";
        map["ʕ"] = "<";
        break;
    }
  }

  /** Performs a lookup in the table. Returns '?' if no shortcut exists. */
  public static get(letter: string): string {
    return Foreign2Shortcut.map[letter] ?? "?";
  }
}

//****************************************************************************************************
// KeyTable class
//****************************************************************************************************
export class KeyTable {
  private elements: (Record<string, string[]> | undefined)[][] = []; // Indexed by card, row, key. Value is list of element IDs
  private actions: (number | undefined)[][] = []; // Indexed by card, row. Value is action
  private focus: (string | undefined)[][] = []; // Indexed by card, row. Value is element ID

  /** Adds an action to be performed on a given element. */
  public add(card: number, row: number, letter: string, id: string, action: number): void {
    if (this.elements[card] === undefined) this.elements[card] = [];
    if (this.elements[card][row] === undefined) this.elements[card][row] = {};
    if (this.elements[card][row][letter] === undefined) this.elements[card][row][letter] = [];

    this.elements[card][row][letter].push(id);

    if (this.actions[card] === undefined) this.actions[card] = [];
    this.actions[card][row] = action;
  }

  /** Adds an element to receive input focus when a row is selected. */
  public addfocus(card: number, row: number, id: string): void {
    if (this.focus[card] === undefined) this.focus[card] = [];
    this.focus[card][row] = id;
  }

  /** Returns an array of the IDs of elements to be affected by a given keystroke. */
  public get_element(card: number, row: number, letter: string): string[] | undefined {
    if (this.elements[card] === undefined || this.elements[card][row] === undefined) return undefined;
    return this.elements[card][row][letter];
  }

  /** Returns the action to be performed on a given element. */
  public get_action(card: number, row: number): number | undefined {
    if (this.actions[card] === undefined) return undefined;
    return this.actions[card][row];
  }

  /** Returns the ID of the element to receive input focus when a given row is selected. */
  public get_focus(card: number, row: number): string | undefined {
    if (this.focus[card] === undefined) return undefined;
    return this.focus[card][row];
  }
}

//****************************************************************************************************
// Cursor class
//****************************************************************************************************
/** Mantiene la pregunta (card) y fila (row) actuales y notifica cambios. */
export class Cursor {
  public static card = 0; // The current question object
  public static row = 0; // The selected row
  private static minrow = 0; // The row containing the first request feature
  private static maxrow = 0; // The maximum number of rows + 1

  /** Llamado (por el componente React) cuando se mueve el cursor. */
  public static onChange: (() => void) | null = null;

  /** Initializes the cursor. */
  public static init(minrow: number, maxrow: number): void {
    Cursor.minrow = minrow;
    Cursor.maxrow = maxrow;
    Cursor.card = 0;
    Cursor.row = minrow;
  }

  /** Goes to a specified question object and row. */
  public static set(c = 0, r = Cursor.minrow): void {
    Cursor.card = c;
    Cursor.row = r;
    Cursor.onChange?.();
  }

  /** Moves to the next or previous row. Returns true if the cursor was moved. */
  public static prevNextItem(n: number /* 1 or -1 */): boolean {
    if (n > 0) {
      if (Cursor.row + n < Cursor.maxrow) {
        Cursor.set(Cursor.card, Cursor.row + n);
        return true;
      }
      return false;
    } else {
      if (Cursor.row + n >= Cursor.minrow) {
        Cursor.set(Cursor.card, Cursor.row + n);
        return true;
      }
      return false;
    }
  }
}

//****************************************************************************************************
// Modelo de renderizado
//****************************************************************************************************

/** Una opción de un grupo de radios (multiple choice). */
export interface RadioOption {
  sws: StringWithSort; // La misma instancia que guarda la Answer correcta
  inputId: string; // `${internal}_${quizItemID}`
  shortcut?: string; // a, b, c, ...
  charClass: string;
}

/** Una opción de checkboxes (list of ...). */
export interface CheckboxOption {
  internal: string;
  label: string; // Puede contener HTML (<i>...</i> para "None of these")
  shortcut: string;
}

/** Una letra del teclado virtual (inputbutton). */
export interface ForeignLetter {
  id: string; // `sc${code}_${quizItemID}`, vacío si la letra no tiene shortcut
  letter: string;
  shortcut?: string;
  charClass: string;
}

export type QuizRowBody =
  | { kind: "suggestions"; options: RadioOption[] }
  | { kind: "textPlain"; value: string; charClass: string }
  | { kind: "textForeign"; inputId: string; letters: ForeignLetter[]; backspaceId: string; charClass: string }
  | { kind: "text"; keyinpId: string }
  | { kind: "integer" }
  | { kind: "checkboxes"; options: CheckboxOption[] }
  | { kind: "select"; options: RadioOption[] };

export interface QuizRow {
  rowId: string; // row_{card}_{headInd}
  ptrId: string; // ptr_{card}_{headInd}
  header: string; // th content
  body: QuizRowBody;
  comp: ComponentWithYesNo; // Estado de corrección + acceso al valor
}

export interface QuizCardModel {
  rows: QuizRow[];
}

//****************************************************************************************************
// PanelUi: acciones de la UI a las que los atajos de teclado llaman.
//****************************************************************************************************
export interface PanelUi {
  prevSubQuiz(): void;
  nextSubQuiz(): void;
  isPrevSubQuizVisible(): boolean;
  isNextSubQuizVisible(): boolean;
  nextQuestion(): void;
  checkAnswer(): void;
  showAnswer(): void;
  toggleShortcuts(): void;
  focusCurrent(): void;
  blurCurrent(): void;
  isChecked(id: string): boolean;
  setChecked(id: string): void;
  clickElement(id: string): void; // botón de letra o de borrado
  toggleElement(id: string): void; // checkbox
}

//****************************************************************************************************
// PanelQuestion class
//****************************************************************************************************
export class PanelQuestion {
  private qd: QuizData; // The information required to generate the exercise
  private sentence: MonadSet; // The monads containing the question text in the Emdros database
  public location = ""; // The current location (localized)
  public vAnswers: Answer[] = []; // The correct answer for each question item
  private answersPerCard: number[] = []; // answersPerCard[n] is the first available index in vAnswers after question object number n
  public   question_stat: QuestionStatistics = new QuestionStatistics(); // Answer statistics
  public exam_mode: boolean; // Are we running an exam?

  public keytable = new KeyTable();
  public keyinps: string[] = [];

  public cards: QuizCardModel[] = []; // Las tarjetas de la pregunta (subquizzes)
  public hasForeignInput = false; // Do we need a virtual keyboard?

  private charset: Charset;

  public subQuizIndex = 0; // Used to toggle subquestions
  public subQuizMax = 0; // Used to define max number of subquestions

  /** Acciones de UI que el componente React conecta a los atajos de teclado. */
  public ui: PanelUi | null = null;

  /**
   * @param qd       The information required to generate an exercise.
   * @param dict     The collection of Emdros objects for this question.
   * @param examMode We're running an exam.
   * @param charset  Character set (derived from configuration.charSet).
   * @param l10n     Corpus localization.
   * @param typeinfo Corpus type information.
   */
  constructor(
    qd: QuizData,
    dict: Dictionary,
    examMode: boolean,
    charset: Charset,
    l10n: Localization,
    typeinfo: TypeInfo,
  ) {
    this.qd = qd;
    this.sentence = dict.sentenceSetQuiz;
    this.exam_mode = examMode;
    this.charset = charset;

    Foreign2Shortcut.init();
    this.location_info(dict);

    // Save question text for statistics
    this.question_stat.text = dict.generateSentenceHtml(qd);

    ///////////////////////////
    // Generate table of question items

    // Cache a few variables for easy access
    const hideWord: boolean = qd.quizFeatures.hideWord; // Display (number) instead of text of the quizobject
    const showFeatures: string[] = qd.quizFeatures.showFeatures;
    const requestFeatures: { name: string; usedropdown: boolean; hideFeatures: string[] }[] =
      qd.quizFeatures.requestFeatures;
    const oType: string = qd.quizFeatures.objectType;

    // Variables for creating table content (<td> parts)
    const featuresHere: { [name: string]: string } = typeinfo.obj2feat[oType]; // Maps feature name => feature type
    const qoFeatures: str2strArr[] = this.buildQuizObjectFeatureList(); // Feature/value pairs for each question object
    let quizItemID = 0; // Counts quizitems to be used to group radio buttons together (see name attribute)

    /////////////////////////////
    // Define question headers //
    const questionheaders: string[] = []; // For each question card, the headers are pulled out from this list

    // Define headers for hideWord items
    if (hideWord) {
      questionheaders.push(`<th>${localize("item_number")}</th>`);
      this.question_stat.show_feat.names.push("item_number");
    }

    // Define headers for showFeatures items
    for (let sfi = 0; sfi < showFeatures.length; ++sfi) {
      questionheaders.push(`<th>${getFeatureFriendlyName(oType, showFeatures[sfi])}</th>`);
      this.question_stat.show_feat.names.push(showFeatures[sfi]); // Save feature name for statistics
    }

    // Define headers for requestFeatures items
    for (let sfi = 0; sfi < requestFeatures.length; ++sfi) {
      questionheaders.push(`<th>${getFeatureFriendlyName(oType, requestFeatures[sfi].name)}</th>`);
      this.question_stat.req_feat.names.push(requestFeatures[sfi].name); // Save feature name for statistics
    }

    const headLen = questionheaders.length;
    const quizCardNum = qoFeatures.length; // Count number of quizcards to define the appearance of toggle buttons

    this.subQuizMax = quizCardNum;

    /////////////////////////////
    // Loop through all the quiz objects //
    for (let qoid = 0; qoid < qoFeatures.length; ++qoid) {
      let headInd = qoid * headLen;
      while (headInd >= headLen) headInd -= headLen; // Normalize headInd to lie in the range 0..headLen.

      const card: QuizCardModel = { rows: [] };
      this.cards.push(card);

      const fvals: str2strArr = qoFeatures[qoid]; // Feature/value pairs for current quiz object

      /////////////////////////////
      // Loop through display features

      // Extra "display feature" for quiz objects that are marked by 'hideWord'
      if (hideWord) {
        card.rows.push(this.displayRow(qoid, headInd, questionheaders[headInd], `${qoid + 1}`, ""));
        ++headInd;
        this.question_stat.show_feat.values.push("" + (qoid + 1)); // Save feature value for statistics
      }

      for (let sfi = 0; sfi < showFeatures.length; ++sfi) {
        const sf: string = showFeatures[sfi]; // Feature name
        let val: string = fvals[sf] as string; // Feature value
        let featType: string | undefined = featuresHere[sf]; // Feature type
        const featset: FeatureSetting = getFeatureSetting(oType, sf); // Feature configuration

        this.question_stat.show_feat.values.push(val); // Save feature value for statistics

        if (featType === undefined && sf !== "visual")
          throw new Error(`Unexpected (1) featType==null in panelquestion.ts; sf="${sf}"`);

        if (sf === "visual") featType = "string";

        if (featType === "hint") {
          // The feature value looks like this:
          // "featurename=value" or "featurename=value,featurename=value"
          // (instead of = the relation may be ≠)
          const sp: string[] = val.split(/([,=≠])/);
          if (sp.length === 3) {
            val =
              getFeatureFriendlyName(oType, sp[0]) +
              sp[1] +
              getFeatureValueFriendlyName(featuresHere[sp[0]], sp[2], false, true);
          } else if (sp.length === 7) {
            val =
              getFeatureFriendlyName(oType, sp[0]) +
              sp[1] +
              getFeatureValueFriendlyName(featuresHere[sp[0]], sp[2], false, true) +
              ", " +
              getFeatureFriendlyName(oType, sp[4]) +
              sp[5] +
              getFeatureValueFriendlyName(featuresHere[sp[4]], sp[6], false, true);
          } else if (val === "*") val = "-";
        } else if (featType !== "string" && featType !== "ascii" && featType !== "integer") {
          // This is an enumeration feature type
          // Replace val with the appropriate friendly name or "Other value"
          if (featset.otherValues && featset.otherValues.indexOf(val) !== -1) val = localize("other_value");
          else val = getFeatureValueFriendlyName(featType, val, false, true);
        }

        if (val === undefined) throw new Error("Unexpected val==null in panelquestion.ts");

        if (featType === "string" || featType === "ascii") {
          card.rows.push(this.displayRow(qoid, headInd, questionheaders[headInd], val === "" ? "-" : val, PanelQuestion.charclass(featset, charset)));
          ++headInd;
        } else {
          card.rows.push(this.displayRow(qoid, headInd, questionheaders[headInd], val, ""));
          ++headInd;
        }
      }

      /////////////////////////////
      // Loop through request features
      Cursor.init(headInd, headLen);

      for (let rfi = 0; rfi < requestFeatures.length; ++rfi) {
        const rf: string = requestFeatures[rfi].name; // Feature name
        const usedropdown: boolean = requestFeatures[rfi].usedropdown; // Use multiple choice?
        const hideFeatures: string[] = requestFeatures[rfi].hideFeatures;
        let correctAnswer: string = fvals[rf] as string; // Feature value (i.e., the correct answer)
        let featType: string | undefined = featuresHere[rf]; // Feature type
        const featset: FeatureSetting = getFeatureSetting(oType, rf); // Feature configuration

        ++quizItemID; // Update quizItemID for each grouping of radio buttons

        if (correctAnswer === undefined) throw new Error("Unexpected correctAnswer==null in panelquestion.ts");
        if (correctAnswer === "") correctAnswer = "-"; // Indicates empty answer

        if (featType === undefined && rf !== "visual")
          throw new Error("Unexpected (2) featType==null in panelquestion.ts");
        if (rf === "visual") featType = "string";

        //////////////////////////////////////////////////////////////////////////
        // The layout of the feature request depends on the type of the feature:
        let body: QuizRowBody;
        let comp: ComponentWithYesNo;

        if (featset.alternateshowrequestDb != null && usedropdown) {
          // Multiple choice question item
          const suggestions: string[] | undefined = fvals[rf + "!suggest!"] as string[] | undefined; // Values to choose between

          if (suggestions === undefined || suggestions === null) {
            // No suggestions, just display the answer as if it were a display feature
            body = { kind: "textPlain", value: correctAnswer, charClass: PanelQuestion.charclass(featset, charset) };
            comp = PanelQuestion.dummyComp();
          } else {
            const options: RadioOption[] = [];
            const charSetClass: string =
              getConfiguration().charSet === "transliterated_hebrew" ? "hebrew_translit" : getConfiguration().charSet;

            comp = new ComponentWithYesNo(COMPONENT_TYPE.comboBox, PanelQuestion.radioHandle(), `quizitem_${quizItemID}`);

            for (let valix = 0; valix < suggestions.length; ++valix) {
              const s: string = suggestions[valix]; // Current suggestion
              const item = new StringWithSort(s, s); // StringWithSort holding the current suggestion
              options.push({
                sws: item,
                inputId: `${item.getInternal()}_${quizItemID}`,
                charClass: charSetClass,
              });
              if (s === correctAnswer) this.vAnswers.push(new Answer(comp, item, s, null));
            }

            // Sort the options alphabetically
            options.sort((a, b) => StringWithSort.compare(a.sws, b.sws));

            // Associate keystroke
            options.forEach((o, ix) => {
              const sc: string = String.fromCharCode(ix + 97); // a, b, c, etc.
              o.shortcut = sc;
              this.keytable.add(qoid, headInd, sc, o.inputId, 1);
            });

            body = { kind: "suggestions", options };
          }
        }
        // In case a text input is requested
        else if (featType === "string" || featType === "ascii") {
          const trimmedAnswer: string = correctAnswer
            .trim()
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&"); // Unescape HTML characters in correctAnswer

          if (getConfiguration().charSet !== "latin" && (featset.foreignText || featset.transliteratedText)) {
            // Foreign language input with a virtual letter keyboard
            const letters: ForeignLetter[] = this.buildForeignLetters(trimmedAnswer).map((letter) => ({
              ...letter,
              charClass: PanelQuestion.charclass(featset, charset),
            }));

            const inputId = `inputshow_${quizItemID}`;
            const backspaceId = `bs_${quizItemID}`;

            this.keytable.add(qoid, headInd, "Backspace", backspaceId, 2);

            // Set randomized letter buttons to be inputted in the input field
            for (const letter of letters) {
              const sc: string = Foreign2Shortcut.get(letter.letter);
              if (sc !== "?") {
                letter.shortcut = sc;
                letter.id = `sc${sc.charCodeAt(0)}_${quizItemID}`;
                this.keytable.add(qoid, headInd, sc, letter.id, 2);
              }
            }

            this.hasForeignInput = true;
            comp = new ComponentWithYesNo(COMPONENT_TYPE.textFieldForeign, PanelQuestion.textHandle(), inputId);
            body = { kind: "textForeign", inputId, letters, backspaceId, charClass: PanelQuestion.charclass(featset, charset) };
            this.vAnswers.push(new Answer(comp, null, trimmedAnswer, featset.matchregexp ?? null));
          } else {
            const keyinpId = `keyinp_${qoid}_${headInd}`;
            this.keyinps.push(keyinpId);

            comp = new ComponentWithYesNo(COMPONENT_TYPE.textField, PanelQuestion.textHandle(), keyinpId);
            body = { kind: "text", keyinpId };
            this.vAnswers.push(new Answer(comp, null, trimmedAnswer, featset.matchregexp ?? null));
          }
        }
        // In case a number is requested
        else if (featType === "integer") {
          comp = new ComponentWithYesNo(COMPONENT_TYPE.textField, PanelQuestion.textHandle(), `integer_${qoid}_${headInd}`);
          body = { kind: "integer" };
          this.vAnswers.push(new Answer(comp, null, correctAnswer, null));
        }
        // Checkboxes
        else if (featType !== undefined && featType.substr(0, 8) === "list of ") {
          const subFeatType: string = featType.substr(8); // Remove "list of "
          const values: string[] | undefined = typeinfo.enum2values[subFeatType]; // Possible Emdros feature values
          const swsValues: StringWithSort[] = []; // StringWithSort equivalents of feature values

          // Create StringWithSort objects for every feature value
          for (let i = 0; i < (values ?? []).length; ++i)
            swsValues.push(new StringWithSort(getFeatureValueFriendlyName(subFeatType, values[i], false, false), values[i]));

          // Sort the values using the optional sorting index in the value strings
          swsValues.sort((a, b) => StringWithSort.compare(a, b));

          // Add "None of these" as a final option
          swsValues.push(new StringWithSort(`<i>${localize("none_of_these")}</i>`, "none_of_these"));

          const options: CheckboxOption[] = [];
          // Arrange in three columns
          const numberOfItems = swsValues.length; // Number of values
          const numberOfRows = Math.floor((numberOfItems + 2) / 3); // Number of rows with 3 values each

          for (let r = 0; r < numberOfRows; ++r) {
            for (let c = 0; c < 3; ++c) {
              const ix = r + c * numberOfRows;
              if (ix < numberOfItems) {
                const sc: string = String.fromCharCode(ix + 97); // a, b, c, etc.
                options.push({
                  internal: swsValues[ix].getInternal(),
                  label: swsValues[ix].getString(),
                  shortcut: sc,
                });
                this.keytable.add(qoid, headInd, sc, `${swsValues[ix].getInternal()}_${quizItemID}`, 3);
              }
            }
          }

          if (correctAnswer === "()") correctAnswer = "(none_of_these)";

          comp = new ComponentWithYesNo(COMPONENT_TYPE.checkBoxes, PanelQuestion.checkboxHandle(options), `quizitem_${quizItemID}`);
          body = { kind: "checkboxes", options };
          this.vAnswers.push(new Answer(comp, null, correctAnswer, null));
        }
        // One option from a multiple choice list is requested
        else {
          const options: RadioOption[] = [];
          const charSetClass =
            getConfiguration().charSet === "transliterated_hebrew" ? "hebrew_translit" : getConfiguration().charSet;

          const values: string[] | undefined = typeinfo.enum2values[featType ?? ""]; // Possible Emdros feature values

          if (values === undefined) {
            body = { kind: "textPlain", value: "QuestionPanel.UnknType", charClass: "" };
            comp = PanelQuestion.dummyComp();
          } else {
            // This will be a multiple choice question
            const correctAnswerFriendly: string = getFeatureValueFriendlyName(featType, correctAnswer, false, false); // Localized correct answer
            let hasAddedOther = false; // Have we added an 'Other value' to the list of values?
            const correctIsOther: boolean =
              (featset.otherValues !== undefined && featset.otherValues.indexOf(correctAnswer) !== -1) ||
              (hideFeatures !== undefined && hideFeatures.indexOf(correctAnswer) !== -1);

            comp = new ComponentWithYesNo(COMPONENT_TYPE.comboBox, PanelQuestion.radioHandle(), `quizitem_${quizItemID}`);

            // Loop though all possible values and add the appropriate localized name
            // or "Other value" to the combo box
            for (let valix = 0; valix < values.length; ++valix) {
              const s: string = values[valix]; // Feature value under consideration
              if (featset.hideValues !== undefined && featset.hideValues.indexOf(s) !== -1) continue; // Don't show the value s

              if (
                (featset.otherValues !== undefined && featset.otherValues.indexOf(s) !== -1) ||
                (hideFeatures !== undefined && hideFeatures.indexOf(s) !== -1)
              ) {
                // The value s is one of the values that make up 'Other value'
                if (!hasAddedOther) {
                  hasAddedOther = true;

                  const item: StringWithSort = new StringWithSort("#1000 " + localize("other_value"), "othervalue");
                  options.push({ sws: item, inputId: `${item.getInternal()}_${quizItemID}`, charClass: charSetClass });
                  if (correctIsOther) this.vAnswers.push(new Answer(comp, item, localize("other_value"), null));
                }
              } else {
                const sFriendly: string = getFeatureValueFriendlyName(featType, s, false, false); // Localized value of s
                const item: StringWithSort = new StringWithSort(sFriendly, s); // StringWithSort holding the value s
                options.push({ sws: item, inputId: `${item.getInternal()}_${quizItemID}`, charClass: charSetClass });
                if (sFriendly === correctAnswerFriendly)
                  // s is the correct answer
                  this.vAnswers.push(new Answer(comp, item, s, null));
              }
            }

            // Sort the options using the optional sorting index in the value strings
            options.sort((a, b) => StringWithSort.compare(a.sws, b.sws));

            // Associate keystroke (first character of the option)
            options.forEach((o) => {
              this.keytable.add(qoid, headInd, o.sws.getString()[0].toLowerCase(), o.inputId, 1);
            });

            body = { kind: "select", options };
          }
        }

        card.rows.push({
          rowId: `row_${qoid}_${headInd}`,
          ptrId: `ptr_${qoid}_${headInd}`,
          header: questionheaders[headInd],
          body,
          comp,
        });

        ++headInd;
      }

      this.answersPerCard.push(this.vAnswers.length);
      Cursor.set();
    }

    this.subQuizMax = quizCardNum;
  }

  //------------------------------------------------------------------------------------------
  // charclass static method
  //
  // Determines the appropriate CSS class for a given feature.
  //------------------------------------------------------------------------------------------
  private static charclass(featset: FeatureSetting, charset: Charset): string {
    return featset.foreignText ? charset.foreignClass : featset.transliteratedText ? (charset.transliteratedClass ?? "") : "";
  }

  /** Fila de solo texto (display feature / hideWord / suggestions sin opciones). */
  private displayRow(qoid: number, headInd: number, header: string, value: string, charClass: string): QuizRow {
    return {
      rowId: `row_${qoid}_${headInd}`,
      ptrId: `ptr_${qoid}_${headInd}`,
      header,
      body: { kind: "textPlain", value, charClass },
      comp: PanelQuestion.dummyComp(),
    };
  }

  //------------------------------------------------------------------------------------------
  // getInputTypes method
  //
  // Returns a list of input types for each request feature, the input type determines the
  // algorithm for loading previous answers.
  //------------------------------------------------------------------------------------------
  public getInputTypes(): string[] {
    const inputTypes: string[] = [];
    for (let i = 0; i < this.vAnswers.length; i++) {
      const ctype = this.vAnswers[i].cType;
      let input_type = "radio";
      if (ctype === COMPONENT_TYPE.textFieldForeign) input_type = "text";
      else if (ctype === COMPONENT_TYPE.textField) input_type = "vocab";
      else if (ctype === COMPONENT_TYPE.textFieldWithVirtKeyboard) input_type = "vocab";
      else if (ctype === COMPONENT_TYPE.checkBoxes) input_type = "checkbox";
      inputTypes.push(input_type);
    }
    return inputTypes;
  }

  //------------------------------------------------------------------------------------------
  // updateQuestionStat method
  //
  // Updates the private question statistics with information about the student's answers and
  // returns the statistics.
  //------------------------------------------------------------------------------------------
  public updateQuestionStat(): QuestionStatistics {
    this.question_stat.end_time = Math.round(new Date().getTime() / 1000);

    for (let i = 0; i < this.vAnswers.length; ++i) {
      const ans: Answer = this.vAnswers[i];
      ans.commitIt(); // Check answer correctness and identify unanswered questions

      this.question_stat.req_feat.correct_answer.push(ans.correctAnswer());
      this.question_stat.req_feat.users_answer.push(ans.usersAnswer());
      this.question_stat.req_feat.users_answer_was_correct.push(ans.usersAnswerWasCorrect());
    }

    return this.question_stat;
  }

  public getSubQuizMax(): number {
    return this.subQuizMax;
  }

  //------------------------------------------------------------------------------------------
  // buildQuizObjectFeatureList method
  //
  // Creates a list of feature=>value maps holding the features for each question object.
  //------------------------------------------------------------------------------------------
  private buildQuizObjectFeatureList(): str2strArr[] {
    const qoFeatures: str2strArr[] = []; // The feature/value pairs for each question object

    const hasSeen: boolean[] = []; // Maps id_d => true if the id_d has been seen. (An id_d
    // can occur several times; for example, the id_d of a
    // clause may occur for each monad within the clause.)

    const allmonads: number[] = getMonadArray(this.sentence); // All monads in the sentence
    for (let i = 0; i < allmonads.length; ++i) {
      const id_d: number = this.qd.monad2Id[allmonads[i]];
      if (id_d) {
        if (!hasSeen[id_d]) {
          qoFeatures.push(this.qd.id2FeatVal[id_d] as unknown as str2strArr);
          hasSeen[id_d] = true;
        }
      }
    }
    return qoFeatures;
  }

  //------------------------------------------------------------------------------------------
  // location_info method
  //
  // Handles the "Locate" information in a question
  //------------------------------------------------------------------------------------------
  private location_info(dict: Dictionary): void {
    // Calculate the Bible reference (the 'location') for this sentence.
    // We base the location on the first monad in the sentence.
    const smo: SingleMonadObject = dict.getSingleMonadObject(getFirst(this.sentence));
    this.location = smo.bcv_loc; // Localized

    // Save the location for statistics
    this.question_stat.location = "";

    const univHier = getConfiguration().universeHierarchy;
    for (let unixi = 0; unixi < univHier.length; ++unixi) {
      this.question_stat.location += smo.bcv[unixi] + (unixi !== 2 ? ", " : "");
    }
  }

  //------------------------------------------------------------------------------------------
  // prevNextSubQuestion method
  //
  // Method used to toggle subquestions in a quiz.
  //------------------------------------------------------------------------------------------
  public prevNextSubQuestion(n: number): void {
    if (this.subQuizIndex + n >= 0 && this.subQuizIndex + n < this.subQuizMax) {
      // If the proposed move (n; always 1 or -1) is within the boundaries, proceed...
      this.subQuizIndex += n;
    }
    Cursor.set(this.subQuizIndex);
  }

  //------------------------------------------------------------------------------------------
  // checkAnswerButton / showAnswerButton methods
  //
  // Handlers for the "Check answer" and "Show answer" buttons.
  //------------------------------------------------------------------------------------------
  public checkAnswerButton(): void {
    const firstAns: number = this.subQuizIndex === 0 ? 0 : this.answersPerCard[this.subQuizIndex - 1];
    const lastAns: number = this.answersPerCard[this.subQuizIndex];
    for (let aix = firstAns; aix < lastAns; ++aix) {
      const a: Answer = this.vAnswers[aix];
      a.checkIt(false, true);
    }
  }

  public showAnswerButton(): void {
    const firstAns: number = this.subQuizIndex === 0 ? 0 : this.answersPerCard[this.subQuizIndex - 1];
    const lastAns: number = this.answersPerCard[this.subQuizIndex];
    for (let aix = firstAns; aix < lastAns; ++aix) {
      const a: Answer = this.vAnswers[aix];
      a.showIt();
      a.checkIt(true, true);
    }
  }

  //------------------------------------------------------------------------------------------
  // body_keydown handler
  //
  // Handles shortcut characters outside of text input fields.
  // Returns true if the event was handled (propagation stopped).
  //------------------------------------------------------------------------------------------
  public handleBodyKeydown(event: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
    const ctrl: boolean = event.ctrlKey || event.metaKey;

    if (event.key === "PageDown") {
      this.ui?.nextSubQuiz();
      return true;
    } else if (event.key === "PageUp") {
      this.ui?.prevSubQuiz();
      return true;
    } else if (event.key === "ArrowDown" && !ctrl) {
      Cursor.prevNextItem(1);
      return true;
    } else if (event.key === "ArrowUp") {
      Cursor.prevNextItem(-1);
      return true;
    } else if (event.key === "ArrowDown" && ctrl) {
      this.ui?.nextQuestion();
      return true;
    } else if (event.key === "g" && ctrl) {
      this.ui?.checkAnswer();
      return true;
    } else if (event.key === "j" && ctrl) {
      this.ui?.showAnswer();
      return true;
    } else if (event.key === "s" && ctrl) {
      this.ui?.toggleShortcuts();
      return true;
    } else if (!ctrl) {
      const ids = this.keytable.get_element(Cursor.card, Cursor.row, event.key);

      if (ids) {
        switch (this.keytable.get_action(Cursor.card, Cursor.row)) {
          case 1: {
            // Check
            if (ids.length > 1) {
              // More than one option starts with this character
              for (let i = 0; i < ids.length; ++i) {
                if (this.ui?.isChecked(ids[i])) {
                  let i1 = i + 1;
                  if (i1 === ids.length) i1 = 0;
                  this.ui?.setChecked(ids[i1]);
                  return true;
                }
              }
              // If we reach this point, no item starting the character has been checked
            }
            this.ui?.setChecked(ids[0]);
            return true;
          }

          case 2: {
            // Click
            this.ui?.clickElement(ids[0]);
            return true;
          }

          case 3: {
            // Toggle
            this.ui?.toggleElement(ids[0]);
            return true;
          }
        }
        return true;
      }
      return false;
    }
    return false;
  }

  //------------------------------------------------------------------------------------------
  // textfield_keydown handler
  //
  // Handles shortcut characters inside text input fields.
  // Returns true if the event was handled (propagation stopped).
  //------------------------------------------------------------------------------------------
  public handleTextFieldKeydown(event: { key: string; ctrlKey: boolean; metaKey: boolean }): boolean {
    const ctrl: boolean = event.ctrlKey || event.metaKey;

    if (event.key === "ArrowDown" && !ctrl) {
      if (Cursor.prevNextItem(1)) this.ui?.blurCurrent();
      return true;
    } else if (event.key === "ArrowUp") {
      if (Cursor.prevNextItem(-1)) this.ui?.blurCurrent();
      return true;
    } else if (event.key === "PageDown") {
      if (this.ui?.isNextSubQuizVisible()) this.ui?.nextSubQuiz();
      return true;
    } else if (event.key === "PageUp") {
      if (this.ui?.isPrevSubQuizVisible()) this.ui?.prevSubQuiz();
      return true;
    } else if (event.key === "ArrowDown" && ctrl) {
      this.ui?.nextQuestion();
      return true;
    } else if (event.key === "g" && ctrl) {
      this.ui?.checkAnswer();
      return true;
    } else if (event.key === "j" && ctrl) {
      this.ui?.showAnswer();
      return true;
    } else if (event.key === "s" && ctrl) {
      this.ui?.toggleShortcuts();
      return true;
    }
    return false;
  }

  //------------------------------------------------------------------------------------------
  // Helpers (handles de entrada para los componentes React)
  //------------------------------------------------------------------------------------------

  /** Handle de un grupo de radios: getValue() devuelve el internal marcado. */
  private static radioHandle(): InputHandle {
    let current = "";
    return {
      getValue: () => current,
      setValue: (v: string) => {
        current = v;
      },
      setCheckedValues: (values: string[]) => {
        current = values.length > 0 ? values[0] : "";
      },
    };
  }

  /** Handle de un grupo de checkboxes. */
  private static checkboxHandle(options: CheckboxOption[]): InputHandle {
    const checked: string[] = [];
    const allValues = options.map((o) => o.internal);
    return {
      getValue: () => (checked.length > 0 ? "(" + checked.join(",") + ")" : ""),
      setValue: () => undefined,
      getCheckedValues: () => checked,
      setCheckedValues: (values: string[]) => {
        checked.length = 0;
        checked.push(...values);
      },
      getAllValues: () => allValues,
    };
  }

  /** Handle de un campo de texto (text/foreign/integer). */
  private static textHandle(): InputHandle {
    let value = "";
    return {
      getValue: () => value,
      setValue: (v: string) => {
        value = v;
      },
    };
  }

  private static dummyComp(): ComponentWithYesNo {
    return new ComponentWithYesNo(COMPONENT_TYPE.textField, PanelQuestion.textHandle(), "");
  }

  //------------------------------------------------------------------------------------------
  // buildForeignLetters method
  //
  // Port del algoritmo de letras para la entrada de idioma extranjero:
  // letras únicas de la respuesta + hasta 3 consonantes y 3 vocales extra
  // (confusables), todas únicas, '-' siempre disponible en hebreo, ordenadas.
  //------------------------------------------------------------------------------------------
  private buildForeignLetters(answer: string): { letter: string; id: string; shortcut?: string; charClass: string }[] {
    const answerArray: string[] = answer.split(""); // Array of chars of the correct answer
    const answerLetters: string[] = []; // Array with only unique letters of correct answer
    const additionalCons: string[] = []; // Array with consonants to be added to answerLetters
    const additionalVowels: string[] = []; // Array with vowels to be added to answerLetters
    const showLetters: string[] = []; // Unique letters that are finally shown

    // Push unique letters to answerLetters
    for (const el of answerArray) if (answerLetters.indexOf(el) === -1) answerLetters.push(el);

    /////////////////////////////////
    // Find shin-sin and remove it //
    let shinDot = false;
    let sinDot = false;
    for (let i = 0; i < answerLetters.length; i++) {
      if (answerLetters[i] === "ש") {
        // Check for sin-shin letter
        answerLetters.splice(i, 1);
        break;
      }
    }
    for (let i = 0; i < answerLetters.length; i++) {
      if (answerLetters[i] === "\u05C1") {
        // Checks for shin-dot
        answerLetters.splice(i, 1);
        shinDot = true;
        break;
      }
    }
    for (let i = 0; i < answerLetters.length; i++) {
      if (answerLetters[i] === "\u05C2") {
        // Check for sin-dot
        answerLetters.splice(i, 1);
        sinDot = true;
        break;
      }
    }

    // push combined letter if shinDot or sinDot are set
    if (shinDot) answerLetters.push("ש" + "\u05C1");
    if (sinDot) answerLetters.push("ש" + "\u05C2");

    // Add additional letters to a maximum of 12 unique letters total
    for (let index = 0; index < answerLetters.length; index++) {
      const l: string = answerLetters[index];
      switch (l) {
        //////////////////////////////
        // Hebrew Regular consonants
        case "-":
          // The correct answer is empty, so we propose a few random characters
          if (getConfiguration().charSet === "hebrew") {
            additionalCons.push("י"); // yod
            additionalCons.push("ם"); // mem
            additionalCons.push("מ"); // final mem
            additionalCons.push("ך"); // final kaf
            additionalCons.push("ת"); // tav

            additionalVowels.push("ְ"); // Sheva
            additionalVowels.push("ֵ"); // Tsere
            additionalVowels.push("ָ"); // Qamats
            additionalVowels.push("ַ"); // Patah
            additionalVowels.push("ֶ"); // Segol
            additionalVowels.push("ִ"); // Hiriq
            additionalVowels.push("ֹ"); // Holam
            additionalVowels.push("ֻ"); // Qubuts
          }
          break;
        case "א": // if alef
          additionalCons.push("ע"); // push ayin
          break;
        case "ב": // if bet
          additionalCons.push("כ"); // push kaf
          break;
        case "ד": // if dalet
          additionalCons.push("ר"); // push resh
          additionalCons.push("ה"); // push he
          break;
        case "ח": // if het
          additionalCons.push("ה"); // push he
          additionalCons.push("ת"); // push tav
          break;
        case "ט": // if tet
          additionalCons.push("ת"); // push tav
          break;
        case "ו": // if waw
          additionalCons.push("י"); // push yod
          additionalCons.push("ז"); // push zayin
          break;
        case "י": // if yod
          additionalCons.push("ו"); // push waw
          break;
        case "ק": // if qof
          additionalCons.push("כ"); // push kaf
          break;
        case "כ": // if kaf
          additionalCons.push("ק"); // push qof
          additionalCons.push("ב"); // push bet
          break;
        case "ר": // if resh
          additionalCons.push("ד"); // push dalet
          additionalCons.push("ה"); // push he
          break;
        case "ש" + "\u05C1": // if shin
          additionalCons.push("ש" + "\u05C2"); // push sin
          break;
        case "ש" + "\u05C2": // if sin
          additionalCons.push("ש" + "\u05C1"); // push shin
          break;
        case "ת": // if tav
          additionalCons.push("ט"); // push tet
          additionalCons.push("ע"); // push ayin
          break;
        ///////////////////////////////////
        // Hebrew Sofit - closing letters
        case "ך": // if kaf sofit
          additionalCons.push("כ"); // push kaf
          additionalCons.push("ו"); // push waw --> because of suffixes
          additionalVowels.push("\u05B9"); // push holem --> because of suffixes
          break;
        case "ף": // if pe sofit
          additionalCons.push("פ"); // push pe
          additionalCons.push("ך"); // push kaf sofit
          break;
        case "ץ": // if tsade sofit
          additionalCons.push("צ"); // push tsade
          break;
        case "ם": // if mem sofit
          additionalCons.push("מ"); // push mem
          additionalCons.push("ן"); // push nun sofit
          break;
        case "ן": // if nun sofit
          additionalCons.push("נ"); // push nun
          additionalCons.push("ם"); // push mem sofit
          break;
        ///////////////////////////////////
        // Hebrew Vowels
        case "\u05B8": // if qamats
          additionalVowels.push("\u05B8"); // push hatef
          additionalVowels.push("\u05B3"); // push hatef qamats
          break;
        case "\u05B3": // if hatef qamats
          additionalVowels.push("\u05B0"); // push sheva
          additionalVowels.push("\u05B8"); // push qamats
          break;
        case "\u05B7": // if patah
          additionalVowels.push("\u05B8"); // push qamats
          additionalVowels.push("\u05B2"); // push hatef patah
          break;
        case "\u05B2": // if hatef patah
          additionalVowels.push("\u05B0"); // push sheva
          additionalVowels.push("\u05B7"); // push patah
          break;
        case "\u05B0": // if sheva
          additionalVowels.push("\u05B2"); // push hatef patah
          additionalVowels.push("\u05B1"); // push hatef segol
          additionalVowels.push("\u05B3"); // push hatef qamats
          break;
        case "\u05B5": // if tsere
          additionalVowels.push("\u05B6"); // push segol
          break;
        case "\u05B6": // if segol
          additionalVowels.push("\u05B5"); // push tsere
          additionalVowels.push("\u05B1"); // push hatef segol
          break;
        case "\u05B9": // if holem
          additionalVowels.push("\u05BB"); // push qubuts
          break;
        case "\u05BB": // if qubuts
          additionalVowels.push("\u05B9"); // push holem
          break;
        ////////////////////////////////
        // Greek consonants
        case "β": // if beta
          additionalCons.push("δ"); // push delta
          break;
        case "γ": // if gamma
          additionalCons.push("κ"); // push kappa
          break;
        case "δ": // if delta
          additionalCons.push("β"); // push beta
          break;
        case "ζ": // if dzeta
          additionalCons.push("ξ"); // push xi
          break;
        case "θ": // if theta
          additionalCons.push("τ"); // push tau
          break;
        case "κ": // if kappa
          additionalCons.push("γ"); // push gamma
          break;
        case "λ": // if lambda
          additionalCons.push("μ"); // push mu
          break;
        case "μ": // if mu
          additionalCons.push("ν"); // push nu
          break;
        case "ν": // if nu
          additionalCons.push("μ"); // push mu
          break;
        case "ξ": // if xi
          additionalCons.push("ζ"); // push dzeta
          break;
        case "π": // if pi
          additionalCons.push("ψ"); // push psi
          break;
        case "ρ": // if rho
          additionalCons.push("λ"); // push lambda
          break;
        case "σ": // if sigma regular
          additionalCons.push("ς"); // push sigma final
          break;
        case "ς": // if sigma final
          additionalCons.push("σ"); // push sigma regular
          break;
        case "τ": // if tau
          additionalCons.push("θ"); // push theta
          break;
        case "φ": // if phi
          additionalCons.push("θ"); // push theta
          break;
        case "χ": // if chi
          break;
        case "ψ": // if psi
          additionalCons.push("π"); // push pi
          break;
        ///////////////////////////////////
        // Greek vowels
        case "α": // if alpha
          additionalVowels.push("η"); // push eta
          additionalVowels.push("ε"); // push epsilon
          break;
        case "ε": // if epsilon
          additionalVowels.push("ι"); // push iota
          break;
        case "η": // if eta
          additionalVowels.push("ε"); // push epsilon
          break;
        case "ι": // if iota
          additionalVowels.push("ε"); // push epsilon
          break;
        case "υ": // if upsilon
          additionalVowels.push("η"); // push eta
          break;
        case "ο": // if omikron
          additionalVowels.push("η"); // push eta
          additionalVowels.push("ω"); // push omega
          break;
        case "ω": // if omega
          additionalVowels.push("ο"); // push omikron
          break;
      }
    }

    // Randomize additional Consonants
    additionalCons.sort(() => 0.5 - Math.random());
    // Randomize additional Vowels
    additionalVowels.sort(() => 0.5 - Math.random());

    // Push max 2 Consonants and max 3 Vowels to answerLetters
    const answerLettersRandom: string[] = answerLetters
      .concat(additionalCons.slice(0, 3))
      .concat(additionalVowels.slice(0, 3));

    // Make all letters unique and save them in showLetters
    for (const el of answerLettersRandom) if (showLetters.indexOf(el) === -1) showLetters.push(el);

    if (getConfiguration().charSet === "hebrew" && showLetters.indexOf("-") === -1)
      showLetters.push("-"); // An empty answer should always be an option in hebrew

    // Sort letters alphabetically
    showLetters.sort();

    return showLetters.map((letter) => ({
      id: "",
      letter,
      charClass: "",
    }));
  }
}
