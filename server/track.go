package main

// МагистрТрек: справочники (вузы, специальности, статистика приёма),
// дорожная карта, калькулятор шансов, тепловая карта.

import (
	"fmt"
	"net/http"
	"time"
)

/* ---------------- Схема и сид ---------------- */

func initTrack() error {
	schema := `
	CREATE TABLE IF NOT EXISTS universities (
		id   INT PRIMARY KEY,
		name TEXT NOT NULL,
		city TEXT NOT NULL,
		lat  DOUBLE PRECISION NOT NULL,
		lng  DOUBLE PRECISION NOT NULL
	);
	CREATE TABLE IF NOT EXISTS specialities (
		id              INT PRIMARY KEY,
		name            TEXT NOT NULL,
		code            TEXT NOT NULL,
		profile_subject TEXT NOT NULL,
		kt_applications  INT NOT NULL DEFAULT 0,
		kt_participants  INT NOT NULL DEFAULT 0,
		kt_passed        INT NOT NULL DEFAULT 0,
		kt_passed_pct    DOUBLE PRECISION NOT NULL DEFAULT 0
	);
	CREATE TABLE IF NOT EXISTS admission_rules (
		id                BIGSERIAL PRIMARY KEY,
		university_id     INT NOT NULL,
		speciality_id     INT NOT NULL,
		year              INT NOT NULL,
		min_foreign_score INT NOT NULL,
		min_profile_score INT NOT NULL,
		grant_count       INT NOT NULL,
		avg_passing_score DOUBLE PRECISION NOT NULL,
		applicants_count  INT NOT NULL,
		UNIQUE(university_id, speciality_id, year)
	);
	CREATE TABLE IF NOT EXISTS checklist_templates (
		id          BIGSERIAL PRIMARY KEY,
		year        INT NOT NULL,
		step_order  INT NOT NULL,
		description TEXT NOT NULL,
		deadline    DATE NOT NULL,
		UNIQUE(year, step_order)
	);
	CREATE TABLE IF NOT EXISTS user_checklist (
		id           BIGSERIAL PRIMARY KEY,
		user_id      BIGINT NOT NULL,
		template_id  BIGINT NOT NULL,
		completed    BOOLEAN NOT NULL DEFAULT FALSE,
		completed_at TIMESTAMPTZ,
		UNIQUE(user_id, template_id)
	);
	-- расширение справочника специальностей (статистика КТ-2025 по группам)
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_applications INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_participants INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_passed       INT NOT NULL DEFAULT 0;
	ALTER TABLE specialities ADD COLUMN IF NOT EXISTS kt_passed_pct   DOUBLE PRECISION NOT NULL DEFAULT 0;
	-- расширение профиля пользователя
	ALTER TABLE users ADD COLUMN IF NOT EXISTS speciality_id INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS language      TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS target_type   TEXT NOT NULL DEFAULT '';
	ALTER TABLE users ADD COLUMN IF NOT EXISTS foreign_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_score INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS bonus_points  INT NOT NULL DEFAULT 0;
	ALTER TABLE users ADD COLUMN IF NOT EXISTS session_id    TEXT NOT NULL DEFAULT '';
	`
	if _, err := db.Exec(schema); err != nil {
		return err
	}
	return seedTrack()
}

