// -*- js -*-
// quiz.ts — port de BibleOL/ts/quiz.ts (puro, sin DOM).
//
// Maneja la ejecución de un ejercicio. Las operaciones de UI (progreso,
// botones, descripción, navegación) se delegan en un QuizUi inyectado por el
// componente React.

import type { DictionaryIf } from "./dictionary.ts";
import { Dictionary } from "./dictionary.ts";
import type { DisplayCtx } from "./displaymonadobject.ts";
import type { Charset } from "../lib/reader/charset.ts";
import type { Localization } from "./localization.ts";
import type { TypeInfo } from "./configuration.ts";
import type { QuizData } from "./quizdata.ts";
import type { QuestionStatistics } from "./statistics.ts";
import { QuizStatistics } from "./statistics.ts";
import { PanelQuestion } from "./panelquestion.ts";
import { Cursor } from "./panelquestion.ts";
import type { Answer } from "./answer.ts";
//****************************************************************************************************
// QuizUi: operaciones de UI que el componente React implementa.
//****************************************************************************************************
export interface QuizUi {
  hidePrevQuestion(): void;
  showPrevQuestion(): void;
  disableNext(): void;
  enableNext(): void;
  /** Fin del quiz disponible (quita 'not-clickable'/'disabled'). */
  enableFinish(): void;
  /** Fin del quiz no disponible (addClass 'not-clickable' + disabled). */
  disableFinish(): void;
  setProgress(index: number, max: number): void;
  setProgressText(text: string): void;
  setDesc(html: string): void;
  scrollToQuestion(first: boolean): void;
  /** Navega a una URL (tras acabar el quiz). */
  navigateTo(url: string): void;
  /** Muestra un mensaje de error de servidor. */
  showError(message: string): void;
  /** Muestra el mensaje "sending_statistics". */
  showSendingStatistics(): void;
  alert(message: string): void;
  /** Envía las estadísticas al servidor; resuelve true si fue bien. */
  sendStatistics(statistics: QuizStatistics): Promise<boolean>;
}

//****************************************************************************************************
// Quiz class
//****************************************************************************************************
export class Quiz {
  private currentDictIx = -1; // Current index in the array of dictionaries provided by the server
  private currentPanelQuestion: PanelQuestion | null = null; // The current question panel
  private quiz_statistics: QuizStatistics; // Statistics about the execution of the exercise
  public exam_mode: boolean; // Are we running an exam?

  private dictionaries: DictionaryIf;
  private qd: QuizData;
  private ui: QuizUi;
  private ctx: DisplayCtx;
  private charset: Charset;
  private l10n: Localization;
  private typeinfo: TypeInfo;

  // Diccionarios de navegación (equivalentes a myDictionary/featDictionary/statDictionary)
  private myDictionary: { [key: string]: string[] } = {};
  private featDictionary: { [key: string]: string[] } = {};
  private statDictionary: { [key: string]: QuestionStatistics } = {};

  /**
   * @param qid      The server's identification of statistics for this exercise execution.
   * @param inExam   We're running an exam.
   * @param qd       The quiz data (payload del servidor).
   * @param dictif   The 'dictionaries' variable from the server.
   * @param ui       Adaptador de UI.
   * @param ctx      Contexto de visualización.
   * @param charset  Character set.
   * @param l10n     Corpus localization.
   * @param typeinfo Corpus type information.
   */
  constructor(
    qid: number,
    inExam: boolean,
    qd: QuizData,
    dictif: DictionaryIf,
    ui: QuizUi,
    ctx: DisplayCtx,
    charset: Charset,
    l10n: Localization,
    typeinfo: TypeInfo,
  ) {
    this.quiz_statistics = new QuizStatistics(qid);
    this.exam_mode = inExam;
    this.qd = qd;
    this.dictionaries = dictif;
    this.ui = ui;
    this.ctx = ctx;
    this.charset = charset;
    this.l10n = l10n;
    this.typeinfo = typeinfo;
  }

  /** El número de preguntas disponibles. */
  public get questionCount(): number {
    return this.dictionaries.sentenceSets.length;
  }

  /** El índice de la pregunta actual (-1 antes de la primera). */
  public get currentIndex(): number {
    return this.currentDictIx;
  }

