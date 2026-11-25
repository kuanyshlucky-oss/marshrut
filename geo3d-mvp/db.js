'use strict';
/* Слой доступа к данным. Сейчас хранилище — JSON-файлы в data/.
   Весь код сервера обращается к данным только через этот модуль, поэтому
   переход на PostgreSQL/PostGIS = замена реализации здесь (см. docs/MIGRATION.md),
   а не правка server.js. Интерфейс синхронный, как и раньше. */
const fs = require('fs'), path = require('path');

const DATA = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, 'data');

/* Имя коллекции → файл. Новые коллекции добавлять сюда. */
const FILES = {
  boreholes: 'boreholes.json',
  orders: 'orders.json',
  leads: 'leads.json',
  parcels: 'parcels.json',
  constraints: 'constraints.json',
  utilities: 'utilities.json',
  coverage: 'coverage.json',
  soilDict: 'soil-dictionary.json',
};
const EVENTS_FILE = 'events.jsonl';
const fileOf = name => { if (!FILES[name]) throw new Error('Неизвестная коллекция: ' + name); return path.join(DATA, FILES[name]); };

let version = 0;   // растёт при любом сохранении, по нему сбрасываются кэши паспортов

/* Прочитать коллекцию целиком; если её нет или файл повреждён — fallback. */
function load(name, fallback) {
  try { return JSON.parse(fs.readFileSync(fileOf(name), 'utf8')); } catch { return fallback; }
}

/* Записать коллекцию целиком (через временный файл, чтобы не получить полфайла при сбое). */
function save(name, obj) {
  const file = fileOf(name);
  fs.mkdirSync(DATA, { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1));
  fs.renameSync(tmp, file);
  version++;
}

const evPath = () => path.join(DATA, EVENTS_FILE);
const events = {
  /* Все события (массив объектов). */
  readAll() {
    try { return fs.readFileSync(evPath(), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)); } catch { return []; }
  },
  /* Добавить одно событие. */
  append(e) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.appendFileSync(evPath(), JSON.stringify(e) + '\n');
  },
  /* Заменить весь журнал (очистка старых событий, сброс демо-данных). */
  replaceAll(list) {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFileSync(evPath(), list.map(e => JSON.stringify(e)).join('\n') + (list.length ? '\n' : ''));
  },
};

module.exports = { load, save, events, version: () => version, DATA };
