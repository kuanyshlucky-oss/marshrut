//go:build integration

// Нагрузочный тест API: поднимает настоящий Postgres (embedded), запускает
// собранный сервер ОТДЕЛЬНЫМ процессом (чтобы можно было ограничить ему CPU через
// GOMAXPROCS) и гоняет виртуальных пользователей ступенями.
//
//	go build -o loadtest-api.exe ./cmd/api
//	go run -tags integration ./cmd/loadtest -bin loadtest-api.exe -procs 2 -dbconns 5
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"marshrut-api/internal/auth"
	"marshrut-api/internal/store"
	"marshrut-api/internal/testdb"
)

const password = "load-test-password"

var (
	bin        = flag.String("bin", "loadtest-api.exe", "собранный бинарь сервера")
	procs      = flag.Int("procs", 0, "GOMAXPROCS сервера (0 = все ядра)")
	dbconns    = flag.Int("dbconns", 5, "DB_MAX_CONNS сервера (прод: 5)")
	nUsers     = flag.Int("users", 4000, "сколько аккаунтов создать")
	stageSec   = flag.Int("sec", 15, "длительность каждой ступени, сек")
	vuList     = flag.String("vus", "100,250,500,1000,1500,2000,3000,4000", "ступени одновременных пользователей")
	port       = flag.Int("port", 18080, "порт сервера")
	attemptsN  = flag.Int("attempts", 0, "только сценарий сдачи теста для N одновременных пользователей")
	listeningN = flag.Int("listening", 0, "только сценарий Listening для N одновременных пользователей")
)

type sample struct {
	d   time.Duration
	err bool
}

type result struct {
	n, errs  int
	p50, p95 time.Duration
	p99, max time.Duration
	rps      float64
}

func summarize(all []sample, wall time.Duration) result {
	r := result{n: len(all)}
	if len(all) == 0 {
		return r
	}
	ds := make([]time.Duration, 0, len(all))
	for _, s := range all {
		if s.err {
			r.errs++
		}
		ds = append(ds, s.d)
	}
	sort.Slice(ds, func(i, j int) bool { return ds[i] < ds[j] })
	q := func(p float64) time.Duration { return ds[int(float64(len(ds)-1)*p)] }
	r.p50, r.p95, r.p99, r.max = q(.5), q(.95), q(.99), ds[len(ds)-1]
	r.rps = float64(len(all)) / wall.Seconds()
	return r
}

func (r result) String() string {
	return fmt.Sprintf("req=%-7d err=%-5d (%.2f%%)  rps=%-7.0f p50=%-7v p95=%-7v p99=%-7v max=%v",
		r.n, r.errs, 100*float64(r.errs)/float64(max(r.n, 1)), r.rps,
		r.p50.Round(time.Millisecond), r.p95.Round(time.Millisecond), r.p99.Round(time.Millisecond), r.max.Round(time.Millisecond))
}

type user struct {
	email, token, ip string
}

var (
	base   string
	client *http.Client
)

func do(method, path string, body any, tok, ip string) (int, []byte, time.Duration) {
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, base+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}
	if ip != "" {
		req.Header.Set("X-Forwarded-For", ip)
	}
	t0 := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return 0, nil, time.Since(t0)
	}
	b, err := io.ReadAll(resp.Body)
	resp.Body.Close()
	d := time.Since(t0)
	if err != nil {
		return 0, nil, d
	}
	return resp.StatusCode, b, d
}

// hammer: c воркеров непрерывно (без пауз) бьют в один запрос sec секунд.
func hammer(c int, sec int, fn func(i int) (int, time.Duration)) result {
	var mu sync.Mutex
	var all []sample
	stop := time.Now().Add(time.Duration(sec) * time.Second)
	var wg sync.WaitGroup
	t0 := time.Now()
	for i := 0; i < c; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			local := make([]sample, 0, 4096)
			for time.Now().Before(stop) {
				code, d := fn(i)
				local = append(local, sample{d, code != 200})
			}
			mu.Lock()
			all = append(all, local...)
			mu.Unlock()
		}(i)
	}
	wg.Wait()
	return summarize(all, time.Since(t0))
}

