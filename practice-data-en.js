/* Юниты практики по английской грамматике (локальный прототип).
   Разметка теории: «## заголовок», «• пункт», «| a | b |» (таблица; «|---|» после первой строки — шапка),
   «**термин**», «{{g|r|o|p|b:текст}}» (зелёный, красный, оранжевый, фиолетовый, синий), «>+ совет», «>! ловушка», «>? пример».
   Упражнения: {t:'mcq', q, o:[…], a:индекс, why} · {t:'gap', q:'… ___ (verb) …', a:['вариант', …], why}. */
window.PRACTICE_EN = {
  title: 'Английский язык · грамматика',
  units: [
    {
      id: 'present-tenses', n: 1, title: 'Present tenses', ru: 'Настоящие времена',
      theory: `## Present Simple — что обычно верно
| Когда | Пример |
|---|
| факты и законы | Water {{g:boils}} at 100°C. |
| привычки и регулярные действия | Kazakhstan {{g:exports}} large amounts of grain. |
| расписание | The library {{g:closes}} at 9 p.m. on weekdays. |
| he / she / it → окончание | she {{o:works}}, he {{o:studies}}, it {{o:watches}} |
• Правописание: **-s** (works), **-es** после s, sh, ch, x, o (watches, goes), согласная + y → **-ies** (study → studies), гласная + y → **-s** (plays).
• Вопрос и отрицание — через **do / does** + глагол без окончания: Does she {{b:work}}? She doesn’t {{b:work}}.
• Маркеры: always, usually, often, sometimes, never, every day, on Mondays.
## Present Continuous — что происходит сейчас или временно
• Форма: **am / is / are + глагол с -ing**.
>? Shh — the examiner {{g:is reading}} the instructions. · I’{{o:m revising}} for my exam this week. · More young people {{p:are choosing}} to study online.
• Три значения: действие в момент речи, временная ситуация, меняющаяся тенденция.
• С always — раздражающая привычка: He’s {{r:always interrupting}} me.
• Маркеры: now, at the moment, today, this week, currently, these days, still.
## Глаголы состояния (обычно не в Continuous)
• **know, believe, understand, want, need, like, love, hate, prefer, belong, own, seem, taste (= иметь вкус)**.
>! Не «I am knowing», а {{r:I know}}. Не «I am not understanding», а {{r:I don’t understand}}.
• Некоторые глаголы имеют два значения: I {{b:have}} a car (владею) — I’m {{b:having}} lunch (обедаю, действие).
>+ Подсказка: если можно подставить «сейчас, прямо в эту минуту» — Continuous; если «вообще, обычно» — Simple.`,
      ex: [
        { t: 'mcq', q: 'Water ___ at 100°C.', o: ['boils', 'is boiling', 'boil', 'boiled'], a: 0, why: 'Научный факт — Present Simple, подлежащее в 3-м лице ед. числа → boils.' },
        { t: 'mcq', q: 'Shh! The examiner ___ the instructions.', o: ['reads', 'is reading', 'read', 'has read'], a: 1, why: 'Действие происходит прямо сейчас — Present Continuous: is reading.' },
        { t: 'gap', q: 'My parents ___ (live) in Shymkent.', a: ['live'], why: 'Постоянная ситуация — Present Simple. «Parents» — множественное число, окончание -s не нужно.' },
        { t: 'mcq', q: 'Look! It ___ outside.', o: ['snows', 'is snowing', 'snow', 'snowing'], a: 1, why: '«Look!» указывает на момент речи — Present Continuous.' },
        { t: 'gap', q: 'She ___ (study) English every evening.', a: ['studies'], why: 'Привычка → Present Simple. Согласная + y: study → studies.' },
        { t: 'mcq', q: 'I ___ what you mean.', o: ['don’t understand', 'am not understanding', 'not understand', 'doesn’t understand'], a: 0, why: 'Understand — глагол состояния, в Continuous не употребляется. С «I» — don’t.' },
        { t: 'gap', q: 'The library ___ (close) at 9 p.m. on weekdays.', a: ['closes'], why: 'Расписание — Present Simple, 3-е лицо ед. числа: closes.' },
        { t: 'mcq', q: 'Why ___ you talking so loudly?', o: ['are', 'do', 'does', 'is'], a: 0, why: 'Вопрос в Present Continuous: are + you + talking.' },
        { t: 'mcq', q: 'Выберите верное предложение.', o: ['He is always interrupt me.', 'He’s always interrupting me.', 'He always interrupting me.', 'He is always to interrupt me.'], a: 1, why: 'Раздражающая привычка с always — Present Continuous: is always interrupting.' },
        { t: 'gap', q: 'Students in my group usually ___ (revise) late at night.', a: ['revise'], why: 'Usually → Present Simple. «Students» — множественное число: revise.' },
        { t: 'mcq', q: 'This soup ___ delicious.', o: ['tastes', 'is tasting', 'taste', 'are tasting'], a: 0, why: 'Taste в значении «иметь вкус» — глагол состояния: Present Simple, 3-е лицо ед. числа.' },
        { t: 'gap', q: 'Nurlan ___ (not / work) today because he is ill.', a: ['isn’t working', 'is not working', 'isn\'t working'], why: 'Временная ситуация сегодня — Present Continuous: is not working.' },
        { t: 'mcq', q: 'How often ___ you visit your grandparents?', o: ['do', 'are', 'does', 'have'], a: 0, why: '«How often» → регулярность → Present Simple, вспомогательный do.' },
        { t: 'mcq', q: 'The graph ___ that women account for 54% of all students.', o: ['shows', 'is showing', 'show', 'shown'], a: 0, why: 'Факт, который показывает график, — Present Simple: shows.' },
        { t: 'gap', q: 'More young people ___ (choose) to study online these days.', a: ['are choosing'], why: 'Меняющаяся тенденция, these days → Present Continuous: are choosing.' },
        { t: 'mcq', q: 'I ___ lunch right now, so I can’t talk.', o: ['have', 'am having', 'having', 'has'], a: 1, why: 'Have в значении «обедать» — обычный глагол действия, поэтому Continuous: am having.' },
      ],
    },
    {
      id: 'past-tenses', n: 2, title: 'Past tenses', ru: 'Прошедшие времена',
      theory: `## Past Simple — законченное действие в прошлом
• Правильные глаголы: **-ed** (visited), неправильные — вторая форма (go → {{o:went}}, see → {{o:saw}}, write → {{o:wrote}}).
• Вопрос и отрицание: **did / didn’t** + глагол без окончания: Did you {{b:see}}? I didn’t {{b:see}} him.
>? We {{g:visited}} Turkistan last summer. · She {{g:went}} to Almaty in 2019.
• Маркеры: yesterday, last week, in 2019, two days ago, when I was a child.
## Past Continuous — процесс в прошлом
• Форма: **was / were + глагол с -ing**.
• Фон для другого действия: While I {{g:was reading}}, the phone {{r:rang}}. (процесс — Continuous, событие — Simple)
• Что происходило в конкретный момент: What were you doing at 8 o’clock yesterday?
## Past Perfect — действие до другого прошлого
• Форма: **had + третья форма глагола**.
>? When I arrived, the lesson {{p:had started}}. · By the time we reached the station, the train {{p:had left}}.
• Сначала — Past Perfect, потом — Past Simple.
## used to и would — привычки в прошлом
• **used to + глагол**: He {{b:used to live}} in Shymkent (привычка и состояние).
• **would + глагол**: When I was young, I {{b:would play}} football every day (только повторяющиеся действия, не состояния).
>! Отрицание и вопрос: didn’t {{r:use}} to, Did you {{r:use}} to…? (без -d).
>+ Подсказка: два прошлых действия подряд — оба Simple; одно длилось, другое случилось — Continuous + Simple; одно произошло раньше другого — Past Perfect.`,
      ex: [
        { t: 'mcq', q: 'We ___ Turkistan last summer.', o: ['visited', 'were visiting', 'have visited', 'visit'], a: 0, why: 'Last summer — законченное время в прошлом: Past Simple.' },
        { t: 'mcq', q: 'When I arrived, the lesson ___.', o: ['started', 'has started', 'had started', 'was starting'], a: 2, why: 'Урок начался раньше моего прихода — Past Perfect: had started.' },
        { t: 'gap', q: 'While I ___ (read), the phone rang.', a: ['was reading'], why: 'Процесс, который прервали, — Past Continuous: was reading.' },
        { t: 'mcq', q: 'I ___ him yesterday.', o: ['didn’t saw', 'didn’t see', 'not saw', 'don’t see'], a: 1, why: 'После did / didn’t глагол без окончания: didn’t see.' },
        { t: 'gap', q: 'She ___ (go) to Almaty in 2019.', a: ['went'], why: 'In 2019 — Past Simple; go — неправильный глагол: went.' },
        { t: 'mcq', q: '___ TV when I called?', o: ['Were you watching', 'Did you watch', 'Are you watching', 'Had you watched'], a: 0, why: 'Спрашиваем о процессе в момент звонка — Past Continuous: Were you watching.' },
        { t: 'mcq', q: 'He ___ in Shymkent when he was a child.', o: ['used to live', 'use to live', 'was used live', 'uses to live'], a: 0, why: 'Состояние в прошлом: used to live (в утверждении — used с -d).' },
        { t: 'gap', q: 'They ___ (not / finish) the project before the deadline.', a: ['didn’t finish', 'did not finish', 'didn\'t finish'], why: 'Отрицание Past Simple: did not + глагол без окончания.' },
        { t: 'mcq', q: 'By the time we reached the station, the train ___.', o: ['left', 'had left', 'was leaving', 'has left'], a: 1, why: 'By the time + прошлое: поезд ушёл раньше — Past Perfect: had left.' },
        { t: 'mcq', q: 'It was raining when we ___ home.', o: ['leave', 'left', 'were leaving', 'had left'], a: 1, why: 'Дождь шёл (фон — Continuous), а уход из дома — событие: Past Simple.' },
        { t: 'gap', q: 'What ___ you doing at 8 o’clock yesterday evening?', a: ['were'], why: 'Вопрос в Past Continuous: were + you + doing.' },
        { t: 'mcq', q: 'She ___ the exam because she had studied hard.', o: ['passed', 'was passing', 'had passed', 'has passed'], a: 0, why: 'Сдать экзамен — событие в прошлом (Past Simple); учёба была раньше (had studied).' },
        { t: 'mcq', q: 'I ___ my keys, so I couldn’t get in.', o: ['lost', 'had lost', 'was losing', 'have lost'], a: 1, why: 'Потеря произошла раньше, чем я не смог войти, — Past Perfect: had lost.' },
        { t: 'gap', q: 'Did you ___ (see) the film last night?', a: ['see'], why: 'После did глагол стоит без окончания: see.' },
        { t: 'mcq', q: 'When I was young, I ___ play football every day.', o: ['would', 'was', 'did', 'am'], a: 0, why: 'Повторяющееся действие в прошлом выражается через would или used to.' },
      ],
    },
    {
      id: 'articles', n: 3, title: 'Articles', ru: 'Артикли',
      theory: `## a / an — «один из многих», первое упоминание
• **a** перед согласным **звуком**: a book, a {{o:university}} (/ju:/), a one-way ticket.
• **an** перед гласным **звуком**: an apple, an {{o:hour}} (h не читается), an MP.
>? I have {{g:a}} sister. She works at {{g:a}} university in Almaty. · She is {{g:an}} engineer.
## the — известное или единственное
• уже упомянутое: I bought a book. {{g:The}} book was interesting.
• единственное в своём роде: the sun, the Internet, the capital of Kazakhstan.
• превосходная степень и порядковые числа: the best student, the first lesson.
• реки, моря, океаны, горные цепи: the Syr Darya, the Caspian Sea, the Alps.
• страны во множественном числе или с Republic / Kingdom / States: the USA, the UK.
• музыкальные инструменты: play the guitar.
## Нулевой артикль (артикля нет)
| Что | Пример |
|---|
| неисчисляемые и множественное в общем смысле | Water is important. Books are expensive. |
| языки, еда (приёмы пищи), виды спорта | speak Kazakh, have breakfast, play football |
| страны, города, континенты | Kazakhstan, Almaty, Central Asia |
| озёра и отдельные горы | Lake Balkhash, Mount Everest |
| school, work, home, bed в общем смысле | go to school, at work, at home |
>! Ловушка: {{r:the}} ставится перед Syr Darya (река), но не перед Lake Balkhash (озеро).
>+ Подсказка: артикль зависит от **звука**, а не от буквы (an hour, a university).`,
      ex: [
        { t: 'mcq', q: 'She is ___ engineer.', o: ['a', 'an', 'the', 'no article'], a: 1, why: 'Engineer начинается с гласного звука — an.' },
        { t: 'mcq', q: '___ Sun is a star.', o: ['A', 'The', 'An', 'No article'], a: 1, why: 'Солнце одно — определённый артикль the.' },
        { t: 'gap', q: 'She works at ___ university in Almaty.', a: ['a'], why: 'University начинается с согласного звука /j/ — артикль a.' },
        { t: 'mcq', q: 'Kazakhstan is in ___ Central Asia.', o: ['the', 'a', 'an', 'no article'], a: 3, why: 'Названия регионов и стран обычно без артикля.' },
        { t: 'mcq', q: 'We crossed ___ Syr Darya.', o: ['a', 'the', 'an', 'no article'], a: 1, why: 'Перед названиями рек ставится the.' },
        { t: 'mcq', q: 'My brother plays ___ guitar.', o: ['the', 'a', 'no article', 'an'], a: 0, why: 'С музыкальными инструментами употребляется the.' },
        { t: 'mcq', q: 'He is ___ best student in our group.', o: ['a', 'the', 'an', 'no article'], a: 1, why: 'Превосходная степень почти всегда с the.' },
        { t: 'mcq', q: '___ English is spoken all over the world.', o: ['The', 'A', 'No article', 'An'], a: 2, why: 'Названия языков употребляются без артикля.' },
        { t: 'gap', q: 'Can I have ___ glass of water, please?', a: ['a'], why: 'Один стакан, glass начинается с согласного: a.' },
        { t: 'mcq', q: 'Children go to ___ school at the age of six.', o: ['the', 'a', 'an', 'no article'], a: 3, why: 'School в общем смысле (как учреждение, учёба) — без артикля.' },
        { t: 'mcq', q: 'I bought a book and a magazine. ___ book was interesting.', o: ['The', 'A', 'An', 'No article'], a: 0, why: 'Книга уже упомянута — the.' },
        { t: 'mcq', q: 'What ___ beautiful day!', o: ['a', 'the', 'an', 'no article'], a: 0, why: 'В восклицаниях «What + исчисляемое существительное в ед. числе» нужен a.' },
        { t: 'mcq', q: '___ Lake Balkhash is in Kazakhstan.', o: ['The', 'A', 'An', 'No article'], a: 3, why: 'Перед названиями озёр артикля нет.' },
        { t: 'gap', q: 'He has been to ___ UK three times.', a: ['the'], why: 'United Kingdom — название с Kingdom, ставится the.' },
        { t: 'mcq', q: 'Do you have ___ breakfast at eight?', o: ['a', 'the', 'an', 'no article'], a: 3, why: 'С названиями приёмов пищи артикль обычно не нужен.' },
      ],
    },
  ],
  soon: [
    { n: 4, title: 'Present perfect', ru: 'Present perfect' },
    { n: 5, title: 'Future forms', ru: 'Будущее время' },
    { n: 6, title: 'Modal verbs', ru: 'Модальные глаголы' },
    { n: 7, title: 'Conditionals', ru: 'Условные предложения' },
    { n: 8, title: 'Passive voice', ru: 'Страдательный залог' },
    { n: 9, title: 'Reported speech', ru: 'Косвенная речь' },
    { n: 10, title: 'Noun, pronoun', ru: 'Существительное, местоимение' },
    { n: 11, title: 'Adjective, adverb', ru: 'Прилагательное, наречие' },
    { n: 12, title: 'Prepositions', ru: 'Предлоги' },
  ],
};