func seedTrack() error {
	// Вузы
	if _, err := db.Exec(`INSERT INTO universities(id, name, city, lat, lng) VALUES
		(1, 'Казахский национальный университет им. аль-Фараби', 'Алматы', 43.2551, 76.9126),
		(2, 'Евразийский национальный университет им. Л.Н. Гумилева', 'Астана', 51.1605, 71.4704),
		(3, 'Satbayev University (КазНИТУ им. Сатпаева)', 'Алматы', 43.2364, 76.9293)
		ON CONFLICT (id) DO NOTHING`); err != nil {
		return err
	}
	// Специальности — полный официальный перечень 147 групп образовательных программ (ГОП)
	// магистратуры + статистика комплексного тестирования 2025 (лето, НЦТ РК) по каждой группе.
	// profile_subject = имя ГОП: профильный тест КТ носит то же название, что и сама группа.
	if _, err := db.Exec(`INSERT INTO specialities
		(id, name, code, profile_subject, kt_applications, kt_participants, kt_passed, kt_passed_pct) VALUES
		(1, 'Педагогика и психология', 'M001', 'Педагогика и психология', 2055, 1872, 779, 41.61),
		(2, 'Дошкольное обучение и воспитание', 'M002', 'Дошкольное обучение и воспитание', 265, 254, 56, 22.05),
		(3, 'Подготовка педагогов без предметной специализации', 'M003', 'Подготовка педагогов без предметной специализации', 1355, 1273, 420, 32.99),
		(4, 'Подготовка педагогов начальной военной подготовки', 'M004', 'Подготовка педагогов начальной военной подготовки', 31, 28, 3, 10.71),
		(5, 'Подготовка педагогов физической культуры', 'M005', 'Подготовка педагогов физической культуры', 852, 795, 97, 12.20),
		(6, 'Подготовка педагогов музыки', 'M006', 'Подготовка педагогов музыки', 170, 162, 40, 24.69),
		(7, 'Подготовка педагогов художественного труда, графики и проектирования', 'M007', 'Подготовка педагогов художественного труда, графики и проектирования', 193, 178, 45, 25.28),
		(8, 'Основы права и экономики', 'M009', 'Основы права и экономики', 23, 16, 1, 6.25),
		(9, 'Подготовка педагогов математики', 'M010', 'Подготовка педагогов математики', 2381, 2290, 1287, 56.20),
		(10, 'Подготовка педагогов физики', 'M011', 'Подготовка педагогов физики', 999, 963, 415, 43.09),
		(11, 'Подготовка педагогов информатики', 'M012', 'Подготовка педагогов информатики', 1042, 979, 560, 57.20),
		(12, 'Подготовка педагогов химии', 'M013', 'Подготовка педагогов химии', 1248, 1190, 693, 58.24),
		(13, 'Подготовка педагогов биологии', 'M014', 'Подготовка педагогов биологии', 1543, 1475, 614, 41.63),
		(14, 'Подготовка педагогов географии', 'M015', 'Подготовка педагогов географии', 503, 477, 141, 29.56),
		(15, 'Подготовка педагогов истории', 'M016', 'Подготовка педагогов истории', 1080, 1010, 456, 45.15),
		(16, 'Подготовка педагогов казахского языка и литературы', 'M017', 'Подготовка педагогов казахского языка и литературы', 1939, 1850, 631, 34.11),
		(17, 'Подготовка педагогов русского языка и литературы', 'M018', 'Подготовка педагогов русского языка и литературы', 685, 654, 254, 38.84),
		(18, 'Подготовка педагогов иностранного языка', 'M019', 'Подготовка педагогов иностранного языка', 3800, 3604, 2735, 75.89),
		(19, 'Подготовка социальных педагогов', 'M020', 'Подготовка социальных педагогов', 63, 61, 32, 52.46),
		(20, 'Специальная педагогика', 'M021', 'Специальная педагогика', 525, 490, 283, 57.76),
		(21, 'Музыковедение', 'M022', 'Музыковедение', 9, 7, 6, 85.71),
		(22, 'Инструментальное исполнительство', 'M023', 'Инструментальное исполнительство', 61, 59, 46, 77.97),
		(23, 'Вокальное искусство', 'M024', 'Вокальное искусство', 24, 19, 11, 57.89),
		(24, 'Традиционное музыкальное искусство', 'M025', 'Традиционное музыкальное искусство', 92, 86, 60, 69.77),
		(25, 'Композиция', 'M026', 'Композиция', 4, 3, 2, 66.67),
		(26, 'Дирижирование', 'M027', 'Дирижирование', 19, 10, 9, 90.00),
		(27, 'Режиссура', 'M028', 'Режиссура', 66, 50, 44, 88.00),
		(28, 'Театральное искусство', 'M029', 'Театральное искусство', 21, 18, 13, 72.22),
		(29, 'Искусство эстрады', 'M030', 'Искусство эстрады', 17, 15, 12, 80.00),
		(30, 'Хореография', 'M031', 'Хореография', 23, 14, 13, 92.86),
		(31, 'Аудиовизуальное искусство и медиа производство', 'M032', 'Аудиовизуальное искусство и медиа производство', 34, 29, 23, 79.31),
		(32, 'Изобразительное искусство', 'M033', 'Изобразительное искусство', 44, 39, 31, 79.49),
		(33, 'Искусствоведение', 'M034', 'Искусствоведение', 22, 21, 13, 61.90),
		(34, 'Мода, дизайн', 'M035', 'Мода, дизайн', 170, 154, 104, 67.53),
		(35, 'Полиграфия', 'M036', 'Полиграфия', 18, 17, 12, 70.59),
		(36, 'Арт-менеджмент', 'M037', 'Арт-менеджмент', 37, 30, 21, 70.00),
		(37, 'Философия и этика', 'M050', 'Философия и этика', 80, 77, 38, 49.35),
		(38, 'Религия и теология', 'M051', 'Религия и теология', 176, 158, 68, 43.04),
		(39, 'Исламоведение', 'M052', 'Исламоведение', 97, 83, 82, 98.80),
		(40, 'История', 'M053', 'История', 134, 124, 52, 41.94),
		(41, 'Тюркология', 'M054', 'Тюркология', 17, 17, 12, 70.59),
		(42, 'Востоковедение', 'M055', 'Востоковедение', 87, 79, 62, 78.48),
		(43, 'Переводческое дело, синхронный перевод', 'M056', 'Переводческое дело, синхронный перевод', 217, 206, 155, 75.24),
		(44, 'Лингвистика', 'M057', 'Лингвистика', 22, 20, 13, 65.00),
		(45, 'Литература', 'M058', 'Литература', 31, 31, 20, 64.52),
		(46, 'Иностранная филология', 'M059', 'Иностранная филология', 259, 247, 165, 66.80),
		(47, 'Филология', 'M060', 'Филология', 287, 270, 162, 60.00),
		(48, 'Социология', 'M061', 'Социология', 92, 86, 43, 50.00),
		(49, 'Культурология', 'M062', 'Культурология', 34, 34, 18, 52.94),
		(50, 'Политология и конфликтология', 'M063', 'Политология и конфликтология', 145, 139, 65, 46.76),
		(51, 'Международные отношения', 'M064', 'Международные отношения', 366, 342, 224, 65.50),
		(52, 'Регионоведение', 'M065', 'Регионоведение', 29, 28, 24, 85.71),
		(53, 'Психология', 'M066', 'Психология', 763, 698, 421, 60.32),
		(54, 'Журналистика и репортерское дело', 'M067', 'Журналистика и репортерское дело', 379, 352, 89, 25.28),
		(55, 'Связь с общественностью', 'M068', 'Связь с общественностью', 85, 75, 25, 33.33),
		(56, 'Библиотечное дело, обработка информации и архивное дело', 'M069', 'Библиотечное дело, обработка информации и архивное дело', 51, 46, 12, 26.09),
		(57, 'Экономика', 'M070', 'Экономика', 788, 724, 287, 39.64),
		(58, 'Государственное и местное управление', 'M071', 'Государственное и местное управление', 425, 387, 125, 32.30),
		(59, 'Менеджмент', 'M072', 'Менеджмент', 1625, 1512, 1007, 66.60),
		(60, 'Аудит и налогообложение', 'M073', 'Аудит и налогообложение', 495, 437, 187, 42.79),
		(61, 'Финансы, банковское и страховое дело', 'M074', 'Финансы, банковское и страховое дело', 846, 766, 488, 63.71),
		(62, 'Маркетинг и реклама', 'M075', 'Маркетинг и реклама', 418, 377, 177, 46.95),
		(63, 'Трудовые навыки', 'M076', 'Трудовые навыки', 7, 5, 0, 0.00),
		(64, 'Оценка', 'M077', 'Оценка', 14, 13, 4, 30.77),
		(65, 'Право', 'M078', 'Право', 2296, 2065, 785, 38.01),
		(66, 'Судебная экспертиза', 'M079', 'Судебная экспертиза', 64, 61, 33, 54.10),
		(67, 'Биология', 'M080', 'Биология', 260, 243, 120, 49.38),
		(68, 'Генетика', 'M081', 'Генетика', 33, 32, 24, 75.00),
		(69, 'Биотехнология', 'M082', 'Биотехнология', 306, 289, 156, 53.98),
		(70, 'Геоботаника', 'M083', 'Геоботаника', 7, 7, 3, 42.86),
		(71, 'География', 'M084', 'География', 151, 146, 81, 55.48),
		(72, 'Гидрология', 'M085', 'Гидрология', 24, 23, 9, 39.13),
		(73, 'Метеорология', 'M086', 'Метеорология', 21, 21, 14, 66.67),
		(74, 'Технология охраны окружающей среды', 'M087', 'Технология охраны окружающей среды', 310, 294, 99, 33.67),
		(75, 'Гидрогеология и инженерная геология', 'M088', 'Гидрогеология и инженерная геология', 31, 31, 16, 51.61),
		(76, 'Химия', 'M089', 'Химия', 228, 222, 70, 31.53),
		(77, 'Физика', 'M090', 'Физика', 303, 291, 168, 57.73),
		(78, 'Сейсмология', 'M091', 'Сейсмология', 6, 6, 4, 66.67),
		(79, 'Математика и статистика', 'M092', 'Математика и статистика', 382, 361, 213, 59.00),
		(80, 'Механика', 'M093', 'Механика', 32, 32, 16, 50.00),
		(81, 'Информационные технологии', 'M094', 'Информационные технологии', 5139, 4897, 3301, 67.41),
		(82, 'Информационная безопасность', 'M095', 'Информационная безопасность', 874, 829, 426, 51.39),
		(83, 'Коммуникации и коммуникационные технологии', 'M096', 'Коммуникации и коммуникационные технологии', 330, 308, 107, 34.74),
		(84, 'Химическая инженерия и процессы', 'M097', 'Химическая инженерия и процессы', 367, 350, 190, 54.29),
		(85, 'Теплоэнергетика', 'M098', 'Теплоэнергетика', 189, 179, 32, 17.88),
		(86, 'Энергетика и электротехника', 'M099', 'Энергетика и электротехника', 932, 876, 236, 26.94),
		(87, 'Автоматизация и управление', 'M100', 'Автоматизация и управление', 618, 585, 273, 46.67),
		(88, 'Материаловедение и технология новых материалов', 'M101', 'Материаловедение и технология новых материалов', 46, 45, 18, 40.00),
		(89, 'Робототехника и мехатроника', 'M102', 'Робототехника и мехатроника', 131, 124, 27, 21.77),
		(90, 'Механика и металлообработка', 'M103', 'Механика и металлообработка', 311, 296, 59, 19.93),
		(91, 'Транспорт, транспортная техника и технологии', 'M104', 'Транспорт, транспортная техника и технологии', 334, 299, 93, 31.10),
		(92, 'Авиационная техника и технологии', 'M105', 'Авиационная техника и технологии', 52, 49, 30, 61.22),
		(93, 'Летная эксплуатация летательных аппаратов и двигателей', 'M106', 'Летная эксплуатация летательных аппаратов и двигателей', 20, 18, 16, 88.89),
		(94, 'Космическая инженерия', 'M107', 'Космическая инженерия', 62, 61, 42, 68.85),
		(95, 'Наноматериалы и нанотехнологии (по областям применения)', 'M108', 'Наноматериалы и нанотехнологии (по областям применения)', 39, 38, 23, 60.53),
		(96, 'Нефтяная и рудная геофизика', 'M109', 'Нефтяная и рудная геофизика', 49, 46, 16, 34.78),
		(97, 'Морская техника и технологии', 'M110', 'Морская техника и технологии', 12, 12, 5, 41.67),
		(98, 'Производство продуктов питания', 'M111', 'Производство продуктов питания', 355, 336, 68, 20.24),
		(99, 'Технология деревообработки и изделий из дерева (по областям применения)', 'M112', 'Технология деревообработки и изделий из дерева (по областям применения)', 3, 2, 0, 0.00),
		(100, 'Текстиль: одежда, обувь и кожаные изделия', 'M114', 'Текстиль: одежда, обувь и кожаные изделия', 73, 65, 16, 24.62),
		(101, 'Нефтяная инженерия', 'M115', 'Нефтяная инженерия', 484, 436, 145, 33.26),
		(102, 'Горная инженерия', 'M116', 'Горная инженерия', 306, 272, 75, 27.57),
		(103, 'Металлургическая инженерия', 'M117', 'Металлургическая инженерия', 129, 117, 4, 3.42),
		(104, 'Обогащение полезных ископаемых', 'M118', 'Обогащение полезных ископаемых', 70, 60, 15, 25.00),
		(105, 'Технология фармацевтического производства', 'M119', 'Технология фармацевтического производства', 311, 285, 73, 25.61),
		(106, 'Маркшейдерское дело', 'M120', 'Маркшейдерское дело', 27, 22, 5, 22.73),
		(107, 'Геология', 'M121', 'Геология', 213, 193, 61, 31.61),
		(108, 'Архитектура', 'M122', 'Архитектура', 395, 377, 203, 53.85),
		(109, 'Геодезия', 'M123', 'Геодезия', 416, 398, 86, 21.61),
		(110, 'Строительство', 'M124', 'Строительство', 948, 885, 340, 38.42),
		(111, 'Производство строительных материалов, изделий и конструкций', 'M125', 'Производство строительных материалов, изделий и конструкций', 152, 150, 59, 39.33),
		(112, 'Транспортное строительство', 'M126', 'Транспортное строительство', 74, 69, 12, 17.39),
		(113, 'Инженерные системы и сети', 'M127', 'Инженерные системы и сети', 102, 96, 42, 43.75),
		(114, 'Землеустройство', 'M128', 'Землеустройство', 278, 268, 41, 15.30),
		(115, 'Гидротехническое строительство', 'M129', 'Гидротехническое строительство', 2, 2, 2, 100.00),
		(116, 'Стандартизация, сертификация и метрология (по отраслям)', 'M130', 'Стандартизация, сертификация и метрология (по отраслям)', 237, 231, 69, 29.87),
		(117, 'Растениеводство', 'M131', 'Растениеводство', 183, 166, 26, 15.66),
		(118, 'Животноводство', 'M132', 'Животноводство', 64, 56, 17, 30.36),
		(119, 'Лесное хозяйство', 'M133', 'Лесное хозяйство', 107, 98, 26, 26.53),
		(120, 'Рыбное хозяйство', 'M134', 'Рыбное хозяйство', 17, 15, 3, 20.00),
		(121, 'Энергообеспечение сельского хозяйства', 'M135', 'Энергообеспечение сельского хозяйства', 12, 12, 1, 8.33),
		(122, 'Аграрная техника и технологии', 'M136', 'Аграрная техника и технологии', 43, 39, 6, 15.38),
		(123, 'Водные ресурсы и водопользования', 'M137', 'Водные ресурсы и водопользования', 54, 50, 10, 20.00),
		(124, 'Ветеринария', 'M138', 'Ветеринария', 230, 213, 72, 33.80),
		(125, 'Менеджмент в здравоохранении', 'M139', 'Менеджмент в здравоохранении', 226, 203, 57, 28.08),
		(126, 'Общественное здравоохранение', 'M140', 'Общественное здравоохранение', 481, 424, 165, 38.92),
		(127, 'Сестринское дело', 'M141', 'Сестринское дело', 64, 60, 23, 38.33),
		(128, 'Фармация', 'M142', 'Фармация', 434, 388, 107, 27.58),
		(129, 'Биомедицина', 'M143', 'Биомедицина', 16, 15, 4, 26.67),
		(130, 'Медицина', 'M144', 'Медицина', 287, 247, 101, 40.89),
		(131, 'Медико-профилактическое дело', 'M145', 'Медико-профилактическое дело', 51, 45, 9, 20.00),
		(132, 'Социальная работа', 'M146', 'Социальная работа', 142, 138, 32, 23.19),
		(133, 'Туризм', 'M147', 'Туризм', 313, 290, 185, 63.79),
		(134, 'Досуг', 'M148', 'Досуг', 23, 23, 1, 4.35),
		(135, 'Ресторанное дело и гостиничный бизнес', 'M149', 'Ресторанное дело и гостиничный бизнес', 141, 129, 60, 46.51),
		(136, 'Санитарно-профилактические мероприятия', 'M150', 'Санитарно-профилактические мероприятия', 323, 312, 96, 30.77),
		(137, 'Транспортные услуги', 'M151', 'Транспортные услуги', 174, 153, 64, 41.83),
		(138, 'Логистика (по отраслям)', 'M152', 'Логистика (по отраслям)', 219, 207, 140, 67.63),
		(139, 'Археология и этнология', 'M153', 'Археология и этнология', 31, 29, 13, 44.83),
		(140, 'Спорт', 'M154', 'Спорт', 4, 4, 1, 25.00),
		(141, 'Государственный аудит', 'M173', 'Государственный аудит', 68, 59, 30, 50.85),
		(142, 'Криптология', 'M195', 'Криптология', 19, 18, 9, 50.00),
		(143, 'Подготовка педагогов профессионального обучения', 'M200', 'Подготовка педагогов профессионального обучения', 10, 0, 0, 0.00),
		(144, 'Магистральные сети и инфраструктура', 'M210', 'Магистральные сети и инфраструктура', 20, 19, 4, 21.05),
		(145, 'Транспортные сооружения', 'M310', 'Транспортные сооружения', 13, 12, 2, 16.67),
		(146, 'Водоснабжение и водоотведение', 'M329', 'Водоснабжение и водоотведение', 3, 1, 0, 0.00),
		(147, 'Гидротехническое строительство и управление водными ресурсами', 'M429', 'Гидротехническое строительство и управление водными ресурсами', 1, 1, 0, 0.00)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name, code = EXCLUDED.code, profile_subject = EXCLUDED.profile_subject,
			kt_applications = EXCLUDED.kt_applications, kt_participants = EXCLUDED.kt_participants,
			kt_passed = EXCLUDED.kt_passed, kt_passed_pct = EXCLUDED.kt_passed_pct`); err != nil {
		return err
	}
	// Старые демо-данные приёма (4 направления) ссылались на прежнюю нумерацию 1-4.
	// Переносим их на реальные id ГОП: IT->81, Экономика->57, Право->65, Педагогика->1
	// (id=1 у Педагогики совпал случайно — правильные значения проставит DO UPDATE ниже);
	// прочую утратившую смысл привязку к 2,3,4 (теперь другие ГОП) удаляем.
	if _, err := db.Exec(`DELETE FROM admission_rules WHERE speciality_id IN (2, 3, 4) AND year = 2025`); err != nil {
		return err
	}
	// Статистика приёма 2025 (демо-данные по 3 вузам; NULL-строки Satbayev не заводим — приёма нет)
	if _, err := db.Exec(`INSERT INTO admission_rules
		(university_id, speciality_id, year, min_foreign_score, min_profile_score, grant_count, avg_passing_score, applicants_count) VALUES
		(1, 81, 2025, 25, 25, 35, 131, 320),
		(1, 57, 2025, 25, 25, 20, 127, 280),
		(1, 65, 2025, 25, 25, 15, 138, 350),
		(1, 1,  2025, 25, 25, 25, 112, 180),
		(2, 81, 2025, 25, 25, 30, 125, 290),
		(2, 57, 2025, 25, 25, 25, 122, 250),
		(2, 65, 2025, 25, 25, 20, 134, 310),
		(2, 1,  2025, 25, 25, 30, 108, 160),
		(3, 81, 2025, 25, 25, 40, 135, 380),
		(3, 57, 2025, 25, 25, 15, 119, 190)
		ON CONFLICT (university_id, speciality_id, year) DO UPDATE SET
			min_foreign_score = EXCLUDED.min_foreign_score, min_profile_score = EXCLUDED.min_profile_score,
			grant_count = EXCLUDED.grant_count, avg_passing_score = EXCLUDED.avg_passing_score,
			applicants_count = EXCLUDED.applicants_count`); err != nil {
		return err
	}
	// Шаблон дорожной карты 2026
	_, err := db.Exec(`INSERT INTO checklist_templates(year, step_order, description, deadline) VALUES
		(2026, 1, 'Зарегистрироваться на Комплексное тестирование (КТ) на сайте Национального центра тестирования', '2026-08-05'),
		(2026, 2, 'Сдать КТ (иностранный язык + профильный предмет)', '2026-08-10'),
		(2026, 3, 'Получить электронный сертификат КТ с баллами', '2026-08-12'),
		(2026, 4, 'Подать заявление и документы в приёмную комиссию вуза (онлайн или очно)', '2026-08-20'),
		(2026, 5, 'Пройти собеседование (если требуется педагогической специальностью)', '2026-08-22'),
		(2026, 6, 'Участие в конкурсе государственных грантов (автоматически)', '2026-08-25'),
		(2026, 7, 'Заключить договор и принести оригиналы документов в вуз', '2026-08-30'),
		(2026, 8, 'Приказ о зачислении', '2026-08-31')
		ON CONFLICT (year, step_order) DO NOTHING`)
	return err
}