  public get currentPanel(): PanelQuestion | null {
    return this.currentPanelQuestion;
  }

  //------------------------------------------------------------------------------------------
  // prevQuestion method
  //
  // Called whenever the user clicks 'Previous'.
  // Replaces the current quiz question with the previous one, if any.
  //------------------------------------------------------------------------------------------
  public prevQuestion(): void {
    const qstat = this.currentPanelQuestion!.updateQuestionStat();
    const previous_data = qstat.req_feat;
    const user_answers = previous_data.users_answer; // (ex. 'Imperfect', 'Future', etc.)
    this.myDictionary[this.currentDictIx.toString()] = user_answers;
    const feat_names = previous_data.names;
    this.featDictionary[this.currentDictIx.toString()] = feat_names;
    this.statDictionary[this.currentDictIx.toString()] = qstat;

    // decrease current index
    --this.currentDictIx;

    // Get text for previous question
    const currentDict: Dictionary = new Dictionary(this.dictionaries, this.currentDictIx, this.qd, this.ctx);

    // Create a panel for the previous question
    this.currentPanelQuestion = new PanelQuestion(this.qd, currentDict, this.exam_mode, this.charset, this.l10n, this.typeinfo);

    const number_subquestions = this.currentPanelQuestion.getSubQuizMax();

    if (number_subquestions === 1) this.ui.enableNext();

    if (this.currentDictIx + 1 <= this.dictionaries.sentenceSets.length) {
      // enable the 'Next' button
      this.ui.enableNext();
      this.ui.disableFinish();
    }

    // if the current index is zero, hide the previous button
    if (this.currentDictIx === 0) this.ui.hidePrevQuestion();
    else this.ui.showPrevQuestion();

    // update the description
    this.ui.setDesc(this.qd.desc);

    // update the progress bar
    this.ui.setProgress(this.currentDictIx + 1, this.dictionaries.sentenceSets.length);
    this.ui.setProgressText(`${this.currentDictIx + 1}/${this.dictionaries.sentenceSets.length}`);
    this.loadAnswer();
  }

  //------------------------------------------------------------------------------------------
  // populateRadio / populateVocab / populateText methods
  //------------------------------------------------------------------------------------------
  private populateRadio(answer: Answer, current_answer: string): void {
    if (!current_answer.includes("Unanswered")) {
      answer.compRef.handle.setCheckedValues?.([current_answer]);
    }
  }

  private populateVocab(answer: Answer, current_answer: string): void {
    if (!current_answer.includes("Unanswered")) {
      answer.compRef.handle.setValue(current_answer);
    }
  }

  private populateText(answer: Answer, current_answer: string): void {
    if (!current_answer.includes("Unanswered")) {
      answer.compRef.handle.setValue(current_answer);
    }
  }

  //------------------------------------------------------------------------------------------
  // loadAnswer method
  //
  // Loads the previous user input if this question has been visited before.
  //------------------------------------------------------------------------------------------
  public loadAnswer(): void {
    const hasVisited = this.myDictionary[this.currentDictIx.toString()] !== undefined;

    const inputTypes = this.currentPanelQuestion!.getInputTypes();
    if (hasVisited) {
      const answer_to_load = this.myDictionary[this.currentDictIx.toString()];
      const nreq_features = this.featDictionary[this.currentDictIx.toString()].length;
      for (let i = 0; i < answer_to_load.length; i++) {
        const current_answer = answer_to_load[i];
        const feature_idx = i % nreq_features;
        const feature_type = inputTypes[feature_idx];
        const answer = this.currentPanelQuestion!.vAnswers[i];
        if (feature_type === "vocab") this.populateVocab(answer, current_answer);
        else if (feature_type === "text") this.populateText(answer, current_answer);
        else this.populateRadio(answer, current_answer);
      }
    }
  }

