package content

import "sort"

// Демо-режим: небольшой фиксированный набор вопросов теста, открытый без входа и без
// оплаты, чтобы покупатель мог оценить продукт до оплаты (оферта, п. 4.4).
// Включается только для тестов из demoSizes.
var demoSizes = map[string]int{"GOSSLUZHBA": 15}

// DemoSize — сколько вопросов открыто бесплатно у теста; 0 — демо не предусмотрено.
func DemoSize(code string) int { return demoSizes[code] }

// DemoItem — демо-вопрос и предмет (subj1…), из которого он взят.
type DemoItem struct {
	Block string
	Q     *Question
}

// DemoQuestions возвращает демо-набор теста: вопросы равномерно разложены по предметам,
// а внутри предмета выбраны с равным шагом. Выбор детерминирован (одни и те же вопросы
// при каждом запросе и деплое, пока банк не менялся). nil — демо недоступно.
func (s *Service) DemoQuestions(code, lang string) []DemoItem {
	n := demoSizes[code]
	pf, ok := s.profile[fileKey{code, lang}]
	if n == 0 || !ok {
		return nil
	}
	type pool struct {
		block string
		bank  *Bank
	}
	var pools []pool
	if len(pf.bySubject) > 0 {
		keys := make([]string, 0, len(pf.bySubject))
		for k, b := range pf.bySubject {
			if len(b.Questions) > 0 {
				keys = append(keys, k)
			}
		}
		sort.Strings(keys)
		for _, k := range keys {
			pools = append(pools, pool{k, pf.bySubject[k]})
		}
	} else if len(pf.flat.Questions) > 0 {
		pools = []pool{{"", pf.flat}}
	}
	if len(pools) == 0 {
		return nil
	}
	var out []DemoItem
	for i, pl := range pools {
		b := pl.bank
		c := n / len(pools)
		if i < n%len(pools) {
			c++
		}
		if c > len(b.Questions) {
			c = len(b.Questions)
		}
		for j := 0; j < c; j++ {
			out = append(out, DemoItem{pl.block, b.Questions[int((float64(j)+0.5)*float64(len(b.Questions))/float64(c))]})
		}
	}
	return out
}