/* ---------------- Справочники (публичные) ---------------- */

func handleUniversities(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`SELECT id, name, city, lat, lng FROM universities ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type U struct {
		ID   int     `json:"id"`
		Name string  `json:"name"`
		City string  `json:"city"`
		Lat  float64 `json:"lat"`
		Lng  float64 `json:"lng"`
	}
	out := []U{}
	for rows.Next() {
		var u U
		rows.Scan(&u.ID, &u.Name, &u.City, &u.Lat, &u.Lng)
		out = append(out, u)
	}
	writeJSON(w, http.StatusOK, out)
}

func handleSpecialities(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT id, name, code, profile_subject, kt_applications, kt_participants, kt_passed, kt_passed_pct
		FROM specialities ORDER BY id`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type S struct {
		ID             int     `json:"id"`
		Name           string  `json:"name"`
		Code           string  `json:"code"`
		ProfileSubject string  `json:"profile_subject"`
		KTApplications int     `json:"kt_applications"`
		KTParticipants int     `json:"kt_participants"`
		KTPassed       int     `json:"kt_passed"`
		KTPassedPct    float64 `json:"kt_passed_pct"`
	}
	out := []S{}
	for rows.Next() {
		var s S
		rows.Scan(&s.ID, &s.Name, &s.Code, &s.ProfileSubject, &s.KTApplications, &s.KTParticipants, &s.KTPassed, &s.KTPassedPct)
		out = append(out, s)
	}
	writeJSON(w, http.StatusOK, out)
}

