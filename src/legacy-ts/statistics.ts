// -*- js -*-
// statistics.ts — port de BibleOL/ts/statistics.ts (puro, sin DOM).

import { getQuizData } from "./quizdata.ts";

export class ShowFeatStatistics {
  names: string[] = [];
  values: string[] = [];
}

export class ReqFeatStatistics {
  names: string[] = [];
  correct_answer: string[] = [];
  users_answer: string[] = [];
  users_answer_was_correct: boolean[] = [];
}

export class QuestionStatistics {
  text = "";
  location = "";
  start_time = 0;
  end_time = 0;
  show_feat = new ShowFeatStatistics();
  req_feat = new ReqFeatStatistics();
}

export class QuizStatistics {
  questions: QuestionStatistics[] = [];
  grading = false;
  question_count: number;
  private quizid: number;

  constructor(quizid: number) {
    this.quizid = quizid;
    this.question_count = Object.keys(getQuizData().id2FeatVal).length;
  }
}
