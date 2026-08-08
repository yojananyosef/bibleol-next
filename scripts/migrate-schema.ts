import { getAppDb } from "../src/lib/db/sqlite.ts";
import { seedDemoData, seedQuizTemplates } from "../src/lib/db/seed.ts";

const { users, classes } = seedDemoData(getAppDb());
const quizzesCopied = seedQuizTemplates();
console.log(
  `OK: data/app.db listo — ${users} usuarios demo (admin/teacher/student, password = username), ${classes} clase(s) demo` +
    (quizzesCopied ? ", plantillas .3et copiadas" : "")
);