/* ---------------- Тепловая карта (публичная) ---------------- */

func handleHeatmap(w http.ResponseWriter, r *http.Request) {
	spec := r.URL.Query().Get("speciality_id")
	if spec == "" {
		writeError(w, http.StatusBadRequest, "Не указана speciality_id")
		return
	}
	rows, err := db.Query(`
		SELECT u.id, u.name, u.city, u.lat, u.lng, ar.grant_count, ar.avg_passing_score, ar.applicants_count
		FROM admission_rules ar JOIN universities u ON u.id = ar.university_id
		WHERE ar.speciality_id = $1 AND ar.year = (SELECT MAX(year) FROM admission_rules WHERE speciality_id = $1)
		ORDER BY u.id`, spec)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()
	type H struct {
		UniversityID     int     `json:"university_id"`
		Name             string  `json:"name"`
		City             string  `json:"city"`
		Lat              float64 `json:"lat"`
		Lng              float64 `json:"lng"`
		CompetitionRatio float64 `json:"competition_ratio"`
		AvgScore         float64 `json:"avg_score"`
		GrantCount       int     `json:"grant_count"`
	}
	out := []H{}
	for rows.Next() {
		var h H
		var applicants int
		rows.Scan(&h.UniversityID, &h.Name, &h.City, &h.Lat, &h.Lng, &h.GrantCount, &h.AvgScore, &applicants)
		if h.GrantCount > 0 {
			h.CompetitionRatio = float64(applicants) / float64(h.GrantCount)
		}
		out = append(out, h)
	}
	writeJSON(w, http.StatusOK, out)
}

