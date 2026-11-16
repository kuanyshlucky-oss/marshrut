/* Клипы из мультфильмов (файлы в assets/listening). Время фраз — секунды от начала вырезанного отрывка. */
(function () {
  var C = window.LISTENING.clips;

  C.push({
    id: 'nemo-keep-swimming', title: 'Just keep swimming', source: 'Finding Nemo (2003): Дори и Марлин', level: 'A2', src: 'assets/listening/nemo-keep-swimming.mp4',
    lines: [
      { s: 39.3, e: 42.3, text: 'Hey, Mr. Grumpy Gills,', ru: 'Эй, мистер Ворчун Жабры,' },
      { s: 43.1, e: 45.9, text: 'when life gets you down, you know what you gotta do?', ru: 'когда жизнь тебя огорчает, знаешь, что нужно делать?' },
      { s: 45.55, e: 46.8, text: 'I don’t know what you gotta do.', ru: 'Я не знаю, что нужно делать.' },
      { s: 46.45, e: 48.7, text: 'Just keep swimming. Just keep swimming.', ru: 'Просто продолжай плыть. Просто продолжай плыть.' },
      { s: 53.7, e: 54.9, text: 'Dory, no singing.', ru: 'Дори, не пой.' }
    ],
    notes: [
      { w: 'gotta', ru: 'got to — «нужно, надо» (разговорное)' },
      { w: 'gets you down', ru: 'расстраивает, огорчает' },
      { w: 'keep + -ing', ru: 'продолжать делать что-то' }
    ]
  });

  C.push({
    id: 'inside-out-first-day', title: 'First day of school', source: 'Inside Out (2015): эмоции Райли', level: 'B1', src: 'assets/listening/inside-out-first-day.mp4',
    lines: [
      { s: 2.4, e: 5.05, text: 'First day of school. Very, very exciting.', ru: 'Первый день в школе. Очень, очень волнующе.' },
      { s: 5.08, e: 7.2, text: 'I was up late last night figuring out a new plan.', ru: 'Вчера я допоздна придумывала новый план.' },
      { s: 8.4, e: 12.5, text: 'I need a list of all the possible negative outcomes on the first day at a new school.', ru: 'Мне нужен список всех возможных плохих исходов первого дня в новой школе.' },
      { s: 14.6, e: 17.4, text: 'Make sure Riley stands out today, but also blends in.', ru: 'Сделай так, чтобы Райли выделялась, но при этом вписывалась.' },
      { s: 17.45, e: 21.9, text: 'When I’m through, Riley will look so good the other kids will look at their own outfits and barf.', ru: 'Когда я закончу, Райли будет выглядеть так классно, что другие дети посмотрят на свои наряды и их стошнит.' },
      { s: 22.5, e: 25.9, text: 'You’ll be in charge of the console, keeping Riley happy all day long.', ru: 'Ты будешь за пультом и весь день сохранять Райли счастливой.' },
      { s: 38.55, e: 41.8, text: 'Might come in handy if this new school is full of boring, useless classes.', ru: 'Пригодится, если в новой школе одни скучные бесполезные уроки.' },
      { s: 43.7, e: 47.0, text: 'Sadness, I have a super important job just for you.', ru: 'Грусть, у меня есть очень важная работа специально для тебя.' }
    ],
    notes: [
      { w: 'figure out', ru: 'придумать, разобраться' },
      { w: 'stand out / blend in', ru: 'выделяться / сливаться с толпой' },
      { w: 'in charge of', ru: 'отвечать за, управлять' },
      { w: 'come in handy', ru: 'пригодиться' }
    ]
  });

  C.push({
    id: 'lion-king-circle-of-life', title: 'The great Circle of Life', source: 'The Lion King (1994): Муфаса и Симба', level: 'C1', src: 'assets/listening/lion-king-circle-of-life.mp4',
    lines: [
      { s: 92.3, e: 96.6, text: 'Everything you see exists together in a delicate balance.', ru: 'Всё, что ты видишь, существует вместе в хрупком равновесии.' },
      { s: 96.65, e: 99.7, text: 'As king, you need to understand that balance,', ru: 'Став королём, ты должен понимать это равновесие' },
      { s: 99.7, e: 104.8, text: 'and respect all the creatures from the crawling ant to the leaping antelope.', ru: 'и уважать всех существ — от ползущего муравья до прыгающей антилопы.' },
      { s: 106.1, e: 108.9, text: 'Yes, Simba, but let me explain.', ru: 'Да, Симба, но позволь объяснить.' },
      { s: 108.88, e: 114.5, text: 'When we die, our bodies become the grass, and the antelope eat the grass.', ru: 'Когда мы умираем, наши тела становятся травой, а антилопы едят траву.' },
      { s: 114.5, e: 120.5, text: 'And so we are all connected in the great Circle of Life.', ru: 'Так мы все связаны в великом Круге жизни.' }
    ],
    notes: [
      { w: 'delicate balance', ru: 'хрупкое равновесие' },
      { w: 'creatures', ru: 'существа' },
      { w: 'connected', ru: 'связанные' }
    ]
  });
  C.push({
    id: 'dory-hank-driving', title: 'Which way? Dory directs Hank', source: 'Finding Dory (2016): Дори и Ханк за рулём', level: 'A2', src: 'assets/listening/dory-hank-driving.mp4',
    lines: [
      { s: 0.96, e: 3.2, text: 'Straight, straight, left, left.', ru: 'Прямо, прямо, налево, налево.' },
      { s: 3.52, e: 5.4, text: 'No, no, no. Right, right, right.', ru: 'Нет, нет, нет. Направо, направо, направо.' },
      { s: 5.84, e: 7.9, text: 'Good driving, Hank. Pay attention to the road.', ru: 'Отлично водишь, Ханк. Смотри на дорогу.' },
      { s: 9.12, e: 11.0, text: 'Uh-oh. Fork in the road. Which way?', ru: 'Ой-ой. Развилка. Куда ехать?' },
      { s: 15.28, e: 17.6, text: 'Um, both go to the ocean, right?', ru: 'Э-э, обе ведут к океану, да?' },
      { s: 21.52, e: 23.5, text: "We're out of time, kid. Where do we go now?", ru: 'У нас нет времени, малыш. Куда нам теперь?' },
      { s: 30.32, e: 32.9, text: "Hank, follow those birds. The ocean's left.", ru: 'Ханк, езжай за теми птицами. Океан слева.' },
      { s: 60.16, e: 62.0, text: "Hank, I'm going to ask you to do something crazy.", ru: 'Ханк, я попрошу тебя сделать кое-что безумное.' },
      { s: 62.4, e: 63.8, text: "I'm okay with crazy.", ru: 'Я не против безумного.' },
      { s: 66.4, e: 69.4, text: "There's no way out. It's over. They're going to fish jail.", ru: 'Выхода нет. Всё кончено. Нас посадят в рыбью тюрьму.' }
    ],
    notes: [
      { w: 'fork in the road', ru: 'развилка на дороге' },
      { w: 'pay attention to', ru: 'обращать внимание на' },
      { w: "we're out of time", ru: 'у нас кончилось время' },
      { w: 'be okay with', ru: 'быть не против, согласен' }
    ]
  });

  C.push({
    id: 'cars-meet-mater', title: 'Meeting Mater in Radiator Springs', source: 'Cars (2006): Молния Маккуин и Мэтр', level: 'A2', src: 'assets/listening/cars-meet-mater.mp4',
    lines: [
      { s: 5.52, e: 7.2, text: 'Morning, sleeping beauty.', ru: 'Доброе утро, спящая красавица.' },
      { s: 8.96, e: 10.9, text: 'I was wondering when you was gonna wake up.', ru: 'Я всё думал, когда же ты проснёшься.' },
      { s: 10.88, e: 13.3, text: "Take whatever you want, just don't hurt me!", ru: 'Берите что хотите, только не трогайте меня!' },
      { s: 14.56, e: 17.0, text: 'A parking boot? Why do I have a parking boot on?', ru: 'Колодка на колесе? Почему на мне колодка?' },
      { s: 39.44, e: 42.2, text: 'Look, I need to get to California as fast as possible.', ru: 'Слушай, мне нужно в Калифорнию как можно скорее.' },
      { s: 46.4, e: 51.8, text: "You're in Radiator Springs, the cutest little town in Carburetor County.", ru: 'Ты в Рэдиатор-Спрингс, самом милом городке округа Карбюратор.' },
      { s: 54.64, e: 58.6, text: "Well, if you think that's great, you should see the rest of the town.", ru: 'Если тебе это нравится, ты ещё не видел остальной город.' },
      { s: 63.12, e: 66.0, text: 'So if you could just open the gate, take this boot off,', ru: 'Так что, если бы ты открыл ворота и снял эту колодку,' },
      { s: 72.72, e: 76.6, text: 'What did I tell you about talking to the accused?', ru: 'Что я говорил тебе про разговоры с обвиняемым?' },
      { s: 81.92, e: 83.6, text: "We'll talk later, mate.", ru: 'Поговорим позже, приятель.' }
    ],
    notes: [
      { w: 'I was wondering when', ru: 'я всё думал, когда' },
      { w: 'as fast as possible', ru: 'как можно быстрее' },
      { w: 'the rest of', ru: 'остальное, остальные' },
      { w: 'accused', ru: 'обвиняемый' }
    ]
  });

  C.push({
    id: 'zootopia-popsicle', title: 'The Pawpsicle hustle', source: 'Zootopia (2016): Ник, Джуди и мороженое', level: 'B2', src: 'assets/listening/zootopia-popsicle.mp4',
    lines: [
      { s: 21.22, e: 23.5, text: "I'm not looking for any trouble either, sir.", ru: 'Я тоже не ищу неприятностей, сэр.' },
      { s: 23.58, e: 27.7, text: 'I simply want to buy a jumbo pop for my little boy.', ru: 'Я просто хочу купить огромное эскимо для моего малыша.' },
      { s: 40.62, e: 42.9, text: 'Oh, come on, kid, back up.', ru: 'Ну же, малыш, отойди.' },
      { s: 42.96, e: 46.9, text: "Listen, buddy, what, they don't have fox ice cream joints in your part of town?", ru: 'Слушай, приятель, у вас что, нет мороженщиков-лис в вашем районе?' },
      { s: 47.34, e: 49.9, text: "No, no, there are. It's just my boy.", ru: 'Нет, нет, есть. Просто мой сын…' },
      { s: 50.34, e: 54.9, text: 'This goofy little stinker, he loves all things elephant. Wants to be one when he grows up.', ru: 'Этот смешной проказник обожает всё слоновье. Хочет стать слоном, когда вырастет.' },
      { s: 58.26, e: 60.7, text: 'Who the heck am I to crush his little dreams, huh?', ru: 'Кто я такой, чтобы рушить его мечту, а?' },
      { s: 61.32, e: 68.9, text: 'Look, you probably can\'t read, Fox, but the sign says we reserve the right to refuse service to anyone.', ru: 'Слушай, ты, наверное, читать не умеешь, Лис, но на вывеске написано: мы вправе отказать любому в обслуживании.' },
      { s: 69.36, e: 72.4, text: "So beat it. You're holding up the line.", ru: 'Так что проваливай. Ты задерживаешь очередь.' },
      { s: 90.66, e: 92.2, text: 'What are you talking about?', ru: 'О чём ты говоришь?' },
      { s: 92.34, e: 99.0, text: "Well, I don't want to cause you any trouble, but I believe scooping ice cream with an ungloved trunk is a class three health code violation.", ru: 'Не хочу создавать вам проблем, но, по-моему, раскладывать мороженое незащищённым хоботом — нарушение санитарных норм третьего класса.' },
      { s: 100.14, e: 102.6, text: 'Which is kind of a big deal.', ru: 'А это довольно серьёзно.' },
      { s: 103.02, e: 106.5, text: "Of course, I could let you off with a warning if you'd glove those trunks", ru: 'Конечно, я могу ограничиться предупреждением, если вы наденете перчатки на хобот' },
      { s: 106.8, e: 110.9, text: "and, I don't know, finish selling this nice dad and his son up.", ru: 'и, не знаю, закончите обслуживать этого славного папу с сыном.' }
    ],
    notes: [
      { w: 'hit the road / beat it', ru: 'проваливай, убирайся' },
      { w: 'reserve the right to', ru: 'оставлять за собой право' },
      { w: 'hold up the line', ru: 'задерживать очередь' },
      { w: 'let off with a warning', ru: 'отделаться предупреждением' }
    ]
  });
  /* тайминги выше сняты с исходного ролика; отрывки вырезаны с этих секунд */
  var OFF = { 'nemo-keep-swimming': 38, 'inside-out-first-day': 2, 'lion-king-circle-of-life': 91.5, 'dory-hank-driving': 0.3, 'cars-meet-mater': 2.5, 'zootopia-popsicle': 21.0 };
  C.forEach(function (c) {
    if (OFF[c.id] == null) return;
    c.lines.forEach(function (l) { l.s = Math.max(0, +(l.s - OFF[c.id]).toFixed(2)); l.e = +(l.e - OFF[c.id]).toFixed(2); });
  });
})();
