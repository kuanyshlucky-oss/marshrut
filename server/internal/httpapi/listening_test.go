package httpapi

import "testing"

func TestValidListeningResult(t *testing.T) {
	long := make([]int, listeningMaxPhrases+1)
	cases := []struct {
		name    string
		clip    string
		attempt string
		score   int
		phrases []int
		ok      bool
	}{
		{"обычный клип", "kfp-shifu-1", "", 92, []int{100, 92, 100}, true},
		{"без фраз", "kfp-shifu-2", "", 0, nil, true},
		{"максимум", "a", "", 100, []int{100}, true},
		{"с id прохождения", "a", "9f1c2d3e-4b5a-4c6d-8e7f-0a1b2c3d4e5f", 50, nil, true},
		{"пустой id клипа", "", "", 50, nil, false},
		{"заглавные в id", "KFP", "", 50, nil, false},
		{"пробел в id", "kfp shifu", "", 50, nil, false},
		{"слишком длинный id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "", 50, nil, false},
		{"балл больше 100", "x", "", 101, nil, false},
		{"отрицательный балл", "x", "", -1, nil, false},
		{"фраза больше 100", "x", "", 50, []int{100, 101}, false},
		{"отрицательная фраза", "x", "", 50, []int{-5}, false},
		{"слишком много фраз", "x", "", 50, long, false},
		{"слишком короткий id прохождения", "x", "abc", 50, nil, false},
		{"спецсимволы в id прохождения", "x", "abcdefgh'; DROP TABLE", 50, nil, false},
		{"слишком длинный id прохождения", "x", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 50, nil, false},
	}
	for _, c := range cases {
		if got := validListeningResult(c.clip, c.attempt, c.score, c.phrases); got != c.ok {
			t.Errorf("%s: validListeningResult = %v, want %v", c.name, got, c.ok)
		}
	}
}