/* ---------------- Калькулятор шансов (auth) ---------------- */

func handleCalculate(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	uni, spec := q.Get("university_id"), q.Get("speciality_id")
	foreign, profile, bonus := atoiSafe(q.Get("foreign")), atoiSafe(q.Get("profile")), atoiSafe(q.Get("bonus"))
	if uni == "" || spec == "" {
		writeError(w, http.StatusBadRequest, "Укажите университет и специальность")
		return
	}
	total := foreign + profile + bonus

	var ktApplications, ktParticipants, ktPassed int
	var ktPassedPct float64
	if err := db.QueryRow(`
		SELECT kt_applications, kt_participants, kt_passed, kt_passed_pct
		FROM specialities WHERE id = $1`, spec).Scan(&ktApplications, &ktParticipants, &ktPassed, &ktPassedPct); err != nil {
		writeError(w, http.StatusNotFound, "Специальность не найдена")
		return
	}
	ktStats := map[string]any{
		"applications": ktApplications, "participants": ktParticipants,
		"passed": ktPassed, "passed_pct": ktPassedPct,
	}

	var avg float64
	var grants, applicants, minF, minP int
	err := db.QueryRow(`
		SELECT avg_passing_score, grant_count, applicants_count, min_foreign_score, min_profile_score
		FROM admission_rules WHERE university_id = $1 AND speciality_id = $2
		ORDER BY year DESC LIMIT 1`, uni, spec).Scan(&avg, &grants, &applicants, &minF, &minP)
	if err != nil {
		// По этой группе нет данных о проходных баллах в данном вузе — отдаём
		// хотя бы общестрановую статистику КТ-2025, без выдуманного вердикта о шансах.
		writeJSON(w, http.StatusOK, map[string]any{
			"total": total, "level": "no_data",
			"message": fmt.Sprintf(
				"Пока нет статистики проходных баллов по вузам для этой группы. По стране на КТ-2025 порог набрали %.1f%% из %d участников.",
				ktPassedPct, ktParticipants),
			"kt_stats": ktStats,
		})
		return
	}

	var level, message string
	switch {
	case foreign < minF || profile < minP:
		level = "none"
		message = "Ниже минимального порога (25/25) — к конкурсу не допускают."
	case float64(total) >= avg+5:
		level = "high"
		message = "Высокий шанс: ваш балл заметно выше прошлогоднего среднего проходного."
	case float64(total) >= avg-5:
		level = "medium"
		message = "Средний шанс: вы на уровне прошлогоднего проходного балла — всё решит конкуренция."
	default:
		level = "low"
		message = "Низкий шанс: ваш балл ниже прошлогоднего проходного."
	}

	// Рекомендации при низком шансе: другие вузы этой специальности с меньшим проходным
	type Rec struct {
		UniversityID int     `json:"university_id"`
		Name         string  `json:"name"`
		City         string  `json:"city"`
		AvgScore     float64 `json:"avg_score"`
		Ratio        float64 `json:"competition_ratio"`
	}
	recs := []Rec{}
	if level == "low" || level == "none" {
		rows, err := db.Query(`
			SELECT u.id, u.name, u.city, ar.avg_passing_score,
			       CASE WHEN ar.grant_count > 0 THEN ar.applicants_count::float / ar.grant_count ELSE 0 END AS ratio
			FROM admission_rules ar JOIN universities u ON u.id = ar.university_id
			WHERE ar.speciality_id = $1 AND ar.university_id <> $2
			ORDER BY ar.avg_passing_score ASC LIMIT 3`, spec, uni)
		if err == nil {
			for rows.Next() {
				var rec Rec
				rows.Scan(&rec.UniversityID, &rec.Name, &rec.City, &rec.AvgScore, &rec.Ratio)
				recs = append(recs, rec)
			}
			rows.Close()
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total": total, "avg_passing_score": avg,
		"grant_count": grants, "applicants_count": applicants,
		"level": level, "message": message,
		"recommendations": recs,
		"kt_stats":        ktStats,
	})
}

