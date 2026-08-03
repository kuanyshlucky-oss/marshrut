package main

import (
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestMakeParseTokenRoundTrip(t *testing.T) {
	tok := makeToken(42, "sess-abc")
	claims, err := parseToken(tok)
	if err != nil {
		t.Fatalf("parseToken failed: %v", err)
	}
	if claims.UID != 42 {
		t.Errorf("UID = %d, want 42", claims.UID)
	}
	if claims.SID != "sess-abc" {
		t.Errorf("SID = %q, want sess-abc", claims.SID)
	}
}

func TestParseToken_TamperedPayload(t *testing.T) {
	tok := makeToken(1, "s")
	parts := strings.SplitN(tok, ".", 2)
	sig := parts[1]

	// подменяем payload на другой uid, оставляя старую подпись
	tampered := tokenClaims{UID: 999, SID: "s", Exp: time.Now().Add(time.Hour).Unix()}
	raw, _ := json.Marshal(tampered)
	forged := base64.RawURLEncoding.EncodeToString(raw) + "." + sig

	if _, err := parseToken(forged); err == nil {
		t.Error("expected error for tampered payload, got nil")
	}
}

func TestParseToken_Expired(t *testing.T) {
	claims := tokenClaims{UID: 1, SID: "s", Exp: time.Now().Add(-time.Hour).Unix()}
	raw, _ := json.Marshal(claims)
	payload := base64.RawURLEncoding.EncodeToString(raw)
	tok := payload + "." + sign(payload)

	if _, err := parseToken(tok); err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestParseToken_Malformed(t *testing.T) {
	cases := []string{"", "no-dot-here", "a.b.c", "not-base64!!.sig"}
	for _, c := range cases {
		if _, err := parseToken(c); err == nil {
			t.Errorf("expected error for malformed token %q, got nil", c)
		}
	}
}

func TestRandString(t *testing.T) {
	s := randString(20)
	if len(s) != 20 {
		t.Fatalf("len = %d, want 20", len(s))
	}
	for _, ch := range s {
		if strings.ContainsRune("0O1lI", ch) {
			t.Errorf("randString produced ambiguous character %q", ch)
		}
	}
}

func TestHashAndCheckPassword(t *testing.T) {
	hash, err := hashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hashPassword failed: %v", err)
	}
	if !checkPassword(hash, "correct horse battery staple") {
		t.Error("checkPassword should succeed for the correct password")
	}
	if checkPassword(hash, "wrong password") {
		t.Error("checkPassword should fail for the wrong password")
	}
}
