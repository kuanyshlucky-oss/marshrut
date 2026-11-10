package httpapi

import (
	"context"
	"time"
)

// mailWorker отправляет письма из очереди email_outbox. Сбой отправки не влияет на выдачу доступа:
// письмо остаётся в очереди и пробуется снова (store.MaxEmailAttempts раз), а в админке видно ошибку.
func (s *Server) mailWorker(ctx context.Context) {
	t := time.NewTicker(15 * time.Second)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			s.sendPendingEmails(ctx)
		}
	}
}

func (s *Server) sendPendingEmails(ctx context.Context) {
	if s.mailer == nil {
		return
	}
	c, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	list, err := s.store.PendingEmails(c, 20)
	if err != nil {
		s.log.Warn("очередь писем недоступна", "err", err)
		return
	}
	for _, e := range list {
		if err := s.mailer.Send(c, e.To, e.Subject, e.Body); err != nil {
			s.log.Warn("не удалось отправить письмо", "id", e.ID, "kind", e.Kind, "err", err)
			_ = s.store.MarkEmailFailed(c, e.ID, err.Error())
			continue
		}
		_ = s.store.MarkEmailSent(c, e.ID, time.Now())
	}
}
