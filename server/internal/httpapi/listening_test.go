package httpapi

import "testing"

func TestValidListeningResult(t *testing.T) {
	long := make([]int, listeningMaxPhrases+1)
	cases := []struct {
		name    string
		clip    string
		score   int
		phrases []int
		ok      bool
	}{
		{"обычный клип", "kfp-shifu-1", 92, []int{100, 92, 100}, true},
		{"без фраз", "kfp-shifu-2", 0, nil, true},
		{"максимум", "a", 100, []int{100}, true},
		{"пустой id", "", 50, nil, false},
		{"заглавные в id", "KFP", 50, nil, false},
		{"пробел в id", "kfp shifu", 50, nil, false},
		{"слишком длинный id", "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", 50, nil, false},
		{"балл больше 100", "x", 101, nil, false},
		{"отрицательный балл", "x", -1, nil, false},
		{"фраза больше 100", "x", 50, []int{100, 101}, false},
		{"отрицательная фраза", "x", 50, []int{-5}, false},
		{"слишком много фраз", "x", 50, long, false},
	}
	for _, c := range cases {
		if got := validListeningResult(c.clip, c.score, c.phrases); got != c.ok {
			t.Errorf("%s: validListeningResult = %v, want %v", c.name, got, c.ok)
		}
	}
}
