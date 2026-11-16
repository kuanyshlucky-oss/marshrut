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
      { s: 8.96, e: 10.85, text: 'I was wondering when you was gonna wake up.', ru: 'Я всё думал, когда же ты проснёшься.' },
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
  C.push({
    id: 'forrest-gump-chocolates', title: 'Life is like a box of chocolates', source: 'Forrest Gump (1994): Форрест на автобусной остановке', level: 'B1', src: 'assets/listening/forrest-gump-chocolates.mp4',
    lines: [
      { s: 13.2, e: 17.8, text: "Hello. My name's Forrest. Forrest Gump.", ru: 'Здравствуйте. Меня зовут Форрест. Форрест Гамп.' },
      { s: 23.7, e: 25.3, text: 'Do you want a chocolate?', ru: 'Хотите шоколадку?' },
      { s: 28.4, e: 31.0, text: 'I could eat about a million and a half of these.', ru: 'Я мог бы съесть, наверное, полтора миллиона таких.' },
      { s: 32.9, e: 38.2, text: 'My mama always said life was like a box of chocolates.', ru: 'Мама всегда говорила: жизнь как коробка конфет.' },
      { s: 40.2, e: 42.4, text: "You never know what you're gonna get.", ru: 'Никогда не знаешь, что тебе попадётся.' },
      { s: 50.1, e: 52.3, text: 'Those must be comfortable shoes.', ru: 'Наверное, у вас удобные туфли.' },
      { s: 54.2, e: 58.1, text: "I'll bet you could walk all day in shoes like that and not feel a thing.", ru: 'Спорю, в таких туфлях можно ходить весь день и ничего не чувствовать.' },
      { s: 61.0, e: 65.6, text: 'I wish I had shoes like that. My feet hurt.', ru: 'Мне бы такие туфли. У меня ноги болят.' },
      { s: 66.8, e: 76.4, text: "Mama always said there's an awful lot you could tell about a person by their shoes: where they're going, where they've been.", ru: 'Мама всегда говорила: по обуви человека можно очень многое узнать — куда он идёт, где он был.' }
    ],
    notes: [
      { w: 'I could eat about a million', ru: 'я мог бы съесть миллион (преувеличение)' },
      { w: "you never know what you're gonna get", ru: 'никогда не знаешь, что получишь' },
      { w: "I'll bet (you could…)", ru: 'спорю, (что ты мог бы…)' },
      { w: 'an awful lot', ru: 'очень много' }
    ]
  });

  C.push({
    id: 'shrek-ogres-onions', title: 'Ogres are like onions', source: 'Shrek (2001): Шрек и Осёл', level: 'B1', src: 'assets/listening/shrek-ogres-onions.mp4',
    lines: [
      { s: 34.57, e: 38.55, text: "For your information, there's a lot more to ogres than people think.", ru: 'К твоему сведению, в ограх гораздо больше, чем думают люди.' },
      { s: 38.61, e: 45.96, text: 'Example? Example? Okay, um, ogres are like onions.', ru: 'Пример? Пример? Ну ладно, э-э, огры как лук.' },
      { s: 46.93, e: 49.86, text: 'They stink? Yes. No. Oh, they make you cry? No.', ru: 'Воняют? Да. Нет. А, от них плачут? Нет.' },
      { s: 50.23, e: 53.48, text: 'You leave them out in the sun, they get all brown, start sprouting little white hairs.', ru: 'Оставишь их на солнце — они темнеют и начинают отращивать белые волоски.' },
      { s: 53.53, e: 63.48, text: 'No! Layers. Onions have layers. Ogres have layers. Onions have layers. You get it? We both have layers.', ru: 'Нет! Слои. У лука есть слои. У огров есть слои. У лука есть слои. Понял? У нас обоих есть слои.' },
      { s: 65.53, e: 72.0, text: "Oh, you both have layers. Oh. You know, not everybody like onions.", ru: 'А, у вас обоих есть слои. Знаешь, не все любят лук.' },
      { s: 72.67, e: 75.68, text: 'Cake! Everybody loves cakes. Cakes have layers.', ru: 'Торт! Все любят торты. У тортов есть слои.' },
      { s: 75.73, e: 82.68, text: "I don't care what everyone likes. Ogres are not like cakes.", ru: 'Мне всё равно, что нравится всем. Огры не похожи на торты.' },
      { s: 85.57, e: 93.3, text: "You know what else everybody likes? Parfaits. Have you ever met a person, you say, 'Let's get some parfait,' they say, 'Hell no, I don't like no parfait'? Parfaits are delicious!", ru: 'Знаешь, что ещё все любят? Парфе. Видел ли ты человека, который на «давай съедим парфе» отвечает «ни за что, не люблю парфе»? Парфе — это вкусно!' },
      { s: 94.15, e: 102.66, text: 'You dense, annoying, miniature beast of burden! Ogres are like onions. End of story. Bye-bye. See you later.', ru: 'Ты тупой, надоедливый, карликовый вьючный зверь! Огры как лук. Точка. Пока. До встречи.' }
    ],
    notes: [
      { w: 'for your information', ru: 'к твоему сведению' },
      { w: 'layers', ru: 'слои' },
      { w: 'end of story', ru: 'и точка, разговор окончен' },
      { w: "I don't care what…", ru: 'мне всё равно, что…' }
    ]
  });

  C.push({
    id: 'matrix-red-pill', title: 'The red pill or the blue pill', source: 'The Matrix (1999): Морфеус и Нео', level: 'B2', src: 'assets/listening/matrix-red-pill.mp4',
    lines: [
      { s: 7.03, e: 13.2, text: 'The Matrix is everywhere. It is all around us. Even now, in this very room.', ru: 'Матрица повсюду. Она вокруг нас. Даже сейчас, в этой самой комнате.' },
      { s: 13.81, e: 18.12, text: 'You can see it when you look out your window or when you turn on your television.', ru: 'Ты видишь её, когда смотришь в окно или включаешь телевизор.' },
      { s: 18.97, e: 26.76, text: 'You can feel it when you go to work, when you go to church, when you pay your taxes.', ru: 'Ты чувствуешь её, когда идёшь на работу, в церковь, платишь налоги.' },
      { s: 28.33, e: 33.36, text: 'It is the world that has been pulled over your eyes to blind you from the truth.', ru: 'Это мир, наброшенный на твои глаза, чтобы ты не увидел правду.' },
      { s: 35.35, e: 36.72, text: 'What truth?', ru: 'Какую правду?' },
      { s: 40.93, e: 43.32, text: 'That you are a slave, Neo.', ru: 'Что ты раб, Нео.' },
      { s: 43.93, e: 54.9, text: 'Like everyone else, you were born into bondage, born into a prison that you cannot smell or taste or touch. A prison for your mind.', ru: 'Как и все, ты рождён в неволе, в тюрьме, которую нельзя ни почуять, ни попробовать, ни потрогать. Тюрьме для твоего разума.' },
      { s: 61.11, e: 72.1, text: 'Unfortunately, no one can be told what the Matrix is. You have to see it for yourself.', ru: 'К сожалению, никому нельзя объяснить, что такое Матрица. Ты должен увидеть её сам.' },
      { s: 81.13, e: 85.86, text: 'This is your last chance. After this, there is no turning back.', ru: 'Это твой последний шанс. После него пути назад не будет.' },
      { s: 86.35, e: 93.18, text: 'You take the blue pill, the story ends. You wake up in your bed and believe whatever you want to believe.', ru: 'Примешь синюю таблетку — история закончится. Ты проснёшься в своей постели и поверишь, во что захочешь.' },
      { s: 93.55, e: 100.56, text: 'You take the red pill, you stay in Wonderland, and I show you how deep the rabbit hole goes.', ru: 'Примешь красную — останешься в Стране чудес, и я покажу тебе, насколько глубока кроличья нора.' },
      { s: 110.05, e: 114.9, text: "Remember, all I'm offering is the truth. Nothing more.", ru: 'Помни: я предлагаю только правду. Ничего больше.' }
    ],
    notes: [
      { w: 'pull the wool over / pulled over your eyes', ru: 'обманывать, застилать глаза' },
      { w: 'bondage', ru: 'неволя, рабство' },
      { w: 'no turning back', ru: 'пути назад нет' },
      { w: 'rabbit hole', ru: 'кроличья нора (глубина проблемы)' }
    ]
  });

  C.push({
    id: 'dark-knight-joker', title: 'You complete me', source: 'The Dark Knight (2008): Джокер и Бэтмен', level: 'B2', src: 'assets/listening/dark-knight-joker.mp4',
    lines: [
      { s: 13.69, e: 17.54, text: 'See, you wanted me. Here I am.', ru: 'Видишь, ты хотел меня. Вот он я.' },
      { s: 18.25, e: 20.1, text: 'I wanted to see what you do.', ru: 'Я хотел посмотреть, что ты сделаешь.' },
      { s: 21.05, e: 25.62, text: "And you didn't disappoint. You let five people die.", ru: 'И ты не разочаровал. Ты позволил умереть пятерым.' },
      { s: 27.61, e: 33.46, text: "Then you let Dent take your place. Even to a guy like me, that's cold.", ru: 'Потом ты позволил Денту занять твоё место. Даже для такого, как я, это жестоко.' },
      { s: 34.17, e: 38.02, text: 'Those mob fools want you gone so they can get back to the way things were.', ru: 'Эти мафиозные дураки хотят избавиться от тебя, чтобы всё стало как раньше.' },
      { s: 39.37, e: 45.14, text: "But I know the truth: there's no going back. You've changed things forever.", ru: 'Но я знаю правду: пути назад нет. Ты изменил всё навсегда.' },
      { s: 49.37, e: 61.54, text: "I don't want to kill you. What would I do without you? Go back to ripping off mob dealers? No. No, you... you complete me.", ru: 'Я не хочу тебя убивать. Что я буду делать без тебя? Опять обирать мафиози? Нет. Нет, ты… ты дополняешь меня.' },
      { s: 63.37, e: 73.38, text: "Don't talk like one of them. You're not. Even if you'd like to be. To them, you're just a freak, like me.", ru: 'Не говори как они. Ты не такой. Даже если хочешь быть таким. Для них ты просто урод, как и я.' },
      { s: 73.93, e: 82.26, text: "They need you right now. But when they don't, they'll cast you out like a leper.", ru: 'Сейчас ты им нужен. Но когда перестанешь быть нужным, они вышвырнут тебя, как прокажённого.' },
      { s: 82.65, e: 91.62, text: "Their morals, their code, it's a bad joke. Dropped at the first sign of trouble.", ru: 'Их мораль, их кодекс — плохая шутка. Её бросают при первых же трудностях.' },
      { s: 93.21, e: 104.66, text: "They're only as good as the world allows them to be. I'll show you. When the chips are down, these civilized people, they'll eat each other.", ru: 'Они хороши лишь настолько, насколько позволяет мир. Я покажу. Когда дело плохо, эти цивилизованные люди сожрут друг друга.' },
      { s: 105.93, e: 111.22, text: "See, I'm not a monster. I'm just ahead of the curve.", ru: 'Видишь, я не монстр. Я просто на шаг впереди.' }
    ],
    notes: [
      { w: 'let off / cast out', ru: 'отвергнуть, вышвырнуть' },
      { w: 'when the chips are down', ru: 'когда дела плохи, в критический момент' },
      { w: 'ahead of the curve', ru: 'на шаг впереди других' },
      { w: "didn't disappoint", ru: 'не разочаровал' }
    ]
  });

  C.push({
    id: 'good-will-hunting-bench', title: "You're just a kid", source: 'Good Will Hunting (1997): Шон и Уилл на скамейке', level: 'B2', src: 'assets/listening/good-will-hunting-bench.mp4',
    lines: [
      { s: 48.33, e: 52.42, text: "So if I asked you about art, you'd probably give me the skinny on every art book ever written.", ru: 'Если спросить тебя об искусстве, ты выдашь мне всё про каждую книгу по искусству.' },
      { s: 53.53, e: 63.38, text: "Michelangelo, you know a lot about him. Life's work, political aspirations, him and the Pope, sexual orientation, the whole works, right?", ru: 'Микеланджело — ты о нём много знаешь. Его труды, политические амбиции, он и Папа, его ориентация — всё сразу, да?' },
      { s: 65.69, e: 69.06, text: "But I bet you can't tell me what it smells like in the Sistine Chapel.", ru: 'Но готов поспорить, ты не скажешь, чем пахнет в Сикстинской капелле.' },
      { s: 72.25, e: 75.46, text: "You've never actually stood there and looked up at that beautiful ceiling.", ru: 'Ты ни разу не стоял там и не смотрел на тот прекрасный потолок.' },
      { s: 81.77, e: 89.46, text: 'If I ask you about women, you can probably give me a syllabus of your personal favorites. You may have even been laid a few times.', ru: 'Спрошу про женщин — ты, наверное, выдашь целый список любимых. Может, у тебя даже пару раз что-то было.' },
      { s: 95.61, e: 100.42, text: "But you can't tell me what it feels like to wake up next to a woman and feel truly happy.", ru: 'Но ты не скажешь, каково это — проснуться рядом с женщиной и быть по-настоящему счастливым.' },
      { s: 108.09, e: 114.1, text: "If I ask you about war, you'd probably throw Shakespeare at me. 'Once more unto the breach, dear friends.'", ru: 'Спрошу про войну — ты, наверное, процитируешь мне Шекспира: «Ещё раз на штурм, друзья».' },
      { s: 116.73, e: 126.02, text: "But you've never been near one. You've never held your best friend's head in your lap and watched him gasp his last breath, looking to you for help.", ru: 'Но ты никогда не был рядом с ней. Ты не держал голову лучшего друга на коленях, пока он делал последний вдох и смотрел на тебя в поисках помощи.' },
      { s: 129.13, e: 136.98, text: "If I ask you about love, you'd probably quote me a sonnet. But you've never looked at a woman and been totally vulnerable.", ru: 'Спрошу про любовь — ты, наверное, прочтёшь сонет. Но ты никогда не смотрел на женщину, полностью открывшись.' }
    ],
    notes: [
      { w: 'give me the skinny on', ru: 'выложить всю подноготную о' },
      { w: 'the whole works', ru: 'всё сразу, весь набор' },
      { w: 'syllabus', ru: 'программа, перечень' },
      { w: 'vulnerable', ru: 'уязвимый, открытый' }
    ]
  });

  C.push({
    id: 'dead-poets-carpe-diem', title: 'Carpe diem', source: 'Dead Poets Society (1989): мистер Китинг', level: 'B2', src: 'assets/listening/dead-poets-carpe-diem.mp4',
    lines: [
      { s: 158.41, e: 166.14, text: 'Gather ye rosebuds while ye may, old Time is still a-flying, and this same flower that smiles today, tomorrow will be dying.', ru: 'Срывайте розы, пока можете: время летит, и цветок, что улыбается сегодня, завтра умрёт.' },
      { s: 172.81, e: 178.2, text: 'The Latin term for that sentiment is carpe diem. Who knows what that means?', ru: 'По-латыни это чувство называется «carpe diem». Кто знает, что это значит?' },
      { s: 180.31, e: 183.0, text: "Carpe diem. That's seize the day.", ru: 'Carpe diem. Это «лови день».' },
      { s: 187.87, e: 192.6, text: 'Seize the day. Gather ye rosebuds while ye may.', ru: 'Лови день. Срывайте розы, пока можете.' },
      { s: 194.47, e: 197.3, text: 'Why does the writer use these lines?', ru: 'Почему автор использует эти строки?' },
      { s: 203.59, e: 206.2, text: 'Because we are food for worms, lads.', ru: 'Потому что мы корм для червей, ребята.' },
      { s: 207.37, e: 215.64, text: 'Because, believe it or not, each and every one of us in this room is one day going to stop breathing, turn cold, and die.', ru: 'Потому что, хотите верьте, хотите нет, каждый из нас в этой комнате однажды перестанет дышать, остынет и умрёт.' }
    ],
    notes: [
      { w: 'seize the day', ru: 'лови момент, живи сегодняшним днём' },
      { w: 'ye', ru: 'устаревшее «вы»' },
      { w: 'believe it or not', ru: 'хотите верьте, хотите нет' },
      { w: 'each and every one', ru: 'каждый без исключения' }
    ]
  });

  C.push({
    id: 'godfather-i-believe-in-america', title: 'I believe in America', source: 'The Godfather (1972): Бонасера просит о справедливости', level: 'B2', src: 'assets/listening/godfather-i-believe-in-america.mp4',
    lines: [
      { s: 1.61, e: 6.34, text: 'I believe in America. America has made my fortune.', ru: 'Я верю в Америку. Америка сделала моё состояние.' },
      { s: 7.61, e: 16.5, text: 'And I raised my daughter in the American fashion. I gave her freedom, but I taught her never to dishonor her family.', ru: 'Я воспитал дочь по-американски. Я дал ей свободу, но учил никогда не позорить семью.' },
      { s: 18.01, e: 26.9, text: "She found a boyfriend, not an Italian. She went to the movies with him, she stayed out late. I didn't protest.", ru: 'Она нашла парня, не итальянца. Ходила с ним в кино, возвращалась поздно. Я не возражал.' },
      { s: 28.49, e: 40.74, text: 'Two months ago, he took her for a drive with another boyfriend. They made her drink whiskey, and then they tried to take advantage of her.', ru: 'Два месяца назад он повёз её кататься вместе с другим парнем. Они заставили её пить виски и попытались ею воспользоваться.' },
      { s: 41.45, e: 49.86, text: 'She resisted. She kept her honor. So they beat her like an animal.', ru: 'Она сопротивлялась. Она сохранила честь. Тогда они избили её, как животное.' },
      { s: 51.77, e: 66.26, text: "When I went to the hospital, her nose was broken, her jaw was shattered, held together by wire. She couldn't even weep because of the pain.", ru: 'Когда я пришёл в больницу, у неё был сломан нос, раздроблена челюсть, скреплённая проволокой. Она даже плакать не могла от боли.' },
      { s: 68.97, e: 77.14, text: 'But I wept. Why did I weep? She was the light of my life.', ru: 'Но я плакал. Почему я плакал? Она была светом моей жизни.' },
      { s: 79.45, e: 87.14, text: 'Beautiful girl. Now she will never be beautiful again.', ru: 'Красавица. Теперь она никогда не будет красивой.' }
    ],
    notes: [
      { w: 'raise (a child)', ru: 'растить, воспитывать' },
      { w: 'take advantage of', ru: 'воспользоваться (кем-то)' },
      { w: 'dishonor', ru: 'позорить, бесчестить' },
      { w: 'the light of my life', ru: 'свет моей жизни' }
    ]
  });

  C.push({
    id: 'godfather-respect', title: 'You never wanted my friendship', source: 'The Godfather (1972): Дон Корлеоне и Бонасера', level: 'C1', src: 'assets/listening/godfather-respect.mp4',
    lines: [
      { s: 189.93, e: 195.3, text: "We've known each other many years, but this is the first time you ever came to me for counsel, for help.", ru: 'Мы знакомы много лет, но вы впервые пришли ко мне за советом, за помощью.' },
      { s: 196.57, e: 205.94, text: "I can't remember the last time that you invited me to your house for a cup of coffee, even though my wife is godmother to your only child.", ru: 'Не помню, когда вы в последний раз звали меня к себе на чашку кофе, хотя моя жена крёстная вашего единственного ребёнка.' },
      { s: 206.81, e: 215.62, text: "But let's be frank. You never wanted my friendship, and you were afraid to be in my debt.", ru: 'Но давайте откровенно: вы не искали моей дружбы и боялись остаться у меня в долгу.' },
      { s: 222.15, e: 235.2, text: "You found paradise in America, had a good trade, made a good living. The police protected you, and there were courts of law, and you didn't need a friend like me.", ru: 'Вы нашли в Америке рай, у вас было ремесло и хороший заработок. Вас защищала полиция, были суды, и такой друг, как я, вам был не нужен.' },
      { s: 238.33, e: 243.9, text: "But now you come to me and you say, 'Don Corleone, give me justice.'", ru: 'А теперь вы приходите ко мне и говорите: «Дон Корлеоне, дайте мне справедливость».' },
      { s: 244.49, e: 253.4, text: "But you don't ask with respect. You don't offer friendship. You don't even think to call me godfather.", ru: 'Но вы просите без уважения. Вы не предлагаете дружбы. Вы даже не называете меня крёстным отцом.' },
      { s: 254.01, e: 260.42, text: 'Instead, you come into my house on the day my daughter is to be married, and you ask me to do murder for money.', ru: 'Вместо этого вы приходите в мой дом в день свадьбы моей дочери и просите меня совершить убийство за деньги.' },
      { s: 260.85, e: 263.0, text: 'I ask you for justice.', ru: 'Я прошу у вас справедливости.' },
      { s: 263.61, e: 267.2, text: "That is not justice. Your daughter is still alive.", ru: 'Это не справедливость. Ваша дочь жива.' },
      { s: 267.65, e: 272.4, text: 'Then they can suffer as she suffers.', ru: 'Тогда пусть они страдают, как страдает она.' },
      { s: 273.15, e: 276.5, text: 'How much shall I pay you?', ru: 'Сколько я вам должен?' }
    ],
    notes: [
      { w: "let's be frank", ru: 'давайте откровенно' },
      { w: 'in my debt', ru: 'в долгу передо мной' },
      { w: 'counsel', ru: 'совет, консультация' },
      { w: 'godfather / godmother', ru: 'крёстный отец / крёстная мать' }
    ]
  });

  C.push({
    id: 'titanic-flying', title: "Close your eyes: I'm flying", source: 'Titanic (1997): Джек и Роуз на носу корабля', level: 'B1', src: 'assets/listening/titanic-flying.mp4',
    lines: [
      { s: 83.12, e: 85.3, text: 'Give me your hand.', ru: 'Дай мне руку.' },
      { s: 91.8, e: 96.8, text: 'Now close your eyes. Go on.', ru: 'А теперь закрой глаза. Давай.' },
      { s: 99.4, e: 101.5, text: 'Step up.', ru: 'Поднимись.' },
      { s: 104.5, e: 106.1, text: 'Now hold on to the railing.', ru: 'Теперь держись за перила.' },
      { s: 106.5, e: 108.3, text: "Keep your eyes closed. Don't peek.", ru: 'Не открывай глаза. Не подглядывай.' },
      { s: 110.6, e: 113.4, text: 'Step up onto the rail.', ru: 'Встань на перила.' },
      { s: 116.6, e: 120.8, text: 'Hold on. Keep your eyes closed.', ru: 'Держись. Не открывай глаза.' },
      { s: 121.4, e: 122.8, text: 'Do you trust me?', ru: 'Ты мне доверяешь?' },
      { s: 123.2, e: 125.2, text: 'I trust you.', ru: 'Я тебе доверяю.' },
      { s: 134.3, e: 138.3, text: 'All right. Open your eyes.', ru: 'Хорошо. Открой глаза.' },
      { s: 144.4, e: 148.2, text: "I'm flying, Jack!", ru: 'Я лечу, Джек!' }
    ],
    notes: [
      { w: 'go on', ru: 'давай, продолжай' },
      { w: 'step up', ru: 'подняться, шагнуть наверх' },
      { w: "don't peek", ru: 'не подглядывай' },
      { w: 'hold on', ru: 'держись' }
    ]
  });

  /* тайминги выше сняты с исходного ролика; отрывки вырезаны с этих секунд */
  var OFF = { 'nemo-keep-swimming': 38, 'inside-out-first-day': 2, 'lion-king-circle-of-life': 91.5, 'dory-hank-driving': 0.3, 'cars-meet-mater': 2.5, 'zootopia-popsicle': 21.0,
    'forrest-gump-chocolates': 12.6, 'shrek-ogres-onions': 33.8, 'matrix-red-pill': 6.3, 'dark-knight-joker': 12.8, 'good-will-hunting-bench': 47.4,
    'dead-poets-carpe-diem': 157.4, 'godfather-i-believe-in-america': 0.8, 'godfather-respect': 188.9, 'titanic-flying': 82.0 };
  C.forEach(function (c) {
    if (OFF[c.id] == null) return;
    c.lines.forEach(function (l) { l.s = Math.max(0, +(l.s - OFF[c.id]).toFixed(2)); l.e = +(l.e - OFF[c.id]).toFixed(2); });
  });
})();
