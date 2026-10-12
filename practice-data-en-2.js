/* Юниты 4–12 практики по английской грамматике (продолжение practice-data-en.js). Формат разметки и упражнений тот же. */
(function () {
  var U = window.PRACTICE_EN.units;

  U.push({
    id: 'present-perfect', n: 4, title: 'Present perfect', ru: 'Настоящее совершённое время',
    theory: `## Present Perfect — связь прошлого с настоящим
• Форма: **have / has + третья форма глагола (V3)**: I {{g:have lost}} my keys. She {{g:has lived}} here for five years.
• Когда употребляется:
| Значение | Пример |
|---|
| результат виден сейчас | I’ve lost my keys (и сейчас не могу войти). |
| жизненный опыт | Have you {{o:ever}} been to Turkistan? |
| действие началось в прошлом и продолжается | I’ve lived here {{b:for}} five years / {{b:since}} 2019. |
| недавно закончилось | I’ve {{p:just}} finished my homework. |
• Слова-маркеры: **just, already, yet, ever, never, so far, recently, lately, this week / this year**.
## for и since
• **for** + период: for ten years, for two hours. **since** + момент начала: since 2018, since June.
## Present Perfect или Past Simple
>! Если названо конкретное время в прошлом (yesterday, last year, in 2019, two days ago) — только {{r:Past Simple}}: I {{r:saw}} him yesterday.
• been и gone: She has **been** to London (была и вернулась). She has **gone** to London (уехала и сейчас там).
## Present Perfect Continuous
• Форма: **have / has been + глагол с -ing**. Подчёркивает длительность или недавний результат: I’ve been studying for three hours (я устал).
>+ Подсказка: «уже сколько?» — How long have you …? → Perfect; «когда именно?» — When did you …? → Past Simple.`,
    ex: [
      { t: 'mcq', q: 'I ___ my keys, so I can’t open the door.', o: ['have lost', 'lost', 'was losing', 'am losing'], a: 0, why: 'Результат важен сейчас (ключей нет) — Present Perfect: have lost.' },
      { t: 'mcq', q: 'She has lived in Almaty ___ 2018.', o: ['for', 'since', 'during', 'from'], a: 1, why: 'После 2018 назван момент начала — since.' },
      { t: 'mcq', q: 'They have been married ___ ten years.', o: ['since', 'for', 'from', 'during'], a: 1, why: 'Ten years — период, поэтому for.' },
      { t: 'gap', q: 'Have you ever ___ (visit) Turkistan?', a: ['visited'], why: 'Present Perfect: have + V3. Visit — правильный глагол: visited.' },
      { t: 'mcq', q: 'I ___ him yesterday.', o: ['have seen', 'saw', 'have saw', 'see'], a: 1, why: 'Yesterday — конкретное прошедшее время, поэтому Past Simple: saw.' },
      { t: 'mcq', q: 'He isn’t here. He ___ to the library.', o: ['has gone', 'has been', 'went', 'goes'], a: 0, why: 'Ушёл и сейчас там — has gone. «Has been» значит «был и вернулся».' },
      { t: 'mcq', q: 'I’ve ___ finished my homework.', o: ['yet', 'just', 'ago', 'last'], a: 1, why: 'Just — «только что», стоит между have и V3.' },
      { t: 'mcq', q: 'Have you finished the report ___?', o: ['yet', 'already', 'just', 'ever'], a: 0, why: 'В вопросах «уже» выражается словом yet в конце предложения.' },
      { t: 'gap', q: 'We ___ (not / see) each other since June.', a: ['haven’t seen', 'have not seen', 'haven\'t seen'], why: 'Since June — действие тянется до сих пор: have not seen.' },
      { t: 'mcq', q: 'I’ve never ___ sushi.', o: ['eaten', 'ate', 'eat', 'eating'], a: 0, why: 'После have — третья форма: eat → eaten.' },
      { t: 'gap', q: 'How long have you ___ (know) Aigerim?', a: ['known'], why: 'Have + V3: know → known.' },
      { t: 'mcq', q: 'I’m tired. I ___ for three hours.', o: ['have been studying', 'study', 'am studying', 'studied'], a: 0, why: 'Длительность и недавний результат — Present Perfect Continuous.' },
      { t: 'mcq', q: 'When ___ this university?', o: ['did you join', 'have you joined', 'do you join', 'are you joining'], a: 0, why: 'Вопрос «когда» о конкретном моменте — Past Simple.' },
      { t: 'mcq', q: 'It’s the first time I ___ a plane.', o: ['have taken', 'take', 'took', 'am taking'], a: 0, why: 'После «It’s the first time» ставится Present Perfect.' },
      { t: 'gap', q: 'My sister ___ (live) in Astana since 2020.', a: ['has lived'], why: 'Since 2020 → Present Perfect, she → has lived.' },
    ],
  });

  U.push({
    id: 'future-forms', n: 5, title: 'Future forms', ru: 'Способы выражения будущего',
    theory: `## Какой вариант выбрать
| Форма | Когда | Пример |
|---|
| **will** + глагол | решение в момент речи, обещание, предсказание | I’ll answer it. I’ll help you. |
| **be going to** | заранее принятый план, очевидный признак | I’m going to apply. It’s going to rain. |
| **Present Continuous** | договорённость, назначенная встреча | I’m meeting my supervisor at 3. |
| **Present Simple** | расписание | The train leaves at 18:30. |
## Future Continuous и Future Perfect
• **will be + -ing** — процесс в определённый момент будущего: This time next week I’ll be {{g:lying}} on the beach.
• **will have + V3** — завершится к определённому моменту: By 2030 she {{o:will have finished}} her PhD. Часто с **by**.
## Придаточные времени и условия
>! После when, as soon as, before, after, until, if будущее время выражается через {{r:Present Simple}}, а не will: I’ll call you when I {{r:arrive}}. If it {{r:rains}}, we’ll stay at home.
• may / might + глагол — возможное будущее: It might rain.
>+ Подсказка: слышите «решил сейчас» — will; «давно собираюсь» — going to; «договорился на время» — Present Continuous.`,
    ex: [
      { t: 'mcq', q: 'Look at those black clouds. It ___ rain.', o: ['will', 'is going to', 'is raining', 'rains'], a: 1, why: 'Есть очевидный признак (тучи) — be going to.' },
      { t: 'mcq', q: 'The phone is ringing. — I ___ answer it.', o: ['will', 'am going to', 'am answering', 'answer'], a: 0, why: 'Решение принято в момент речи — will.' },
      { t: 'mcq', q: 'I ___ my supervisor at 3 p.m. tomorrow; we’ve arranged it.', o: ['meet', 'am meeting', 'will meet', 'meets'], a: 1, why: 'Договорённость на конкретное время — Present Continuous.' },
      { t: 'mcq', q: 'The train ___ at 18:30 tomorrow.', o: ['leaves', 'is going to leave', 'will leave', 'has left'], a: 0, why: 'Расписание транспорта — Present Simple.' },
      { t: 'gap', q: 'I’ll call you as soon as I ___ (arrive).', a: ['arrive'], why: 'После as soon as будущее выражается Present Simple: arrive.' },
      { t: 'mcq', q: 'If it ___ tomorrow, we will stay at home.', o: ['will rain', 'rains', 'is raining', 'rained'], a: 1, why: 'В придаточном условия — Present Simple: rains.' },
      { t: 'mcq', q: 'This time next week I ___ on the beach.', o: ['will lie', 'will be lying', 'lie', 'am lie'], a: 1, why: 'Процесс в определённый момент будущего — Future Continuous.' },
      { t: 'mcq', q: 'By 2030 she ___ her PhD.', o: ['will finish', 'will have finished', 'is finishing', 'finishes'], a: 1, why: 'By + момент в будущем → Future Perfect: will have finished.' },
      { t: 'gap', q: 'He ___ (study) medicine after school; he has already applied.', a: ['is going to study'], why: 'План уже принят и действия предприняты — be going to.' },
      { t: 'mcq', q: 'I think Kazakhstan ___ the final.', o: ['wins', 'will win', 'is winning', 'is going win'], a: 1, why: 'Предсказание-мнение после I think — will.' },
      { t: 'mcq', q: 'Don’t worry. I ___ you with your luggage.', o: ['will help', 'am helping', 'help', 'helped'], a: 0, why: 'Предложение помощи на месте — will.' },
      { t: 'gap', q: 'We’ll go out when the rain ___ (stop).', a: ['stops'], why: 'После when — Present Simple: the rain stops.' },
      { t: 'mcq', q: 'I promise I ___ late again.', o: ['won’t be', 'am not going', 'don’t be', 'not will be'], a: 0, why: 'Обещание — will; отрицание — won’t be.' },
      { t: 'mcq', q: 'Will you have finished the project ___ Friday?', o: ['by', 'until', 'on', 'at'], a: 0, why: 'By Friday — «не позже пятницы», с Future Perfect.' },
      { t: 'gap', q: 'What time ___ the lecture start tomorrow?', a: ['does'], why: 'Расписание — Present Simple, вопрос с does.' },
    ],
  });

  U.push({
    id: 'modal-verbs', n: 6, title: 'Modal verbs', ru: 'Модальные глаголы',
    theory: `## Основные значения
| Значение | Глаголы | Пример |
|---|
| способность | can, could | She {{g:could}} speak three languages at ten. |
| разрешение | can, could, may | {{g:May}} I borrow your pen? |
| обязанность | must, have to | Students {{o:have to}} submit the form. |
| запрет | mustn’t | You {{r:mustn’t}} smoke here. |
| отсутствие необходимости | don’t have to, needn’t | You {{b:don’t have to}} bring a pen. |
| совет | should, ought to | You {{g:should}} see a doctor. |
| предположение | must, may, might, can’t | He’s tired — he {{p:must}} be. |
## Важно
• После модального глагола — инфинитив без to: must {{b:go}}. Исключение — ought **to**.
• **mustn’t** — «нельзя», **don’t have to / needn’t** — «не нужно». Это разные вещи.
• Предположение о настоящем: must (уверен «да»), can’t (уверен «нет»), may / might (возможно).
## Модальные глаголы в прошлом
• **should have + V3** — надо было сделать (но не сделал): You {{o:should have told}} me earlier.
• **must have + V3** — наверняка было: The lights are off — they {{p:must have gone}} to bed.
• **could have + V3** — мог бы сделать.
>+ Подсказка: вопрос вежливо — could, may; приказ и правило — must / have to.`,
    ex: [
      { t: 'mcq', q: 'You ___ smoke here. It’s forbidden.', o: ['mustn’t', 'don’t have to', 'needn’t', 'ought'], a: 0, why: 'Запрет — mustn’t.' },
      { t: 'mcq', q: 'You ___ bring a pen; we provide them.', o: ['mustn’t', 'don’t have to', 'can’t', 'shouldn’t'], a: 1, why: 'Не обязательно — don’t have to.' },
      { t: 'mcq', q: 'She ___ speak three languages when she was ten.', o: ['can', 'could', 'must', 'may'], a: 1, why: 'Способность в прошлом — could.' },
      { t: 'mcq', q: 'He’s been working all day. He ___ be tired.', o: ['must', 'can’t', 'needn’t', 'mustn’t'], a: 0, why: 'Уверенное предположение — must.' },
      { t: 'mcq', q: 'That ___ be Aidar — he’s in Paris this week.', o: ['must', 'can’t', 'should', 'ought'], a: 1, why: 'Уверенное отрицание — can’t be.' },
      { t: 'mcq', q: 'You look pale. You ___ see a doctor.', o: ['should', 'must be', 'may', 'can’t'], a: 0, why: 'Совет — should.' },
      { t: 'mcq', q: '___ I borrow your pen?', o: ['May', 'Must', 'Should', 'Need'], a: 0, why: 'Вежливая просьба о разрешении — May I…?' },
      { t: 'gap', q: 'You ___ (need) to hurry. We have plenty of time.', a: ['don’t need', 'do not need', 'needn’t', 'don\'t need'], why: 'Нет необходимости — don’t need to или needn’t.' },
      { t: 'mcq', q: 'I’m not sure, but she ___ be at the library.', o: ['might', 'mustn’t', 'has to', 'will'], a: 0, why: 'Возможность без уверенности — might.' },
      { t: 'mcq', q: 'You ___ have told me earlier!', o: ['should', 'must', 'may', 'can'], a: 0, why: 'Упрёк за несделанное — should have + V3.' },
      { t: 'mcq', q: 'We ___ wear uniforms at school. It’s the rule.', o: ['have to', 'mustn’t', 'might', 'could'], a: 0, why: 'Обязанность по правилу — have to.' },
      { t: 'mcq', q: 'The lights are off. They ___ have gone to bed.', o: ['must', 'can’t', 'should', 'may not'], a: 0, why: 'Логичный вывод о прошлом — must have + V3.' },
      { t: 'gap', q: 'Students ___ (have) to submit the form by Friday.', a: ['have'], why: 'Have to во множественном числе: have to.' },
      { t: 'mcq', q: '___ you help me with this task, please?', o: ['Could', 'Must', 'Ought', 'Should'], a: 0, why: 'Вежливая просьба — Could you…?' },
      { t: 'mcq', q: 'You ___ apologise to her.', o: ['ought to', 'ought', 'should to', 'must to'], a: 0, why: 'Ought всегда с to: ought to.' },
    ],
  });

  U.push({
    id: 'conditionals', n: 7, title: 'Conditionals', ru: 'Условные предложения',
    theory: `## Четыре типа
| Тип | Структура | Пример |
|---|
| **Zero** — всегда верно | If + Present, Present | If you heat water to 100°C, it {{g:boils}}. |
| **First** — реальное будущее | If + Present, **will** + глагол | If it {{g:rains}}, we {{g:will stay}} at home. |
| **Second** — нереальное или маловероятное | If + Past Simple, **would** + глагол | If I {{o:had}} a million, I {{o:would buy}} an island. |
| **Third** — нереальное прошлое | If + Past Perfect, **would have** + V3 | If she {{p:had studied}}, she {{p:would have passed}}. |
## Особенности
• После if не ставят will и would: If I {{r:have}} time, I’ll help you.
• В Second Conditional с be употребляют **were** для всех лиц: If I {{b:were}} you, I would apply.
• **unless** = if … not: {{b:Unless}} you hurry, you’ll miss the bus.
• **as long as, provided that** — «при условии, что» (как if): As long as you work hard, you’ll pass.
## wish — сожаление
• О настоящем: I wish I {{o:had}} more free time. (Past Simple)
• О прошлом: I wish I {{p:had gone}} to the party. (Past Perfect)
>+ Подсказка: определите, **реально** ли условие: реально — First, нереально сейчас — Second, нереально в прошлом — Third.`,
    ex: [
      { t: 'mcq', q: 'If you heat water to 100°C, it ___.', o: ['boils', 'will boil', 'would boil', 'boiled'], a: 0, why: 'Научный факт — Zero Conditional: Present + Present.' },
      { t: 'mcq', q: 'If I ___ enough time, I’ll help you.', o: ['have', 'will have', 'had', 'would have'], a: 0, why: 'First Conditional: после if — Present Simple.' },
      { t: 'mcq', q: 'If I ___ a million dollars, I would buy an island.', o: ['have', 'had', 'will have', 'would have'], a: 1, why: 'Second Conditional: if + Past Simple.' },
      { t: 'mcq', q: 'If she had studied harder, she ___ the exam.', o: ['would pass', 'would have passed', 'will pass', 'passed'], a: 1, why: 'Third Conditional: if + Past Perfect, would have + V3.' },
      { t: 'gap', q: 'I wish I ___ (have) more free time.', a: ['had'], why: 'Wish о настоящем — Past Simple: had.' },
      { t: 'mcq', q: '___ you hurry, you’ll miss the bus.', o: ['Unless', 'If', 'Until', 'Although'], a: 0, why: 'Unless = if … not: «если не поторопишься».' },
      { t: 'mcq', q: 'If I ___ you, I would apply for that scholarship.', o: ['am', 'was', 'were', 'will be'], a: 2, why: 'В устойчивом обороте If I were you — were.' },
      { t: 'gap', q: 'If it rains tomorrow, we ___ (stay) at home.', a: ['will stay', 'll stay', '’ll stay', 'will stay at home'], why: 'First Conditional: will + глагол.' },
      { t: 'mcq', q: 'If he ___ earlier, he wouldn’t have missed the train.', o: ['had left', 'left', 'would leave', 'has left'], a: 0, why: 'Third Conditional: if + Past Perfect.' },
      { t: 'mcq', q: 'What would you do if you ___ your passport abroad?', o: ['lose', 'lost', 'will lose', 'would lose'], a: 1, why: 'Second Conditional: if + Past Simple.' },
      { t: 'mcq', q: 'I ___ go out if it stops raining.', o: ['will', 'would', 'am', 'had'], a: 0, why: 'Условие реальное (stops — Present) → will.' },
      { t: 'gap', q: 'If you mix red and blue, you ___ (get) purple.', a: ['get'], why: 'Общеизвестный факт — Zero Conditional: Present Simple.' },
      { t: 'mcq', q: 'I wish I ___ to the party last night.', o: ['went', 'had gone', 'would go', 'go'], a: 1, why: 'Сожаление о прошлом — wish + Past Perfect.' },
      { t: 'mcq', q: 'He would be fitter if he ___ more.', o: ['exercised', 'exercises', 'will exercise', 'had exercised'], a: 0, why: 'Нереальное условие в настоящем — if + Past Simple.' },
      { t: 'mcq', q: 'As long as you ___ hard, you’ll pass.', o: ['work', 'will work', 'worked', 'would work'], a: 0, why: 'As long as, как и if, требует Present Simple.' },
    ],
  });

  U.push({
    id: 'passive-voice', n: 8, title: 'Passive voice', ru: 'Страдательный залог',
    theory: `## Форма: be + третья форма глагола (V3)
| Время | Пример |
|---|
| Present Simple | English {{g:is spoken}} all over the world. |
| Past Simple | The Baiterek Tower {{g:was built}} in 1997. |
| Present Perfect | The report {{o:has been finished}}. |
| Future Simple | The results {{o:will be announced}} next week. |
| Present Continuous | The room {{p:is being cleaned}} now. |
| с модальным глаголом | The documents must {{b:be signed}}. |
## Когда употребляют
• Исполнитель неизвестен или неважен: My bike {{g:was stolen}}.
• Интересует результат или объект: Cars {{g:are made}} in this factory.
• Исполнитель — через **by**: The window was broken {{b:by the children}}.
## Как превратить в пассив
>? They built the bridge. → The bridge {{p:was built}} (by them). Объект становится подлежащим, глагол — be + V3.
• Время глагола be сохраняется: Present → am/is/are, Past → was/were, Perfect → has/have been.
## have something done
• Услуга, которую делают для вас: I {{o:have}} my hair {{o:cut}} every month.
>! Ловушка: не путайте «is built» (строится сейчас — is being built).`,
    ex: [
      { t: 'mcq', q: 'The Baiterek Tower ___ in 1997.', o: ['built', 'was built', 'is built', 'has built'], a: 1, why: 'Прошедшее время + пассив: was built.' },
      { t: 'mcq', q: 'English ___ all over the world.', o: ['speaks', 'is spoken', 'spoke', 'has spoken'], a: 1, why: 'Present Simple Passive: is spoken.' },
      { t: 'gap', q: 'The results ___ (announce) next week.', a: ['will be announced'], why: 'Future Passive: will be + V3.' },
      { t: 'mcq', q: 'The report ___ yet.', o: ['hasn’t been finished', 'hasn’t finished', 'wasn’t finish', 'isn’t finish'], a: 0, why: 'Present Perfect Passive: has not been finished.' },
      { t: 'mcq', q: 'The thief ___ by the police yesterday.', o: ['caught', 'was caught', 'has caught', 'is caught'], a: 1, why: 'Yesterday — Past Simple Passive: was caught.' },
      { t: 'gap', q: 'Cars ___ (make) in this factory.', a: ['are made'], why: 'Present Simple Passive, множественное число: are made.' },
      { t: 'mcq', q: 'The documents must ___ before Friday.', o: ['sign', 'be signed', 'signed', 'being signed'], a: 1, why: 'Модальный глагол + be + V3: must be signed.' },
      { t: 'mcq', q: 'I ___ my hair cut every month.', o: ['have', 'make', 'am', 'do'], a: 0, why: 'Услугу выражают конструкцией have + объект + V3.' },
      { t: 'mcq', q: 'The room ___ at the moment.', o: ['is cleaning', 'is being cleaned', 'is cleaned', 'cleans'], a: 1, why: 'Процесс сейчас в пассиве — is being cleaned.' },
      { t: 'gap', q: 'Many languages ___ (speak) in Kazakhstan.', a: ['are spoken'], why: 'Present Simple Passive: are spoken.' },
      { t: 'mcq', q: 'The window ___ by the children.', o: ['broke', 'was broken', 'is breaking', 'broken'], a: 1, why: 'Прошедшее время пассива: was broken.' },
      { t: 'mcq', q: 'Выберите предложение в страдательном залоге.', o: ['The bridge was built in 2010.', 'They built the bridge.', 'The bridge built a lot.', 'Building the bridge.'], a: 0, why: 'Страдательный залог — be + V3: was built.' },
      { t: 'mcq', q: 'The new law ___ next month.', o: ['will introduce', 'will be introduced', 'is introducing', 'introduced'], a: 1, why: 'Будущее в пассиве: will be introduced.' },
      { t: 'gap', q: 'The students ___ (give) a test every Friday.', a: ['are given'], why: 'Регулярное действие, пассив: are given.' },
      { t: 'mcq', q: 'By whom ___ the letter written?', o: ['was', 'were', 'is', 'did'], a: 0, why: 'Letter — единственное число, прошедшее время: was written.' },
    ],
  });

  U.push({
    id: 'reported-speech', n: 9, title: 'Reported speech', ru: 'Косвенная речь',
    theory: `## Сдвиг времён (backshift)
| Прямая речь | Косвенная речь |
|---|
| Present Simple | Past Simple |
| Present Continuous | Past Continuous |
| Present Perfect / Past Simple | **Past Perfect** |
| will | **would** |
| can | **could** |
| must | **had to** |
>? “I {{g:am}} tired,” she said. → She said that she {{g:was}} tired.
## Слова времени и места меняются
| now → **then** | today → **that day** | tomorrow → **the next day** |
| yesterday → **the day before** | here → **there** | this → **that** |
## Вопросы
• Порядок слов — как в утверждении, без do и вопросительной интонации: “Where do you live?” → He asked where I {{o:lived}}.
• Общие вопросы — через **if / whether**: “Are you ready?” → She asked {{o:if I was}} ready.
## Приказы и просьбы
• **told / asked + кто + (not) to + глагол**: “Close the door,” → She told us {{b:to close}} the door. “Don’t be late” → She told him {{b:not to be}} late.
## say и tell
• **tell** + кому: He {{r:told me}} that … **say** без дополнения: He {{r:said}} that …
>+ Подсказка: если глагол вводящий в прошедшем (said, asked), время «сдвигается» на шаг назад.`,
    ex: [
      { t: 'mcq', q: '“I am tired,” she said. → She said that she ___ tired.', o: ['is', 'was', 'were', 'has been'], a: 1, why: 'Present Simple сдвигается в Past Simple: am → was.' },
      { t: 'mcq', q: '“We will help you,” they said. → They said they ___ help me.', o: ['will', 'would', 'can', 'had'], a: 1, why: 'Will → would.' },
      { t: 'mcq', q: '“I visited Almaty,” he said. → He said he ___ Almaty.', o: ['visited', 'had visited', 'has visited', 'visits'], a: 1, why: 'Past Simple сдвигается в Past Perfect: had visited.' },
      { t: 'gap', q: '“I can swim,” she said. → She said she ___ swim.', a: ['could'], why: 'Can → could.' },
      { t: 'mcq', q: '“Where do you live?” he asked me. → He asked me where I ___.', o: ['live', 'lived', 'do live', 'am living'], a: 1, why: 'В косвенном вопросе — прямой порядок слов и Past Simple.' },
      { t: 'mcq', q: '“Are you ready?” she asked. → She asked ___.', o: ['if I was ready', 'was I ready', 'that I ready', 'if was I ready'], a: 0, why: 'Общий вопрос → if + подлежащее + глагол.' },
      { t: 'mcq', q: '“Close the door,” the teacher said. → The teacher told us ___ the door.', o: ['close', 'to close', 'closing', 'that close'], a: 1, why: 'Приказ в косвенной речи — to + инфинитив.' },
      { t: 'mcq', q: '“I’ll call you tomorrow,” he said. → He said he would call me ___.', o: ['tomorrow', 'the next day', 'yesterday', 'today'], a: 1, why: 'Tomorrow → the next day.' },
      { t: 'gap', q: '“I must go now,” she said. → She said she ___ go then.', a: ['had to'], why: 'Must → had to.' },
      { t: 'mcq', q: 'He ___ me that he was busy.', o: ['said', 'told', 'spoke', 'asked'], a: 1, why: 'После tell нужно дополнение (me): told me.' },
      { t: 'mcq', q: '“Don’t be late,” she told him. → She told him ___ late.', o: ['not be', 'not to be', 'don’t be', 'to not being'], a: 1, why: 'Отрицательный приказ — not to + инфинитив.' },
      { t: 'mcq', q: '“I have finished the work,” he said. → He said he ___ the work.', o: ['has finished', 'had finished', 'finished', 'finishes'], a: 1, why: 'Present Perfect → Past Perfect.' },
      { t: 'gap', q: '“Why are you crying?” she asked him. → She asked him why he ___ crying.', a: ['was'], why: 'Present Continuous → Past Continuous: was crying.' },
      { t: 'mcq', q: '“I live here,” she said. → She said she lived ___.', o: ['here', 'there', 'this', 'these'], a: 1, why: 'Here → there.' },
      { t: 'mcq', q: '“Did you see the film?” he asked. → He asked if I ___ the film.', o: ['saw', 'had seen', 'have seen', 'see'], a: 1, why: 'Past Simple в вопросе сдвигается в Past Perfect.' },
    ],
  });

  U.push({
    id: 'noun-pronoun', n: 10, title: 'Noun, pronoun', ru: 'Существительное и местоимение',
    theory: `## Исчисляемые и неисчисляемые
• Неисчисляемые (без -s, без a/an, глагол в ед. числе): **advice, information, news, furniture, luggage, money, homework, weather**.
>! {{r:advices}}, {{r:informations}}, {{r:homeworks}} — не существуют. Правильно: some {{g:advice}}, a piece of information.
• **much** — с неисчисляемыми (much money), **many** — с исчисляемыми (many people), **a lot of** — с обоими.
• **few / a few** — исчисляемые; **little / a little** — неисчисляемые. A few = «несколько» (достаточно), few = «мало» (почти нет).
## Множественное число
• Обычно **+ s**; **-es** после s, sh, ch, x, o; **-ies** (study → studies).
| man → {{o:men}} | woman → {{o:women}} | child → {{o:children}} |
| person → {{o:people}} | tooth → {{o:teeth}} | foot → {{o:feet}} |
## Местоимения
| Подлежащее | Дополнение | Притяжательное (+ сущ.) | Самостоятельное | Возвратное |
|---|
| I | me | my | {{g:mine}} | myself |
| she | her | her | hers | {{g:herself}} |
| they | them | their | theirs | themselves |
• **each other** — друг друга (взаимное действие): They help {{b:each other}}.
## Относительные местоимения
• **who** — о людях; **which** — о вещах; **whose** — «чей»; **that** — о людях и вещах: The girl {{g:who}} won the prize. The boy {{g:whose}} bike was stolen.
• **some** — в утверждении, **any** — в отрицании и вопросе: I haven’t got {{o:any}} questions.`,
    ex: [
      { t: 'mcq', q: 'Could you give me some ___?', o: ['advices', 'advice', 'an advice', 'advicees'], a: 1, why: 'Advice — неисчисляемое: some advice.' },
      { t: 'mcq', q: 'There ___ a lot of people in the hall.', o: ['is', 'are', 'was', 'be'], a: 1, why: 'People — множественное число: are.' },
      { t: 'mcq', q: 'How ___ money do you have?', o: ['many', 'much', 'few', 'a few'], a: 1, why: 'Money неисчисляемое — much.' },
      { t: 'gap', q: 'The ___ (child) are playing in the yard.', a: ['children'], why: 'Множественное число child — children.' },
      { t: 'mcq', q: 'This book is ___.', o: ['my', 'mine', 'me', 'I'], a: 1, why: 'Без существительного после — самостоятельное местоимение mine.' },
      { t: 'mcq', q: 'She hurt ___ while cooking.', o: ['her', 'herself', 'she', 'hers'], a: 1, why: 'Действие направлено на себя — herself.' },
      { t: 'mcq', q: 'The girl ___ won the prize is my cousin.', o: ['which', 'who', 'whose', 'what'], a: 1, why: 'О человеке — who.' },
      { t: 'mcq', q: 'I have ___ friends in Almaty, so I’m never alone.', o: ['a few', 'a little', 'much', 'any'], a: 0, why: 'Friends исчисляемое; a few = «несколько».' },
      { t: 'gap', q: 'I haven’t got ___ questions. (some / any)', a: ['any'], why: 'В отрицании употребляется any.' },
      { t: 'mcq', q: 'The news ___ good.', o: ['are', 'is', 'were', 'have'], a: 1, why: 'News выглядит как множественное число, но неисчисляемое — is.' },
      { t: 'mcq', q: 'That’s the boy ___ bike was stolen.', o: ['who', 'which', 'whose', 'whom'], a: 2, why: 'Принадлежность — whose.' },
      { t: 'mcq', q: 'They help ___ with homework.', o: ['themselves', 'each other', 'theirs', 'them'], a: 1, why: 'Взаимное действие — each other.' },
      { t: 'mcq', q: 'I have too much ___ to do.', o: ['homeworks', 'homework', 'a homework', 'homeworkes'], a: 1, why: 'Homework неисчисляемое: much homework.' },
      { t: 'mcq', q: 'The plural of “tooth” is ___.', o: ['tooths', 'teeth', 'teeths', 'toothes'], a: 1, why: 'Исключение: tooth → teeth.' },
      { t: 'gap', q: 'My parents have ___ own business. (they)', a: ['their'], why: 'Перед существительным нужно притяжательное прилагательное: their.' },
    ],
  });

  U.push({
    id: 'adjective-adverb', n: 11, title: 'Adjective, adverb', ru: 'Прилагательное и наречие',
    theory: `## Степени сравнения
| Степень | Правило | Пример |
|---|
| короткие | +er / the +est | tall → {{g:taller}} → the {{g:tallest}} |
| длинные | more / the most | interesting → {{o:more interesting}} → the {{o:most interesting}} |
| исключения | | good → {{r:better}} → {{r:best}}; bad → {{r:worse}} → {{r:worst}}; far → further |
• Сравнение: Almaty is bigger **than** Shymkent. Равенство: as tall **as** me.
## Наречия
• Обычно **прилагательное + -ly**: quick → quickly; но **good → {{b:well}}**: She speaks English very well.
• Совпадают с прилагательными: **fast, hard, late, early**. **hardly** = «едва», **lately** = «в последнее время»: I can {{r:hardly}} hear you.
• Степени: He sings {{g:more beautifully}} than her.
## Порядок прилагательных
• мнение → размер → возраст → форма → **цвет** → происхождение → материал: a {{o:beautiful}} {{o:red}} {{o:silk}} dress.
## -ed и -ing
• **-ed** — человек испытывает чувство: I’m **interested** in history.
• **-ing** — предмет вызывает чувство: The lecture was **boring**.
## too, enough, such, so
• too + прил. (слишком): She is **too short** to reach. прил. + enough: tall **enough**.
• **such** + (a) + сущ.: such a hot day. **so** + прил.: so hot.
## Наречия частоты
• Перед основным глаголом, после be: He {{b:always goes}} to the gym. She is {{b:always}} late.`,
    ex: [
      { t: 'mcq', q: 'She speaks English very ___.', o: ['good', 'well', 'goodly', 'best'], a: 1, why: 'Наречие от good — well.' },
      { t: 'mcq', q: 'Almaty is ___ than Shymkent.', o: ['big', 'bigger', 'more big', 'the biggest'], a: 1, why: 'Короткое прилагательное + -er + than.' },
      { t: 'mcq', q: 'This is the ___ film I have ever seen.', o: ['more interesting', 'most interesting', 'the most interesting', 'interestinger'], a: 2, why: 'Превосходная степень длинного прилагательного: the most + прилагательное.' },
      { t: 'gap', q: 'The exam was ___ (easy) than I expected.', a: ['easier'], why: 'Easy → easier (y → i + er).' },
      { t: 'mcq', q: 'I’m ___ in history; it’s a fascinating subject.', o: ['interesting', 'interested', 'interest', 'interests'], a: 1, why: 'Человек испытывает интерес — interested.' },
      { t: 'mcq', q: 'The lecture was so ___ that I fell asleep.', o: ['bored', 'boring', 'bore', 'bores'], a: 1, why: 'Лекция вызывает скуку — boring.' },
      { t: 'mcq', q: 'She is ___ to reach the top shelf.', o: ['too short', 'short enough', 'enough short', 'very short'], a: 0, why: 'Слишком низкая, чтобы достать — too + прилагательное.' },
      { t: 'mcq', q: 'She bought a ___ dress.', o: ['silk red beautiful', 'beautiful red silk', 'red beautiful silk', 'silk beautiful red'], a: 1, why: 'Порядок: мнение (beautiful) → цвет (red) → материал (silk).' },
      { t: 'gap', q: 'He is the ___ (good) student in our group.', a: ['best'], why: 'Good → best.' },
      { t: 'mcq', q: 'He ___ to the gym on Mondays.', o: ['always goes', 'goes always', 'is going always', 'always go'], a: 0, why: 'Always стоит перед основным глаголом; he → goes.' },
      { t: 'mcq', q: 'The weather is getting ___.', o: ['bad', 'badly', 'worse', 'worst'], a: 2, why: 'Getting + сравнительная степень: worse.' },
      { t: 'mcq', q: 'I can ___ hear you. Speak louder.', o: ['hard', 'hardly', 'hardness', 'harder'], a: 1, why: 'Hardly = «едва, почти не».' },
      { t: 'gap', q: 'My brother is not as tall ___ me.', a: ['as'], why: 'Конструкция not as … as.' },
      { t: 'mcq', q: 'It was ___ a hot day that we stayed inside.', o: ['so', 'such', 'too', 'very'], a: 1, why: 'Such + a + прилагательное + существительное.' },
      { t: 'mcq', q: 'She sings ___ than her sister.', o: ['beautifully', 'more beautifully', 'most beautifully', 'beautifuller'], a: 1, why: 'Сравнительная степень наречия на -ly: more beautifully.' },
    ],
  });

  U.push({
    id: 'prepositions', n: 12, title: 'Prepositions', ru: 'Предлоги',
    theory: `## Предлоги времени
| Предлог | Когда | Пример |
|---|
| **at** | точное время, ночь, выходные | at 9 o’clock, at night, {{g:at}} the weekend |
| **on** | дни и даты | {{o:on}} Monday, {{o:on}} 5 May, on my birthday |
| **in** | месяцы, годы, времена года, части дня | {{b:in}} July, in 2019, in summer, in the morning |
• **for** — период (for two hours), **since** — с момента (since 2018), **during** — в течение (during the lecture), **by** — не позже (by Friday).
## Предлоги места и движения
• **at** — точка (at the station), **in** — внутри (in the city), **on** — на поверхности (on the table).
• **to** — направление, **into** — внутрь, **through** — сквозь, **across** — через (поверхность).
>? She walked {{p:through}} the park. · They arrived {{p:in}} Almaty (город) / at the airport (небольшое место).
## Устойчивые сочетания
| good / bad **at** | interested **in** | afraid / proud **of** |
|---|
| depend **on** | listen **to** | wait **for** |
| look **for** | belong **to** | arrive **in / at** |
## Способ передвижения
• **by** bus, by car, by train; но **on foot**.
>! Ловушка: {{r:in}} the weekend — у британцев «at», у американцев «on the weekend».
>+ Подсказка: учите предлог вместе с глаголом или прилагательным, как единое целое.`,
    ex: [
      { t: 'mcq', q: 'The lesson starts ___ 9 o’clock.', o: ['in', 'at', 'on', 'by'], a: 1, why: 'Точное время — at.' },
      { t: 'mcq', q: 'I was born ___ 5 May.', o: ['in', 'at', 'on', 'of'], a: 2, why: 'Дата — on.' },
      { t: 'mcq', q: 'We usually travel abroad ___ summer.', o: ['on', 'at', 'in', 'by'], a: 2, why: 'Времена года — in.' },
      { t: 'gap', q: 'She is good ___ mathematics.', a: ['at'], why: 'Устойчивое сочетание: good at.' },
      { t: 'mcq', q: 'I’m interested ___ linguistics.', o: ['on', 'at', 'in', 'for'], a: 2, why: 'Interested in.' },
      { t: 'mcq', q: 'We arrived ___ Almaty at noon.', o: ['at', 'in', 'to', 'on'], a: 1, why: 'Прибытие в город — arrive in.' },
      { t: 'mcq', q: 'He is afraid ___ spiders.', o: ['from', 'of', 'with', 'at'], a: 1, why: 'Afraid of.' },
      { t: 'gap', q: 'Listen ___ me carefully.', a: ['to'], why: 'Listen to.' },
      { t: 'mcq', q: 'The book is ___ the table.', o: ['in', 'on', 'at', 'by'], a: 1, why: 'На поверхности — on.' },
      { t: 'mcq', q: 'I’ve been waiting ___ you for an hour.', o: ['to', 'at', 'for', 'on'], a: 2, why: 'Wait for.' },
      { t: 'mcq', q: 'He goes to work ___ bus.', o: ['with', 'by', 'on', 'at'], a: 1, why: 'Способ передвижения — by bus.' },
      { t: 'gap', q: 'It depends ___ the weather.', a: ['on'], why: 'Depend on.' },
      { t: 'mcq', q: 'She walked ___ the park and came out on the other side.', o: ['in', 'through', 'over', 'at'], a: 1, why: 'Сквозь парк — through.' },
      { t: 'mcq', q: 'We met ___ the weekend.', o: ['in', 'at', 'by', 'of'], a: 1, why: 'Выходные — at the weekend (в американском варианте также on the weekend).' },
      { t: 'mcq', q: 'This book belongs ___ the library.', o: ['for', 'of', 'to', 'at'], a: 2, why: 'Belong to.' },
    ],
  });

  window.PRACTICE_EN.soon = [];
})();
