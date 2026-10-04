package store

import "testing"

func TestMigrationFilesAreWellFormed(t *testing.T) {
	migs, err := loadMigrations(migrationsFS)
	if err != nil {
		t.Fatal(err)
	}
	if len(migs) < 4 {
		t.Fatalf("ожидалось минимум 4 миграции, найдено %d", len(migs))
	}
	for i, m := range migs {
		if m.version != i+1 {
			t.Errorf("миграция %s: версия %d, ожидалась %d", m.name, m.version, i+1)
		}
		if len(m.sql) < 10 {
			t.Errorf("миграция %s пуста", m.name)
		}
	}
}
