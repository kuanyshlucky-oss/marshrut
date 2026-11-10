package mail

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net"
	"net/textproto"
	"strings"
	"testing"
	"time"
)

func TestMessageEncodingAndHeaderInjection(t *testing.T) {
	msg, err := Message("Тренажёр <noreply@example.kz>", "buyer@example.kz", "Доступ к тренажёру", "Привет!\nСсылка: https://x/y", time.Unix(0, 0))
	if err != nil {
		t.Fatal(err)
	}
	m, err := textproto.NewReader(bufio.NewReader(strings.NewReader(string(msg)))).ReadMIMEHeader()
	if err != nil {
		t.Fatal(err)
	}
	dec := new(mime.WordDecoder)
	if subj, _ := dec.DecodeHeader(m.Get("Subject")); subj != "Доступ к тренажёру" {
		t.Errorf("тема: %q", subj)
	}
	parts := strings.SplitN(string(msg), "\r\n\r\n", 2)
	raw, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(parts[1], "\r\n", ""))
	if err != nil || string(raw) != "Привет!\nСсылка: https://x/y" {
		t.Errorf("тело: %q %v", raw, err)
	}
	if m.Get("Content-Type") != "text/plain; charset=utf-8" || m.Get("MIME-Version") != "1.0" {
		t.Errorf("заголовки: %v", m)
	}
	// Инъекция заголовков через тему, адреса получателя и отправителя отклоняется.
	for _, c := range [][3]string{
		{"a@x.kz", "b@x.kz\r\nBcc: evil@x.kz", "тема"},
		{"a@x.kz", "b@x.kz", "тема\r\nBcc: evil@x.kz"},
		{"a@x.kz\nX: y", "b@x.kz", "тема"},
	} {
		if _, err := Message(c[0], c[1], c[2], "x", time.Now()); err == nil {
			t.Errorf("инъекция заголовка принята: %q", c)
		}
	}
}

// fakeSMTP — минимальный SMTP-сервер: запоминает конверт и письмо.
type fakeSMTP struct {
	ln       net.Listener
	from, to string
	data     string
	done     chan struct{}
}

func newFakeSMTP(t *testing.T) *fakeSMTP {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	f := &fakeSMTP{ln: ln, done: make(chan struct{})}
	t.Cleanup(func() { ln.Close() })
	go func() {
		defer close(f.done)
		c, err := ln.Accept()
		if err != nil {
			return
		}
		defer c.Close()
		r := bufio.NewReader(c)
		w := func(s string) { fmt.Fprint(c, s+"\r\n") }
		w("220 fake ESMTP")
		for {
			line, err := r.ReadString('\n')
			if err != nil {
				return
			}
			cmd := strings.ToUpper(strings.TrimSpace(line))
			switch {
			case strings.HasPrefix(cmd, "EHLO"), strings.HasPrefix(cmd, "HELO"):
				w("250 fake")
			case strings.HasPrefix(cmd, "MAIL FROM:"):
				f.from = strings.TrimSpace(line[len("MAIL FROM:"):])
				w("250 ok")
			case strings.HasPrefix(cmd, "RCPT TO:"):
				f.to = strings.TrimSpace(line[len("RCPT TO:"):])
				w("250 ok")
			case cmd == "DATA":
				w("354 go")
				b, _ := io.ReadAll(textproto.NewReader(r).DotReader())
				f.data = string(b)
				w("250 queued")
			case cmd == "QUIT":
				w("221 bye")
				return
			default:
				w("250 ok")
			}
		}
	}()
	return f
}

func TestSMTPSend(t *testing.T) {
	f := newFakeSMTP(t)
	host, port, _ := net.SplitHostPort(f.ln.Addr().String())
	s := &SMTP{Host: host, Port: port, From: "Тренажёр <noreply@example.kz>", Timeout: 5 * time.Second}
	if err := s.Send(context.Background(), "buyer@example.kz", "Доступ", "Здравствуйте"); err != nil {
		t.Fatal(err)
	}
	<-f.done
	// В SMTP-командах чистые адреса, имя отправителя только в заголовке.
	if f.from != "<noreply@example.kz>" || f.to != "<buyer@example.kz>" {
		t.Errorf("конверт: from=%q to=%q", f.from, f.to)
	}
	if !strings.Contains(f.data, "To: buyer@example.kz") || !strings.Contains(f.data, "Subject:") {
		t.Errorf("письмо: %q", f.data)
	}
}

func TestSMTPRejectsHeaderInjection(t *testing.T) {
	s := &SMTP{Host: "127.0.0.1", Port: "1", From: "a@x.kz", Timeout: time.Second}
	if err := s.Send(context.Background(), "b@x.kz\r\nBcc: e@x.kz", "t", "b"); err == nil || !strings.Contains(err.Error(), "заголовк") {
		t.Errorf("ожидали отказ до подключения: %v", err)
	}
}
