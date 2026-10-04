package httpapi

import (
	"net"
	"net/http"
	"strings"
)

// clientIP определяет IP клиента. Клиент может прислать свой X-Forwarded-For, и он
// окажется в НАЧАЛЕ списка; доверять можно только записям, добавленным нашими
// прокси, то есть отсчитанным справа (hops — число прокси, Render — 1).
// hops = 0: прокси нет, заголовку не верим.
func clientIP(r *http.Request, hops int) string {
	return ipFromRequest(r.Header.Get("X-Forwarded-For"), r.RemoteAddr, hops)
}

func ipFromRequest(xff, remoteAddr string, hops int) string {
	if hops > 0 && xff != "" {
		parts := strings.Split(xff, ",")
		if idx := len(parts) - hops; idx >= 0 {
			if ip := strings.TrimSpace(parts[idx]); ip != "" {
				return ip
			}
		}
	}
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		return remoteAddr
	}
	return host
}
