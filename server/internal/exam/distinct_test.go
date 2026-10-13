package exam

import (
	"testing"

	"marshrut-api/internal/content"
)

func TestDistinctFirstMovesRepeatedStemsToEnd(t *testing.T) {
	a := &content.Question{Q: "Парадигма"}
	b := &content.Question{Q: "  парадигма "}
	c := &content.Question{Q: "Дидактика"}
	d := &content.Question{Q: "Парадигма", Passage: "другой текст"}
	got := distinctFirst([]item{{q: a}, {q: b}, {q: c}, {q: d}})
	want := []*content.Question{a, c, d, b}
	for i, w := range want {
		if got[i].q != w {
			t.Fatalf("позиция %d: ожидали %q, получили %q", i, w.Q, got[i].q.Q)
		}
	}
}
