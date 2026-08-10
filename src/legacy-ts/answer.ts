// -*- js -*-
// answer.ts — port de BibleOL/ts/answer.ts (puro, sin DOM).
//
// Representa la respuesta correcta a un ítem de una pregunta. El acceso a los
// campos de entrada del usuario se hace a través de InputHandle (inyectado
// por el componente React).

import type { ComponentWithYesNo } from "./componentwithyesno.ts";
import { COMPONENT_TYPE } from "./componentwithyesno.ts";
import type { StringWithSort } from "./stringwithsort.ts";
import { format } from "./util.ts";

/** Decodifica entidades HTML básicas (sin DOM). */
export function decodeHtml(html: string): string {
  return html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

/**
 * Answer: la respuesta correcta a un solo ítem de la pregunta, con su campo
 * de entrada (comp).
 */
export class Answer {
  private comp: ComponentWithYesNo; // The feature request component
  public cType: COMPONENT_TYPE; // The type of comp
  private answerSws: StringWithSort | null; // The correct answer as a StringWithSort, when relevant
  private answerString: string; // The correct answer as a string
  private answerArray: string[] | null = null; // The correct answer as an array of values (only for COMPONENT_TYPE.checkBoxes)

  // Regular expression to find a match. If null, a full match is required. The characters %s
  // will be replaced by the user's input.
  private matchRegexp: string | null;

  private hasAnswered = false; // Has the user answered this question item?
  private firstAnswer: string | null = null; // User's first answer
  private firstAnswerCorrect = false; // Is user's first answer correct?

  /**
   * @param comp         The feature request component.
   * @param answerSws    The correct answer (StringWithSort), when relevant.
   * @param answerString The correct answer as a string.
   * @param matchRegexp  The regular expression used to find a match, null if none is used.
   */
  constructor(
    comp: ComponentWithYesNo,
    answerSws: StringWithSort | null,
    answerString: string,
    matchRegexp: string | null,
  ) {
    this.comp = comp;
    this.cType = comp.elemType;
    this.answerSws = answerSws;
    this.answerString = decodeHtml(answerString).normalize("NFC");
    this.matchRegexp = matchRegexp;

    if (this.cType === COMPONENT_TYPE.checkBoxes) {
      if (this.answerString[0] === "(") {
        const aString = this.answerString.substr(1, this.answerString.length - 2); // Remove surrounding '(' and ')'
        this.answerArray = aString.split(",");
      } else {
        this.answerArray = [this.answerString];
      }
    }
  }

  /**
   * Displays the correct answer (equivalente al botón "Show answer").
   */
  public showIt(): void {
    switch (this.cType) {
      case COMPONENT_TYPE.textField:
      case COMPONENT_TYPE.textFieldWithVirtKeyboard: {
        this.comp.handle.setValue(this.answerString);
        break;
      }

      case COMPONENT_TYPE.textFieldForeign: {
        this.comp.handle.setValue(this.answerString);
        break;
      }

      case COMPONENT_TYPE.comboBox: {
        // Mark the radio whose value equals the correct answer
        const correctInternal = this.answerSws!.getInternal();
        if (this.comp.handle.setCheckedValues !== undefined)
          this.comp.handle.setCheckedValues([correctInternal]);
        break;
      }

      case COMPONENT_TYPE.checkBoxes: {
        if (this.comp.handle.setCheckedValues !== undefined)
          this.comp.handle.setCheckedValues(this.answerArray!);
        break;
      }
    }
  }

  /**
   * Compares the content of the feature request component with the correct
   * answer and sets the Yes/No mark accordingly.
   *
   * @param fromShowIt True if this call comes from the user clicking "Show answer".
   * @param displayIt  True if the result should be displayed on the web page.
   */
  public checkIt(fromShowIt: boolean, displayIt: boolean): void {
    if (fromShowIt) {
      // The question panel now shows the correct answers, but they were not
      // necessarily provided by the user. If the user has not committed an answer to
      // this question item, mark the question item as unanswered.
      if (!this.hasAnswered) {
        this.hasAnswered = true;
        this.firstAnswer = "*Unanswered*";
        this.firstAnswerCorrect = false;
      }
      if (displayIt) this.comp.setYesNo(true);
      return;
    }

    // The question panel contains the user's answers.
    // Where answers are provided, their correctness is logged.
    let userAnswer: string; // The user's answer (perhaps slightly edited)
    let isCorrect: boolean; // Was the user's answer correct?

    switch (this.cType) {
      case COMPONENT_TYPE.textField:
      case COMPONENT_TYPE.textFieldForeign:
      case COMPONENT_TYPE.textFieldWithVirtKeyboard:
        // Check if the string provided by the user is correct
        userAnswer = this.comp.handle.getValue();
        userAnswer = userAnswer
          .normalize("NFC")
          .trim()
          .replace(/  +/g, " "); // Remove extra spaces

        if (this.matchRegexp === null || this.matchRegexp === undefined) {
          isCorrect = userAnswer === this.answerString; // Not === for one may be a number
          if (!isCorrect)
            isCorrect = this.answerString === "-" && userAnswer === "\u05be"; // Accept Maqaf instead of hyphen for empty answer
        } else {
          // Escape all special characters in the user's answer
          const escaped = userAnswer.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
          let pattern = format(this.matchRegexp, escaped);
          if (pattern.startsWith("/")) {
            // El legacy usa eval() sobre una literal de regex; aquí la
            // convertimos a new RegExp() (sin flags).
            pattern = pattern.slice(1, pattern.lastIndexOf("/"));
          }
          const re = new RegExp(pattern);
          isCorrect = this.answerString.match(re) !== null;
        }
        break;

      case COMPONENT_TYPE.comboBox:
        // Check if the user selected the correct option
        {
          const selected = this.comp.handle.getValue();
          if (selected !== "") {
            // The user's answer is the internal (language independent) name.
            // This is necessary in order to produce language independent statistics.
            userAnswer = selected;
            isCorrect = selected === this.answerSws!.getInternal();
          } else {
            userAnswer = "";
            isCorrect = false;
          }
        }
        break;

      case COMPONENT_TYPE.checkBoxes:
        // Check if the user has marked the correct checkboxes
        {
          const allValues = this.comp.handle.getAllValues?.() ?? [];
          const checked = this.comp.handle.getCheckedValues?.() ?? [];
          let ans = "";
          isCorrect = true;
          for (const value of allValues) {
            if (checked.indexOf(value) !== -1) {
              ans += value + ",";
              isCorrect = isCorrect && (this.answerArray ?? []).indexOf(value) !== -1;
            } else {
              isCorrect = isCorrect && (this.answerArray ?? []).indexOf(value) === -1;
            }
          }
          userAnswer = ans === "" ? "" : "(" + ans.substr(0, ans.length - 1) + ")";
        }
        break;
    }

    if (userAnswer && !this.hasAnswered) {
      this.hasAnswered = true;
      this.firstAnswer = userAnswer;
      this.firstAnswerCorrect = isCorrect;
    }
    if (this.hasAnswered && displayIt) this.comp.setYesNo(isCorrect);
  }

  /**
   * This function is called for each question item when the question panel is
   * being closed. It checks the correctness of each question item and marks
   * unanswered question items as such.
   */
  public commitIt(): void {
    this.checkIt(false, false);
    if (!this.hasAnswered) {
      this.hasAnswered = true;
      this.firstAnswer = "*Unanswered*";
      this.firstAnswerCorrect = false;
    }
  }

  /** Returns the user's first answer to this question item. */
  public usersAnswer(): string {
    return this.firstAnswer ?? "";
  }

  /** Returns true if the user's first answer to this question item was correct. */
  public usersAnswerWasCorrect(): boolean {
    return this.firstAnswerCorrect;
  }

  /** Returns the correct answer as a string. */
  public correctAnswer(): string {
    return this.answerString;
  }

  /** The component hosting the input field (para la re-renderización). */
  public get compRef(): ComponentWithYesNo {
    return this.comp;
  }
}