func atoiSafe(s string) int {
	n := 0
	for _, c := range s {
		if c < '0' || c > '9' {
			return n
		}
		n = n*10 + int(c-'0')
	}
	return n
}

/* ---------------- Дорожная карта (auth) ---------------- */

type RoadmapStep struct {
	TemplateID  int64  `json:"template_id"`
	StepOrder   int    `json:"step_order"`
	Description string `json:"description"`
	Deadline    string `json:"deadline"`
	Completed   bool   `json:"completed"`
	CompletedAt string `json:"completed_at,omitempty"`
}

// GET /api/roadmap — при первом обращении копирует шаги из шаблона.
func handleRoadmap(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	year := time.Now().Year()

	// генерация при первом входе: вставляем недостающие шаги текущего года
	if _, err := db.Exec(`
		INSERT INTO user_checklist(user_id, template_id)
		SELECT $1, id FROM checklist_templates WHERE year = $2
		ON CONFLICT (user_id, template_id) DO NOTHING`, uid, year); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось создать дорожную карту")
		return
	}

	rows, err := db.Query(`
		SELECT t.id, t.step_order, t.description, t.deadline::text, uc.completed, COALESCE(uc.completed_at::text, '')
		FROM user_checklist uc JOIN checklist_templates t ON t.id = uc.template_id
		WHERE uc.user_id = $1 AND t.year = $2
		ORDER BY t.step_order`, uid, year)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Ошибка сервера")
		return
	}
	defer rows.Close()

	steps := []RoadmapStep{}
	done := 0
	for rows.Next() {
		var s RoadmapStep
		rows.Scan(&s.TemplateID, &s.StepOrder, &s.Description, &s.Deadline, &s.Completed, &s.CompletedAt)
		if s.Completed {
			done++
		}
		steps = append(steps, s)
	}
	progress := 0
	if len(steps) > 0 {
		progress = done * 100 / len(steps)
	}
	writeJSON(w, http.StatusOK, map[string]any{"year": year, "progress": progress, "steps": steps})
}

// POST /api/roadmap/toggle {template_id}
func handleRoadmapToggle(w http.ResponseWriter, r *http.Request) {
	uid := currentUID(r)
	var in struct {
		TemplateID int64 `json:"template_id"`
	}
	if err := decode(r, &in); err != nil || in.TemplateID <= 0 {
		writeError(w, http.StatusBadRequest, "Не указан шаг")
		return
	}
	if _, err := db.Exec(`
		UPDATE user_checklist SET
			completed = NOT completed,
			completed_at = CASE WHEN NOT completed THEN NOW() ELSE NULL END
		WHERE user_id = $1 AND template_id = $2`, uid, in.TemplateID); err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось обновить шаг")
		return
	}
	handleRoadmap(w, r)
}
