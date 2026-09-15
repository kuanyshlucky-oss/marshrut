package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Приём и отправка сообщений через WhatsApp Cloud API (Meta), напрямую —
// без BSP-посредника. Настройка на стороне Meta (Business Manager, номер,
// токен) описана в server/README.md.

var (
	waVerifyToken  = env("WA_VERIFY_TOKEN", "")   // тот же токен, что вводится в настройках вебхука в Meta
	waAccessToken  = env("WA_ACCESS_TOKEN", "")   // системный/временный токен для вызовов Graph API
	waPhoneID      = env("WA_PHONE_NUMBER_ID", "") // Phone Number ID (не сам номер телефона)
	waAppSecret    = env("WA_APP_SECRET", "")      // App Secret — для проверки подписи входящих вебхуков
	waGraphVersion = env("WA_GRAPH_VERSION", "v21.0")
)

func initWhatsApp() error {
	_, err := db.Exec(`
	CREATE TABLE IF NOT EXISTS whatsapp_messages (
		id            BIGSERIAL PRIMARY KEY,
		wa_id         TEXT NOT NULL,        -- номер телефона собеседника (формат WhatsApp, без +)
		name          TEXT NOT NULL DEFAULT '',
		direction     TEXT NOT NULL,        -- 'in' | 'out'
		body          TEXT NOT NULL DEFAULT '',
		wa_message_id TEXT NOT NULL DEFAULT '',
		created_at    TEXT NOT NULL
	)`)
	return err
}

// --- Приём сообщений (вебхук) ---

// GET /api/whatsapp/webhook — верификация вебхука при подключении в Meta:
// сверяем hub.verify_token и отражаем hub.challenge обратно.
func handleWhatsAppVerify(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	if q.Get("hub.mode") == "subscribe" && waVerifyToken != "" && q.Get("hub.verify_token") == waVerifyToken {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(q.Get("hub.challenge")))
		return
	}
	writeError(w, http.StatusForbidden, "Неверный verify token")
}

type waWebhookPayload struct {
	Entry []struct {
		Changes []struct {
			Value struct {
				Contacts []struct {
					Profile struct {
						Name string `json:"name"`
					} `json:"profile"`
					WaID string `json:"wa_id"`
				} `json:"contacts"`
				Messages []struct {
					From string `json:"from"`
					ID   string `json:"id"`
					Type string `json:"type"`
					Text struct {
						Body string `json:"body"`
					} `json:"text"`
				} `json:"messages"`
			} `json:"value"`
		} `json:"changes"`
	} `json:"entry"`
}