  //------------------------------------------------------------------------------------------
  // nextQuestion method
  //
  // Called at the start of an exercise and whenever the user clicks 'Next'.
  //
  // @param first True for the first question in a quiz.
  //------------------------------------------------------------------------------------------
  public nextQuestion(first: boolean): void {
    // if this question is first, hide the previous question button
    if (first) {
      this.ui.hidePrevQuestion();
    } else {
      if (this.exam_mode) this.ui.showPrevQuestion();
    }

    if (this.currentPanelQuestion !== null) {
      const qstat = this.currentPanelQuestion.updateQuestionStat();

      if (!first) {
        const previous_data = qstat.req_feat;
        const user_answers = previous_data.users_answer;
        this.myDictionary[this.currentDictIx.toString()] = user_answers;
        const feat_names = previous_data.names;
        this.featDictionary[this.currentDictIx.toString()] = feat_names;
        this.statDictionary[this.currentDictIx.toString()] = qstat;
      }
    } else if (this.qd.fixedquestions > 0) {
      this.ui.disableFinish();
    }

    // Sanity check: are there more questions?
    if (++this.currentDictIx < this.dictionaries.sentenceSets.length) {
      // We have another question

      // Get text for next question
      const currentDict: Dictionary = new Dictionary(this.dictionaries, this.currentDictIx, this.qd, this.ctx);

      this.ui.setDesc(this.qd.desc);
      this.ui.setProgress(this.currentDictIx + 1, this.dictionaries.sentenceSets.length);
      this.ui.setProgressText(`${this.currentDictIx + 1}/${this.dictionaries.sentenceSets.length}`);

      // Create a panel for the next question
      this.currentPanelQuestion = new PanelQuestion(this.qd, currentDict, this.exam_mode, this.charset, this.l10n, this.typeinfo);

      // 'Next' siempre habilitado salvo en la última pregunta (legacy:
      // removeAttr/attr('disabled') sobre button#next_question).
      if (this.currentDictIx + 1 === this.dictionaries.sentenceSets.length) {
        this.ui.disableNext();
        this.ui.enableFinish();
      } else {
        this.ui.enableNext();
        this.ui.disableFinish();
      }

      this.loadAnswer();
    } else {
      this.ui.alert("No more questions");
    }

    if (this.exam_mode) {
      if (this.currentDictIx + 1 < this.dictionaries.sentenceSets.length) this.ui.disableFinish();
      else this.ui.enableFinish();
    }

    // Move to top of the question
    this.ui.scrollToQuestion(first);
  }

  //------------------------------------------------------------------------------------------
  // finishQuiz method
  //
  // Called when the user clicks 'GRADE task' or 'SAVE outcome'.
  // Terminates the exercise and sends statistics to the server.
  //
  // @param gradingFlag May the statistics be used for grading the student?
  //------------------------------------------------------------------------------------------
  public finishQuiz(gradingFlag: boolean): void {
    if (this.qd.quizid === -1) {
      // User not logged in
      if (this.exam_mode) this.ui.navigateTo("exam/active_exams");
      else this.ui.navigateTo("text/select_quiz"); // Go to quiz selection
    } else {
      if (this.currentPanelQuestion === null) {
        this.ui.alert("System error: No current question panel");
      } else {
        // update the final question to statistics dictionary
        const qstat = this.currentPanelQuestion.updateQuestionStat();
        this.statDictionary[this.currentDictIx.toString()] = qstat;

        // package the statDictionary into the questions array
        for (const index of Object.keys(this.statDictionary)) {
          this.quiz_statistics.questions.push(this.statDictionary[index]);
        }
      }
      this.quiz_statistics.grading = gradingFlag;

      this.ui.showSendingStatistics();

      // Send statistics to server
      this.ui
        .sendStatistics(this.quiz_statistics)
        .then((ok) => {
          if (ok) this.ui.navigateTo("text/select_quiz"); // Go to quiz selection
        })
        .catch((err: unknown) => {
          this.ui.showError(String(err));
        });
    }
  }

  //------------------------------------------------------------------------------------------
  // Métodos de depuración (equivalen a los log* del legacy)
  //------------------------------------------------------------------------------------------
  public logMyDictionary(): string {
    return JSON.stringify(this.myDictionary);
  }

  public logFeatDictionary(): string {
    return JSON.stringify(this.featDictionary);
  }

  public logStatDictionary(): string {
    return JSON.stringify(this.statDictionary);
  }
}

/** El cursor del panel de preguntas (exposición para React). */
export { Cursor };