package store

// User — то, что отдаётся фронтенду (без пароля).
type User struct {
	Name       string      `json:"name"`
	Email      string      `json:"email"`
	Profile    Profile     `json:"profile"`
	Favorites  []string    `json:"favorites"`
	Results    []Result    `json:"results"`
	Access     []string    `json:"access"` // коды направлений, к которым выдан доступ
	TopicStats []TopicStat `json:"topicStats"`
}

type Profile struct {
	FullName  string `json:"fullName"`
	Phone     string `json:"phone"`
	Education string `json:"education"`
	City      string `json:"city"`
	// Avatar — data URL картинки профиля (data:image/jpeg;base64,...), пусто = нет.
	Avatar string `json:"avatar"`
	// МагистрТрек: цель поступления и баллы КТ
	SpecialityID int    `json:"specialityId"`
	Language     string `json:"language"`   // rus / kaz / eng
	TargetType   string `json:"targetType"` // grant / paid / any
	ForeignScore int    `json:"foreignScore"`
	ProfileScore int    `json:"profileScore"`
	BonusPoints  int    `json:"bonusPoints"`
}

type Result struct {
	Code  string `json:"code"`
	Score int    `json:"score"`
	Total int    `json:"total"`
	Date  string `json:"date"`
	// Kind: "subject" — обычный тест по предмету, "kt:nauchped"/"kt:profile" —
	// полная симуляция КТ. Пусто — старые результаты до появления поля.
	Kind string `json:"kind"`
	// Passed — вердикт «сдал/не сдал», посчитанный сервером при
	// сдаче попытки (по правилам КТ; из одной суммы его не восстановить).
	Passed bool `json:"passed"`
	// Section — блок (lang/logic/subj1/subj2) для обычного теста по предмету.
	Section string `json:"section"`
	// AttemptID — попытка, из которой получен результат (разбор ответов в кабинете);
	// пусто у старых результатов, у которых попыток не было.
	AttemptID string `json:"attemptId"`
}

// TopicStat — накопленная статистика по одной теме предмета.
type TopicStat struct {
	Code    string `json:"code"`
	Section string `json:"section"`
	Topic   string `json:"topic"`
	Correct int    `json:"correct"`
	Wrong   int    `json:"wrong"`
}

// TopicHit — один вопрос завершённой попытки: тема + верность + раздел.
type TopicHit struct {
	Topic   string
	Correct bool
	Section string
}

// AccessGrant — одна выданная пара (код направления, язык теста).
type AccessGrant struct {
	Code     string `json:"code"`
	Language string `json:"language"`
}

// AdminUser — безопасное представление пользователя для админ-списка.
type AdminUser struct {
	ID        int64         `json:"id"`
	Name      string        `json:"name"`
	Email     string        `json:"email"`
	Phone     string        `json:"phone"`
	Education string        `json:"education"`
	City      string        `json:"city"`
	Favorites []string      `json:"favorites"`
	Results   int           `json:"results"`
	CreatedAt string        `json:"created_at"`
	Access    []AccessGrant `json:"access"`
}

type AuditEntry struct {
	ID        int64  `json:"id"`
	Action    string `json:"action"`
	Target    string `json:"target"`
	Detail    string `json:"detail"`
	ActorIP   string `json:"actor_ip"`
	CreatedAt string `json:"created_at"`
}