// POST /api/whatsapp/webhook — входящие сообщения/статусы от Meta.
// Подпись X-Hub-Signature-256 проверяется, если задан WA_APP_SECRET.
func handleWhatsAppWebhook(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "Не удалось прочитать тело запроса")
		return
	}
	if waAppSecret != "" && !validWhatsAppSignature(body, r.Header.Get("X-Hub-Signature-256")) {
		writeError(w, http.StatusUnauthorized, "Неверная подпись запроса")
		return
	}

	var payload waWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		// Meta должна получить 200 даже на нераспознанный формат — иначе будет
		// повторять доставку и в итоге отключит вебхук.
		writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		return
	}

	for _, entry := range payload.Entry {
		for _, change := range entry.Changes {
			names := map[string]string{}
			for _, c := range change.Value.Contacts {
				names[c.WaID] = c.Profile.Name
			}
			for _, m := range change.Value.Messages {
				text := m.Text.Body
				if m.Type != "text" {
					text = "[" + m.Type + "]"
				}
				if err := saveWhatsAppMessage(m.From, names[m.From], "in", text, m.ID); err != nil {
					log.Printf("не удалось сохранить входящее сообщение WhatsApp: %v", err)
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// validWhatsAppSignature проверяет заголовок X-Hub-Signature-256 (HMAC-SHA256
// тела запроса на WA_APP_SECRET), которым Meta подписывает каждый вебхук.
func validWhatsAppSignature(body []byte, header string) bool {
	const prefix = "sha256="
	if !strings.HasPrefix(header, prefix) {
		return false
	}
	sig, err := hex.DecodeString(strings.TrimPrefix(header, prefix))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(waAppSecret))
	mac.Write(body)
	return hmac.Equal(sig, mac.Sum(nil))
}

func saveWhatsAppMessage(waID, name, direction, body, waMessageID string) error {
	_, err := db.Exec(
		`INSERT INTO whatsapp_messages(wa_id, name, direction, body, wa_message_id, created_at)
		 VALUES($1, $2, $3, $4, $5, $6)`,
		waID, name, direction, body, waMessageID, time.Now().UTC().Format(time.RFC3339),
	)
	return err
}

// --- Админка: чтение переписки и отправка ответов ---

type WhatsAppMessage struct {
	ID        int64  `json:"id"`
	WaID      string `json:"wa_id"`
	Name      string `json:"name"`
	Direction string `json:"direction"`
	Body      string `json:"body"`
	CreatedAt string `json:"created_at"`
}

// GET /api/admin/whatsapp/messages?key=... — последние 200 сообщений (входящие и исходящие).
func handleAdminWhatsAppMessages(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	rows, err := db.Query(
		`SELECT id, wa_id, name, direction, body, created_at
		 FROM whatsapp_messages ORDER BY id DESC LIMIT 200`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "Не удалось прочитать сообщения")
		return
	}
	defer rows.Close()

	out := []WhatsAppMessage{}
	for rows.Next() {
		var m WhatsAppMessage
		if err := rows.Scan(&m.ID, &m.WaID, &m.Name, &m.Direction, &m.Body, &m.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "Не удалось прочитать сообщения")
			return
		}
		out = append(out, m)
	}
	writeJSON(w, http.StatusOK, map[string]any{"messages": out})
}

// POST /api/admin/whatsapp/send?key=... {to, text} — ответ студенту в поддержке.
// Работает только в 24-часовом окне после последнего входящего сообщения от
// этого номера (ограничение самого WhatsApp Cloud API вне шаблонных сообщений).
func handleAdminWhatsAppSend(w http.ResponseWriter, r *http.Request) {
	if !adminGuard(w, r) {
		return
	}
	if waAccessToken == "" || waPhoneID == "" {
		writeError(w, http.StatusServiceUnavailable, "WhatsApp API не настроен (WA_ACCESS_TOKEN/WA_PHONE_NUMBER_ID)")
		return
	}
	var in struct {
		To   string `json:"to"`
		Text string `json:"text"`
	}
	if err := decode(r, &in); err != nil || strings.TrimSpace(in.To) == "" || strings.TrimSpace(in.Text) == "" {
		writeError(w, http.StatusBadRequest, "Не указан получатель или текст")
		return
	}
	waMessageID, err := sendWhatsAppText(strings.TrimSpace(in.To), strings.TrimSpace(in.Text))
	if err != nil {
		writeError(w, http.StatusBadGateway, "Не удалось отправить сообщение: "+err.Error())
		return
	}
	if err := saveWhatsAppMessage(in.To, "", "out", in.Text, waMessageID); err != nil {
		log.Printf("не удалось сохранить исходящее сообщение WhatsApp: %v", err)
	}
	logAdminAction(r, "whatsapp_send", in.To, "")
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "wa_message_id": waMessageID})
}

// sendWhatsAppText шлёт обычное текстовое сообщение через Graph API,
// возвращает id отправленного сообщения WhatsApp.
func sendWhatsAppText(to, text string) (string, error) {
	url := fmt.Sprintf("https://graph.facebook.com/%s/%s/messages", waGraphVersion, waPhoneID)
	payload := map[string]any{
		"messaging_product": "whatsapp",
		"to":                to,
		"type":              "text",
		"text":              map[string]string{"body": text},
	}
	buf, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(buf))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+waAccessToken)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("Graph API вернул %s: %s", strconv.Itoa(resp.StatusCode), string(respBody))
	}
	var out struct {
		Messages []struct {
			ID string `json:"id"`
		} `json:"messages"`
	}
	if err := json.Unmarshal(respBody, &out); err != nil || len(out.Messages) == 0 {
		return "", nil
	}
	return out.Messages[0].ID, nil
}
