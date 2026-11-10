// Package mail — отправка писем покупателям по SMTP. Письма ставятся в очередь (email_outbox) и отправляются
// фоновым процессом, поэтому недоступность почты не мешает выдаче доступа.
package mail

import (
	"context"
	"crypto/tls"
	"encoding/base64"
	"errors"
	"fmt"
	"mime"
	"net"
	netmail "net/mail"
	"net/smtp"
	"strings"
	"time"
)

type Sender interface {
	Send(ctx context.Context, to, subject, body string) error
}

type SMTP struct {
	Host, Port, User, Pass, From string
	Timeout                      time.Duration
}

var errHeader = errors.New("недопустимые символы в заголовке письма")

func safeHeader(s string) error {
	if strings.ContainsAny(s, "\r\n") {
		return errHeader
	}
	return nil
}

// Message собирает письмо: UTF-8, тема в MIME-кодировке, тело в base64. CR/LF в заголовках запрещены (инъекция заголовков).
func Message(from, to, subject, body string, now time.Time) ([]byte, error) {
	for _, h := range []string{from, to, subject} {
		if err := safeHeader(h); err != nil {
			return nil, err
		}
	}
	var b strings.Builder
	b.WriteString("From: " + from + "\r\n")
	b.WriteString("To: " + to + "\r\n")
	b.WriteString("Subject: " + mime.QEncoding.Encode("utf-8", subject) + "\r\n")
	b.WriteString("Date: " + now.UTC().Format(time.RFC1123Z) + "\r\n")
	b.WriteString("MIME-Version: 1.0\r\n")
	b.WriteString("Content-Type: text/plain; charset=utf-8\r\n")
	b.WriteString("Content-Transfer-Encoding: base64\r\n\r\n")
	enc := base64.StdEncoding.EncodeToString([]byte(body))
	for len(enc) > 76 {
		b.WriteString(enc[:76] + "\r\n")
		enc = enc[76:]
	}
	b.WriteString(enc + "\r\n")
	return []byte(b.String()), nil
}

func (s *SMTP) Send(ctx context.Context, to, subject, body string) error {
	msg, err := Message(s.From, to, subject, body, time.Now())
	if err != nil {
		return err
	}
	timeout := s.Timeout
	if timeout == 0 {
		timeout = 20 * time.Second
	}
	addr := net.JoinHostPort(s.Host, s.Port)
	d := net.Dialer{Timeout: timeout}
	var conn net.Conn
	if s.Port == "465" { // неявный TLS
		conn, err = tls.DialWithDialer(&d, "tcp", addr, &tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12})
	} else {
		conn, err = d.DialContext(ctx, "tcp", addr)
	}
	if err != nil {
		return err
	}
	_ = conn.SetDeadline(time.Now().Add(2 * timeout))
	c, err := smtp.NewClient(conn, s.Host)
	if err != nil {
		conn.Close()
		return err
	}
	defer c.Close()
	if s.Port != "465" {
		if ok, _ := c.Extension("STARTTLS"); ok {
			if err := c.StartTLS(&tls.Config{ServerName: s.Host, MinVersion: tls.VersionTLS12}); err != nil {
				return err
			}
		}
	}
	if s.User != "" {
		if ok, _ := c.Extension("AUTH"); !ok {
			return errors.New("сервер не поддерживает AUTH")
		}
		if err := c.Auth(smtp.PlainAuth("", s.User, s.Pass, s.Host)); err != nil {
			return err
		}
	}
	envelopeFrom := s.From
	if a, perr := netmail.ParseAddress(s.From); perr == nil {
		envelopeFrom = a.Address // в SMTP-команде нужен чистый адрес без имени
	}
	if err := c.Mail(envelopeFrom); err != nil {
		return err
	}
	if err := c.Rcpt(to); err != nil {
		return err
	}
	w, err := c.Data()
	if err != nil {
		return err
	}
	if _, err := w.Write(msg); err != nil {
		return err
	}
	if err := w.Close(); err != nil {
		return err
	}
	if err := c.Quit(); err != nil {
		return fmt.Errorf("quit: %w", err)
	}
	return nil
}
