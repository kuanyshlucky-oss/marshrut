/* Клипы из мультфильма «Кунг-фу панда» (Shifu vs Tai Lung, английская версия) — отдельный файл, подключается после listening-data.js.
   Время фраз — секунды от начала вырезанного отрывка. Реплики, в которых расшифровка расходилась (драка, музыка), в диктант не вошли. */
(function () {
  var C = window.LISTENING.clips;

  C.unshift({
    id: 'kfp-shifu-1', title: 'Master Shifu vs Tai Lung · 1', source: 'Kung Fu Panda (2008): разговор Шифу и Тай Лунга', level: 'B2',
    src: 'assets/listening/kfp-shifu-1.mp4',
    lines: [
      { s: 0.0, e: 3.1, text: 'I have come home, Master.', ru: 'Я вернулся домой, Мастер.' },
      { s: 3.6, e: 6.8, text: 'This is no longer your home, and I am no longer your master.', ru: 'Это больше не твой дом, а я больше не твой мастер.' },
      { s: 7.3, e: 10.0, text: 'Yes, you have a new favorite.', ru: 'Да, у тебя новый любимчик.' },
      { s: 20.5, e: 23.5, text: 'So, that is how it’s going to be.', ru: 'Значит, так всё и будет.' },
      { s: 23.7, e: 25.6, text: 'That is how it must be.', ru: 'Так и должно быть.' },
      { s: 46.8, e: 49.8, text: 'You knew I was the Dragon Warrior!', ru: 'Ты знал, что я Воин Дракона!' },
      { s: 50.0, e: 52.0, text: 'You always knew.', ru: 'Ты всегда это знал.' },
      { s: 52.7, e: 57.0, text: 'But when Oogway said otherwise, what did you do?', ru: 'Но когда Угвэй сказал иначе, что ты сделал?' },
      { s: 58.7, e: 60.9, text: 'What did you do?', ru: 'Что ты сделал?' },
      { s: 62.2, e: 63.3, text: 'Nothing!', ru: 'Ничего!' },
      { s: 63.4, e: 65.2, text: 'You were not meant to be the Dragon Warrior!', ru: 'Тебе не суждено было стать Воином Дракона!' },
      { s: 65.2, e: 66.5, text: 'That was not my fault!', ru: 'Это не моя вина!' },
      { s: 66.8, e: 68.9, text: 'Not your fault?', ru: 'Не твоя вина?' },
      { s: 69.3, e: 71.8, text: 'Who filled my head with dreams?', ru: 'Кто наполнил мою голову мечтами?' },
      { s: 71.7, e: 78.0, text: 'Who drove me to train until my bones cracked?', ru: 'Кто заставлял меня тренироваться, пока не затрещали кости?' },
      { s: 79.4, e: 84.0, text: 'Who denied me my destiny?', ru: 'Кто лишил меня моей судьбы?' },
      { s: 85.3, e: 88.5, text: 'It was never my decision to make!', ru: 'Это никогда не было моим решением!' },
    ],
    notes: [
      { w: 'Dragon Warrior', ru: 'Воин Дракона (избранный воин в мультфильме)' },
      { w: 'to say otherwise', ru: 'сказать иначе, возразить' },
      { w: 'to drive someone to…', ru: 'заставлять, подталкивать кого-то к чему-либо' },
      { w: 'bones cracked', ru: 'кости затрещали (crack — трескаться)' },
      { w: 'to deny someone something', ru: 'отказывать, лишать кого-то чего-то' },
      { w: 'destiny', ru: 'судьба, предназначение' },
    ],
  });

  C.push({
    id: 'kfp-shifu-2', title: 'Master Shifu vs Tai Lung · 2', source: 'Kung Fu Panda (2008): Шифу просит прощения', level: 'B1',
    src: 'assets/listening/kfp-shifu-2.mp4',
    lines: [
      { s: 1.4, e: 3.9, text: 'I… I have always been proud of you.', ru: 'Я… я всегда гордился тобой.' },
      { s: 5.5, e: 9.8, text: 'From the first moment I’ve been… proud of you.', ru: 'С самой первой минуты я… гордился тобой.' },
      { s: 11.4, e: 15.1, text: 'And it was my pride that blinded me.', ru: 'И именно моя гордость ослепила меня.' },
      { s: 15.8, e: 19.6, text: 'I loved you too much to see what you were becoming.', ru: 'Я слишком любил тебя, чтобы увидеть, кем ты становишься.' },
      { s: 20.3, e: 24.6, text: 'What I was turning you into.', ru: 'Во что я тебя превращал.' },
      { s: 25.5, e: 29.0, text: 'I’m… I’m sorry.', ru: 'Я… мне жаль.' },
    ],
    notes: [
      { w: 'to be proud of', ru: 'гордиться кем-то / чем-то' },
      { w: 'pride', ru: 'гордость (здесь — самолюбие, которое мешало видеть правду)' },
      { w: 'to blind someone', ru: 'ослеплять (перен.: мешать видеть ясно)' },
      { w: 'to turn someone into', ru: 'превращать кого-то во что-то' },
    ],
  });
})();
