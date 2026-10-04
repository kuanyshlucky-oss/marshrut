// Генератор эталонных данных для parity-теста: прогоняет ИСХОДНУЮ клиентскую логику
// проверки (kt.js до переноса на сервер) на случайных входах и записывает
// результат в parity.json. Go-тест обязан выдавать те же баллы и вердикты.
//
// Запуск (из корня репозитория, файл kt.js — версия ДО переноса, из git):
//   git show <коммит-до-переноса>:kt.js > /tmp/kt_old.js
//   node server/internal/exam/testdata/gen_parity.mjs /tmp/kt_old.js server/internal/exam/testdata/parity.json
import fs from 'node:fs';
import vm from 'node:vm';

const [ktPath, outPath] = process.argv.slice(2);
const src = fs.readFileSync(ktPath, 'utf8').split('\n');
const grab = (startRe, endRe) => {
  const a = src.findIndex(l => startRe.test(l));
  let b = a;
  while (!endRe.test(src[b])) b++;
  return src.slice(a, b + 1).join('\n');
};
const code = [
  grab(/^const KT_TYPES = \{/, /^\};/),
  grab(/^const KT_BLOCK_LABELS = \{/, /^\};/),
  grab(/^function ktIsCorrect/, /^\}/),
  grab(/^function isPartialCreditSubject/, /^\}/),
  grab(/^function ktMaxPoints/, /^\}/),
  grab(/^function ktEarnedPoints/, /^\}/),
  grab(/^function gradeKT/, /^\}/),
].join('\n');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(code + '\nthis.f = { ktIsCorrect, isPartialCreditSubject, ktMaxPoints, ktEarnedPoints, gradeKT };', ctx);
const { ktIsCorrect, ktMaxPoints, ktEarnedPoints, gradeKT } = ctx.f;

// детерминированный ГПСЧ, чтобы файл воспроизводился
let seed = 12345;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const int = (n) => Math.floor(rnd() * n);
const pick = (a) => a[int(a.length)];

const codes = ['7M01', 'M123', 'M066', 'M107', 'M005', 'M103', 'M115', 'M149', 'X999'];
const blocks = ['lang', 'logic', 'subj1', 'subj2'];

// 1) баллы за один вопрос
const questions = [];
for (let n = 0; n < 2500; n++) {
  const nOpt = 3 + int(4);
  const multi = rnd() < 0.5;
  let correct;
  if (multi) {
    const k = 1 + int(Math.min(3, nOpt));
    const set = new Set();
    while (set.size < k) set.add(int(nOpt));
    correct = [...set];
  } else correct = int(nOpt);
  // ответ: null | int | массив уникальных индексов
  let ua;
  const r = rnd();
  if (r < 0.1) ua = null;
  else if (r < 0.4) ua = int(nOpt);
  else {
    const k = int(Math.min(4, nOpt) + 1);
    const set = new Set();
    while (set.size < k) set.add(int(nOpt));
    ua = [...set];
  }
  // sometimes answer близок к верному, чтобы покрыть 1-2 балла
  if (multi && rnd() < 0.5) {
    ua = correct.slice();
    if (rnd() < 0.5 && ua.length) ua.pop();
    if (rnd() < 0.5) { const extra = int(nOpt); if (!ua.includes(extra)) ua.push(extra); }
  }
  // UI на вопросы с множественным выбором всегда шлёт массив (или null) — число там
  // невозможно; клиентский код при числе дал бы 0, сервер же нормализует в [n].
  if (Array.isArray(correct) && typeof ua === "number") ua = [ua];
  const code = pick(codes), block = pick(blocks);
  const item = { correct };
  questions.push({
    correct, answer: ua, code, block,
    isCorrect: ktIsCorrect(item, ua),
    max: ktMaxPoints(item, code, block),
    earned: ktEarnedPoints(item, ua, code, block),
  });
}

// 2) вердикт КТ по суммам блоков
const verdicts = [];
for (const typeId of ['nauchped', 'profile']) {
  const size = typeId === 'nauchped' ? { lang: 50, logic: 30, subj1: 30, subj2: 20 } : { lang: 10, logic: 10, subj1: 10, subj2: 10 };
  for (let n = 0; n < 600; n++) {
    const scores = {}, max = {};
    for (const b of blocks) {
      max[b] = size[b] + (b === 'subj2' && rnd() < 0.3 ? int(size[b]) : 0);
      scores[b] = int(max[b] + 1);
    }
    const res = gradeKT(typeId, scores, max);
    verdicts.push({
      typeId, scores, max, passed: res.passed, total: res.total, maxTotal: res.maxTotal,
      blocks: res.blocks.map(b => ({ id: b.id, score: b.score, max: b.max, min: b.min, ok: b.ok })),
    });
  }
}

// 3) проходной процент теста по предмету (script.js: Math.round((score/total)*100) >= 60)
const subject = [];
for (let total = 1; total <= 60; total++) {
  for (let score = 0; score <= total; score++) {
    subject.push({ score, total, passed: Math.round((score / total) * 100) >= 60 });
  }
}

fs.writeFileSync(outPath, JSON.stringify({ questions, verdicts, subject }));
console.log('parity:', questions.length, 'вопросов,', verdicts.length, 'вердиктов КТ,', subject.length, 'случаев предмета');