func main() {
	flag.Parse()
	fmt.Printf("# машина: %d логич. ядер, %s/%s, Go %s\n", runtime.NumCPU(), runtime.GOOS, runtime.GOARCH, runtime.Version())

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pg, err := testdb.Start()
	must(err)
	defer pg.Stop()
	dsn, err := pg.NewDB()
	must(err)

	// --- сервер как отдельный процесс ---
	env := append(os.Environ(),
		"PORT="+strconv.Itoa(*port), "DATABASE_URL="+dsn,
		"JWT_SECRET=load-test-secret-load-test-secret-123", "ADMIN_KEY=load-admin-key-load-admin-key",
		"TRUSTED_PROXY_HOPS=1", "ALLOWED_ORIGIN=*", "LOG_FORMAT=text",
		"DB_MAX_CONNS="+strconv.Itoa(*dbconns))
	if *procs > 0 {
		env = append(env, "GOMAXPROCS="+strconv.Itoa(*procs))
	}
	cmd := exec.CommandContext(ctx, *bin)
	cmd.Env = env
	logf, _ := os.Create("loadtest-server.log")
	cmd.Stdout, cmd.Stderr = logf, logf
	must(cmd.Start())
	defer func() { cancel(); cmd.Wait() }()
	fmt.Printf("# сервер: GOMAXPROCS=%v DB_MAX_CONNS=%d (Postgres локальный, на той же машине)\n", ifz(*procs, "все"), *dbconns)

	base = "http://127.0.0.1:" + strconv.Itoa(*port)
	client = &http.Client{Timeout: 30 * time.Second, Transport: &http.Transport{
		MaxIdleConns: 10000, MaxIdleConnsPerHost: 10000, MaxConnsPerHost: 0, IdleConnTimeout: 90 * time.Second,
	}}
	waitReady()

	// --- аккаунты ---
	st, err := store.Open(ctx, dsn, 10)
	must(err)
	defer st.Close()
	hash, err := auth.HashPassword(password)
	must(err)
	users := make([]*user, *nUsers)
	for i := range users {
		email := fmt.Sprintf("load%d@test.kz", i)
		_, err := st.CreateUser(ctx, fmt.Sprintf("Load %d", i), email, hash)
		must(err)
		users[i] = &user{email: email, ip: fmt.Sprintf("10.%d.%d.%d", i>>16&255, i>>8&255, i&255)}
	}
	fmt.Printf("# создано аккаунтов: %d\n\n", len(users))

	if *listeningN > 0 {
		runListening(users[:*listeningN])
		return
	}
	if *attemptsN > 0 {
		runAttempts(users[:*attemptsN])
		return
	}

	// A. Лёгкие публичные эндпоинты (сырая пропускная способность)
	fmt.Println("== A. GET /api/health (без БД), непрерывный поток без пауз ==")
	for _, c := range []int{50, 200, 500, 1000} {
		r := hammer(c, 8, func(i int) (int, time.Duration) { code, _, d := do("GET", "/api/health", nil, "", ""); return code, d })
		fmt.Printf("  conn=%-5d %v\n", c, r)
	}
	fmt.Println("\n== B. GET /api/specialities (публичный справочник) ==")
	for _, c := range []int{50, 200, 500, 1000} {
		r := hammer(c, 8, func(i int) (int, time.Duration) {
			code, _, d := do("GET", "/api/specialities", nil, "", "")
			return code, d
		})
		fmt.Printf("  conn=%-5d %v\n", c, r)
	}

	// C. Вход: bcrypt — самая дорогая операция
	fmt.Println("\n== C. POST /api/auth/login (bcrypt cost 10 + запись сессии) ==")
	off := 0 // волны берут разных пользователей: повторный вход сбросил бы прежнюю сессию
	for _, burst := range []int{50, 200, 500, 1000} {
		if off+burst > len(users) {
			break
		}
		var mu sync.Mutex
		var all []sample
		var wg sync.WaitGroup
		t0 := time.Now()
		for i := 0; i < burst; i++ {
			wg.Add(1)
			go func(u *user) {
				defer wg.Done()
				code, b, d := do("POST", "/api/auth/login", map[string]string{"email": u.email, "password": password}, "", u.ip)
				if code == 200 {
					var m struct{ Token string }
					_ = json.Unmarshal(b, &m)
					u.token = m.Token
				}
				mu.Lock()
				all = append(all, sample{d, code != 200})
				mu.Unlock()
			}(users[off+i])
		}
		wg.Wait()
		off += burst
		r := summarize(all, time.Since(t0))
		fmt.Printf("  %d входов одновременно: %v  (всё заняло %v)\n", burst, r, time.Since(t0).Round(time.Millisecond))
	}
	// дологиниться всем, у кого ещё нет токена (тихо)
	sem := make(chan struct{}, 100)
	var wg sync.WaitGroup
	for _, u := range users {
		if u.token != "" {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(u *user) {
			defer wg.Done()
			defer func() { <-sem }()
			code, b, _ := do("POST", "/api/auth/login", map[string]string{"email": u.email, "password": password}, "", u.ip)
			if code == 200 {
				var m struct{ Token string }
				_ = json.Unmarshal(b, &m)
				u.token = m.Token
			}
		}(u)
	}
	wg.Wait()
	ok := 0
	for _, u := range users {
		if u.token != "" {
			ok++
		}
	}
	fmt.Printf("  токенов получено: %d из %d\n", ok, len(users))

	// D. Авторизованный запрос без пауз
	fmt.Println("\n== D. GET /api/me с токеном (проверка сессии + чтение пользователя из БД) ==")
	for _, c := range []int{50, 200, 500, 1000} {
		r := hammer(c, 8, func(i int) (int, time.Duration) {
			u := users[i%len(users)]
			code, _, d := do("GET", "/api/me", nil, u.token, "")
			return code, d
		})
		fmt.Printf("  conn=%-5d %v\n", c, r)
	}

	// E. Реалистичный сценарий: пользователь листает сайт с паузами 1–3 с
	fmt.Printf("\n== E. Реалистичная нагрузка: N одновременных пользователей, каждый: me → specialities → universities → roadmap → пауза 1–3 с (%d с на ступень) ==\n", *stageSec)
	var best int
	for _, s := range strings.Split(*vuList, ",") {
		n, _ := strconv.Atoi(strings.TrimSpace(s))
		if n <= 0 || n > len(users) {
			continue
		}
		var mu sync.Mutex
		var all []sample
		var wg sync.WaitGroup
		stop := time.Now().Add(time.Duration(*stageSec) * time.Second)
		t0 := time.Now()
		for i := 0; i < n; i++ {
			wg.Add(1)
			go func(u *user, seed int64) {
				defer wg.Done()
				rng := rand.New(rand.NewSource(seed))
				time.Sleep(time.Duration(rng.Intn(2000)) * time.Millisecond) // разбег, чтобы не стартовать залпом
				local := make([]sample, 0, 64)
				for time.Now().Before(stop) {
					for _, p := range []string{"/api/me", "/api/specialities", "/api/universities", "/api/roadmap"} {
						code, _, d := do("GET", p, nil, u.token, "")
						local = append(local, sample{d, code != 200})
						time.Sleep(time.Duration(1000+rng.Intn(2000)) * time.Millisecond)
						if !time.Now().Before(stop) {
							break
						}
					}
				}
				mu.Lock()
				all = append(all, local...)
				mu.Unlock()
			}(users[i], int64(i))
		}
		wg.Wait()
		r := summarize(all, time.Since(t0))
		errPct := 100 * float64(r.errs) / float64(max(r.n, 1))
		verdict := "OK"
		if r.p95 > time.Second || errPct > 1 {
			verdict = "ПЕРЕГРУЗ"
		} else {
			best = n
		}
		fmt.Printf("  VU=%-5d %v  [%s]\n", n, r, verdict)
		if errPct > 20 {
			break
		}
	}
	fmt.Printf("\n# ИТОГ: максимум одновременных пользователей при p95<1с и ошибках<1%%: %d\n", best)
}

// runAttempts: N пользователей входят, затем ОДНОВРЕМЕННО начинают тест (logic, 7M01),
// сдают его (все ответы пустые) и открывают разбор. Каждый этап — залпом, без разбега.
func runAttempts(us []*user) {
	fmt.Printf("== F. Тест: %d пользователей одновременно ==\n", len(us))
	stage := func(name string, fn func(u *user) (int, time.Duration)) {
		var mu sync.Mutex
		var all []sample
		var wg sync.WaitGroup
		start := make(chan struct{})
		t0 := time.Now()
		for _, u := range us {
			wg.Add(1)
			go func(u *user) {
				defer wg.Done()
				<-start
				code, d := fn(u)
				mu.Lock()
				all = append(all, sample{d, code != 200})
				mu.Unlock()
			}(u)
		}
		close(start)
		wg.Wait()
		fmt.Printf("  %-26s %v\n", name, summarize(all, time.Since(t0)))
	}
	stage("вход (bcrypt)", func(u *user) (int, time.Duration) {
		code, b, d := do("POST", "/api/auth/login", map[string]string{"email": u.email, "password": password}, "", u.ip)
		if code == 200 {
			var m struct{ Token string }
			_ = json.Unmarshal(b, &m)
			u.token = m.Token
		}
		return code, d
	})
	ids := map[*user]string{}
	nq := map[*user]int{}
	var mu sync.Mutex
	var bytesTotal int64
	stage("старт теста (вопросы)", func(u *user) (int, time.Duration) {
		code, b, d := do("POST", "/api/attempts", map[string]string{"kind": "subject", "code": "7M01", "section": "logic"}, u.token, "")
		if code == 200 {
			var m struct {
				ID        string
				Questions []any
			}
			_ = json.Unmarshal(b, &m)
			mu.Lock()
			ids[u], nq[u] = m.ID, len(m.Questions)
			bytesTotal += int64(len(b))
			mu.Unlock()
		}
		return code, d
	})
	fmt.Printf("    (вопросов в тесте: %d, размер ответа ~%d КБ)\n", nq[us[0]], bytesTotal/int64(len(us))/1024)
	stage("сдача теста (проверка)", func(u *user) (int, time.Duration) {
		ans := make([]any, nq[u])
		code, _, d := do("POST", "/api/attempts/"+ids[u]+"/submit", map[string]any{"answers": ans}, u.token, "")
		return code, d
	})
	stage("разбор (ключи+вопросы)", func(u *user) (int, time.Duration) {
		code, _, d := do("GET", "/api/attempts/"+ids[u]+"/review", nil, u.token, "")
		return code, d
	})
}

func waitReady() {
	for i := 0; i < 100; i++ {
		resp, err := http.Get(base + "/api/health")
		if err == nil {
			resp.Body.Close()
			if resp.StatusCode == 200 {
				return
			}
		}
		time.Sleep(200 * time.Millisecond)
	}
	must(fmt.Errorf("сервер не поднялся, см. loadtest-server.log"))
}

func ifz(n int, s string) any {
	if n == 0 {
		return s
	}
	return n
}

func must(err error) {
	if err != nil {
		fmt.Fprintln(os.Stderr, "ошибка:", err)
		os.Exit(1)
	}
}

var _ = atomic.Int64{}

// runListening: N пользователей входят, затем (1) все разом открывают каталог (GET /api/listening),
// (2) все разом сохраняют результат клипа (POST) — как класс, закончивший задание по звонку,
// (3) -sec секунд живут реалистично: открыть каталог → пройти 3 клипа с паузами 2–5 с (POST) → снова каталог,
// (4) повторно открывают каталог, когда у каждого накоплена история по нескольким клипам.
func runListening(us []*user) {
	fmt.Printf("== G. Listening: %d пользователей ==\n", len(us))
	clips := []string{"nemo-keep-swimming", "dory-hank-driving", "cars-meet-mater", "zootopia-popsicle", "forrest-gump-chocolates", "shrek-ogres-onions", "matrix-red-pill", "dark-knight-joker"}
	stage := func(name string, fn func(i int, u *user) (int, time.Duration)) {
		var mu sync.Mutex
		var all []sample
		codes := map[int]int{}
		var wg sync.WaitGroup
		start := make(chan struct{})
		t0 := time.Now()
		for i, u := range us {
			wg.Add(1)
			go func(i int, u *user) {
				defer wg.Done()
				<-start
				code, d := fn(i, u)
				mu.Lock()
				codes[code]++
				all = append(all, sample{d, code != 200})
				mu.Unlock()
			}(i, u)
		}
		close(start)
		wg.Wait()
		fmt.Printf("  %-44s %v  коды: %v\n", name, summarize(all, time.Since(t0)), codes)
	}
	// вход (bcrypt) — не часть замера Listening, но токены нужны; ограничиваем параллелизм, как при реальных заходах
	sem := make(chan struct{}, 100)
	var wg sync.WaitGroup
	for _, u := range us {
		wg.Add(1)
		sem <- struct{}{}
		go func(u *user) {
			defer wg.Done()
			defer func() { <-sem }()
			code, b, _ := do("POST", "/api/auth/login", map[string]string{"email": u.email, "password": password}, "", u.ip)
			if code == 200 {
				var m struct{ Token string }
				_ = json.Unmarshal(b, &m)
				u.token = m.Token
			}
		}(u)
	}
	wg.Wait()
	ok := 0
	for _, u := range us {
		if u.token != "" {
			ok++
		}
	}
	fmt.Printf("  вошли: %d из %d\n", ok, len(us))

	post := func(i int, u *user, clip string, n int) (int, time.Duration) {
		id := fmt.Sprintf("load-%d-%s-%d", i, clip, n)
		code, _, d := do("POST", "/api/listening/result", map[string]any{"id": id, "clip": clip, "score": 40 + (i+n)%60, "phrases": []int{100, 80, 60, 40, 20, 0, 100, 90}}, u.token, "")
		return code, d
	}
	get := func(u *user) (int, time.Duration) {
		code, _, d := do("GET", "/api/listening", nil, u.token, "")
		return code, d
	}

	stage("1. залпом открыть каталог (GET)", func(i int, u *user) (int, time.Duration) { return get(u) })
	stage("2. залпом сохранить результат (POST)", func(i int, u *user) (int, time.Duration) { return post(i, u, clips[i%len(clips)], 0) })

	// 3. реалистично
	var mu sync.Mutex
	var gets, posts []sample
	stop := time.Now().Add(time.Duration(*stageSec) * time.Second)
	t0 := time.Now()
	var wg2 sync.WaitGroup
	for i, u := range us {
		wg2.Add(1)
		go func(i int, u *user) {
			defer wg2.Done()
			rng := rand.New(rand.NewSource(int64(i)))
			time.Sleep(time.Duration(rng.Intn(2000)) * time.Millisecond)
			var lg, lp []sample
			for n := 1; time.Now().Before(stop); n++ {
				code, d := get(u)
				lg = append(lg, sample{d, code != 200})
				for k := 0; k < 3 && time.Now().Before(stop); k++ {
					time.Sleep(time.Duration(2000+rng.Intn(3000)) * time.Millisecond)
					code, d := post(i, u, clips[(i+k+n)%len(clips)], n*10+k)
					lp = append(lp, sample{d, code != 200})
				}
			}
			mu.Lock()
			gets, posts = append(gets, lg...), append(posts, lp...)
			mu.Unlock()
		}(i, u)
	}
	wg2.Wait()
	wall := time.Since(t0)
	fmt.Printf("  %-44s %v\n", fmt.Sprintf("3. %d с реальной работы: GET каталога", *stageSec), summarize(gets, wall))
	fmt.Printf("  %-44s %v\n", "   то же: POST результата", summarize(posts, wall))

	stage("4. залпом открыть каталог после накопления", func(i int, u *user) (int, time.Duration) { return get(u) })
}
