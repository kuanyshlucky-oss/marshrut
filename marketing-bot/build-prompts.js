// Собирает prompts.js из ../jetishub-marketing-bot-prompts.md (источник правды для промтов).
// Запуск: node build-prompts.js  (вызывается автоматически перед npm start)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const mdPath = path.join(here, '..', 'jetishub-marketing-bot-prompts.md');
if (!fs.existsSync(mdPath)) {
  console.error('Не найден файл с промтами: ' + mdPath + '\nПоложите jetishub-marketing-bot-prompts.md в папку рядом с marketing-bot (в публичный репозиторий он не входит).');
  process.exit(1);
}
const md = fs.readFileSync(mdPath, 'utf8').replace(/\r\n/g, '\n');

// секции "## N." -> текст до следующего "## "
const sections = {};
md.split(/\n(?=## \d\. )/).forEach((s) => { const m = s.match(/^## (\d)\./); if (m) sections[m[1]] = s; });
const blocks = (s) => [...s.matchAll(/```text\n([\s\S]*?)\n```/g)].map((m) => m[1].trim());

const base = blocks(sections['1'])[0];
const modeA = blocks(sections['2'])[0];
const modeB = blocks(sections['3'])[0];
const video = blocks(sections['4'])[0];
if (!base || !modeA || !modeB || !video) throw new Error('Не нашёл один из блоков промта в markdown-файле');

fs.writeFileSync(path.join(here, 'prompts.js'),
  '// АВТОГЕНЕРАЦИЯ из jetishub-marketing-bot-prompts.md (node build-prompts.js). Не править руками.\n' +
  'export const BASE = ' + JSON.stringify(base) + ';\n' +
  'export const MODE_A = ' + JSON.stringify(modeA) + ';\n' +
  'export const MODE_B = ' + JSON.stringify(modeB) + ';\n' +
  'export const VIDEO = ' + JSON.stringify(video) + ';\n');
console.log('prompts.js готов:', [base, modeA, modeB, video].map((x) => x.length + ' симв.').join(', '));
