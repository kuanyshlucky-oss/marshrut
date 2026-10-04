package httpapi

import (
	"compress/gzip"
	"net/http"
	"strings"
	"sync"
)

var gzipPool = sync.Pool{New: func() any { return gzip.NewWriter(nil) }}

// gzipWriter сжимает ответ лениво — решение принимается на WriteHeader, когда
// уже известны код и заголовки: не сжимаем 204/304, уже сжатые ответы (контент
// тестов отдаётся заранее сжатым) и не-текстовые типы.
type gzipWriter struct {
	http.ResponseWriter
	gz          *gzip.Writer
	wroteHeader bool
	compress    bool
}

func (g *gzipWriter) WriteHeader(code int) {
	if g.wroteHeader {
		return
	}
	g.wroteHeader = true
	h := g.Header()
	ct := h.Get("Content-Type")
	g.compress = code != http.StatusNoContent && code != http.StatusNotModified && code >= 200 &&
		h.Get("Content-Encoding") == "" &&
		(strings.HasPrefix(ct, "application/json") || strings.HasPrefix(ct, "text/"))
	if g.compress {
		h.Set("Content-Encoding", "gzip")
		h.Del("Content-Length")
	}
	g.ResponseWriter.WriteHeader(code)
}

func (g *gzipWriter) Write(b []byte) (int, error) {
	if !g.wroteHeader {
		g.WriteHeader(http.StatusOK)
	}
	if !g.compress {
		return g.ResponseWriter.Write(b)
	}
	if g.gz == nil {
		g.gz = gzipPool.Get().(*gzip.Writer)
		g.gz.Reset(g.ResponseWriter)
	}
	return g.gz.Write(b)
}

func (g *gzipWriter) close() {
	if g.gz != nil {
		_ = g.gz.Close()
		gzipPool.Put(g.gz)
		g.gz = nil
	}
}

// withGzip сжимает JSON-ответы для клиентов, заявивших поддержку gzip
// (браузеры — всегда; экономит трафик студентам на мобильном интернете).
func withGzip(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Accept-Encoding")
		if !acceptsGzip(r) {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipWriter{ResponseWriter: w}
		defer gw.close()
		next.ServeHTTP(gw, r)
	})
}

func acceptsGzip(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}
