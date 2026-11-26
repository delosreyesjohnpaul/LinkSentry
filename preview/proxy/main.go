package main

import (
    "bytes"
    "crypto/subtle"
    "os"
    "context"
    "fmt"
    "io"
    "log"
    "net"
    "net/http"
    "net/netip"
    "strconv"
    "strings"
    "time"
)

var blocked = []netip.Prefix{
    netip.MustParsePrefix("0.0.0.0/8"),
    netip.MustParsePrefix("100.64.0.0/10"),
    netip.MustParsePrefix("192.0.0.0/24"),
    netip.MustParsePrefix("192.0.2.0/24"),
    netip.MustParsePrefix("192.88.99.0/24"),
    netip.MustParsePrefix("198.18.0.0/15"),
    netip.MustParsePrefix("198.51.100.0/24"),
    netip.MustParsePrefix("203.0.113.0/24"),
    netip.MustParsePrefix("240.0.0.0/4"),
    netip.MustParsePrefix("64:ff9b::/96"),
    netip.MustParsePrefix("100::/64"),
    netip.MustParsePrefix("2001::/23"),
    netip.MustParsePrefix("2001:db8::/32"),
    netip.MustParsePrefix("2002::/16"),
}

func publicIP(ip netip.Addr) bool {
    if ip.Is4In6() {
        ip = ip.Unmap()
    }
    if !ip.IsValid() || !ip.IsGlobalUnicast() || ip.IsPrivate() ||
        ip.IsLoopback() || ip.IsLinkLocalUnicast() ||
        ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
        return false
    }
    if ip.Is6() && !netip.MustParsePrefix("2000::/3").Contains(ip) {
        return false
    }
    for _, prefix := range blocked {
        if prefix.Contains(ip) {
            return false
        }
    }
    return true
}

func resolvePublic(ctx context.Context, host string) ([]netip.Addr, error) {
    host = strings.TrimSuffix(strings.TrimSpace(host), ".")
    if ip, err := netip.ParseAddr(host); err == nil {
        if !publicIP(ip) {
            return nil, fmt.Errorf("destination is not a public IP")
        }
        return []netip.Addr{ip}, nil
    }

    ips, err := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
    if err != nil || len(ips) == 0 {
        return nil, fmt.Errorf("destination could not be resolved")
    }
    for _, ip := range ips {
        if !publicIP(ip) {
            return nil, fmt.Errorf("domain resolved to a non-public IP")
        }
    }
    return ips, nil
}

func dialPublic(ctx context.Context, host string, port int) (net.Conn, error) {
    ips, err := resolvePublic(ctx, host)
    if err != nil {
        return nil, err
    }
    dialer := net.Dialer{Timeout: 6 * time.Second}
    var lastErr error
    for _, ip := range ips {
        conn, err := dialer.DialContext(ctx, "tcp", net.JoinHostPort(ip.String(), strconv.Itoa(port)))
        if err == nil {
            return conn, nil
        }
        lastErr = err
    }
    return nil, lastErr
}

func hostPort(raw string, requiredPort int) (string, error) {
    host, portText, err := net.SplitHostPort(raw)
    if err != nil {
        return "", fmt.Errorf("destination must include a port")
    }
    port, err := strconv.Atoi(portText)
    if err != nil || port != requiredPort {
        return "", fmt.Errorf("only port %d is allowed", requiredPort)
    }
    if host == "" || strings.ContainsAny(host, "/\\@") {
        return "", fmt.Errorf("invalid destination")
    }
    return host, nil
}

func reject(w http.ResponseWriter, status int, message string) {
    http.Error(w, message, status)
}

func handleConnect(w http.ResponseWriter, r *http.Request) {
    host, err := hostPort(r.Host, 443)
    if err != nil {
        reject(w, http.StatusForbidden, err.Error())
        return
    }
    ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
    defer cancel()

    target, err := dialPublic(ctx, host, 443)
    if err != nil {
        reject(w, http.StatusForbidden, "destination blocked or unavailable")
        return
    }
    defer target.Close()

    client, rw, err := w.(http.Hijacker).Hijack()
    if err != nil {
        return
    }
    defer client.Close()

    _, _ = rw.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
    _ = rw.Flush()

    _ = client.SetDeadline(time.Now().Add(2 * time.Minute))
    _ = target.SetDeadline(time.Now().Add(2 * time.Minute))

    done := make(chan struct{})
    go func() {
        _, _ = io.Copy(target, client)
        close(done)
    }()
    _, _ = io.Copy(client, target)
    <-done
}

func handleHTTP(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet && r.Method != http.MethodHead {
        reject(w, http.StatusForbidden, "only GET and HEAD requests are allowed")
        return
    }
    if !r.URL.IsAbs() || r.URL.Scheme != "http" || r.URL.User != nil {
        reject(w, http.StatusForbidden, "only public HTTP and HTTPS destinations are allowed")
        return
    }

    port := 80
    if r.URL.Port() != "" {
        var err error
        port, err = strconv.Atoi(r.URL.Port())
        if err != nil || port != 80 {
            reject(w, http.StatusForbidden, "only port 80 is allowed for HTTP")
            return
        }
    }

    transport := &http.Transport{
        Proxy: nil,
        DialContext: func(ctx context.Context, _, address string) (net.Conn, error) {
            destination, destinationPort, err := net.SplitHostPort(address)
            if err != nil || destinationPort != "80" {
                return nil, fmt.Errorf("only HTTP port 80 is allowed")
            }
            return dialPublic(ctx, destination, 80)
        },
        DisableKeepAlives: true,
    }
    defer transport.CloseIdleConnections()

    out := r.Clone(r.Context())
    out.RequestURI = ""
    out.Header.Del("Proxy-Authorization")
    out.Header.Del("Proxy-Connection")
    response, err := transport.RoundTrip(out)
    if err != nil {
        reject(w, http.StatusBadGateway, "destination unavailable")
        return
    }
    defer response.Body.Close()

    for key, values := range response.Header {
        for _, value := range values {
            w.Header().Add(key, value)
        }
    }
    w.WriteHeader(response.StatusCode)
    _, _ = io.Copy(w, response.Body)
}


func handleBridge(w http.ResponseWriter, r *http.Request) {
    if r.Method == http.MethodGet && r.URL.Path == "/health" {
        w.Header().Set("Content-Type", "application/json")
        _, _ = io.WriteString(w, "{\"status\":\"ok\"}")
        return
    }
    if r.Method != http.MethodPost || r.URL.Path != "/screenshot" {
        http.NotFound(w, r)
        return
    }

    token := os.Getenv("PREVIEW_SERVICE_TOKEN")
    expected := "Bearer " + token
    if token == "" || subtle.ConstantTimeCompare(
        []byte(r.Header.Get("Authorization")),
        []byte(expected),
    ) != 1 {
        http.Error(w, "Unauthorized", http.StatusUnauthorized)
        return
    }

    body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 4096))
    if err != nil {
        http.Error(w, "Invalid request body", http.StatusBadRequest)
        return
    }

    ctx, cancel := context.WithTimeout(r.Context(), 35*time.Second)
    defer cancel()

    upstream, err := http.NewRequestWithContext(
        ctx,
        http.MethodPost,
        "http://renderer:8001/screenshot",
        bytes.NewReader(body),
    )
    if err != nil {
        http.Error(w, "Could not forward preview request", http.StatusBadGateway)
        return
    }
    upstream.Header.Set("Content-Type", "application/json")
    upstream.Header.Set("Authorization", expected)

    response, err := (&http.Client{Timeout: 36 * time.Second}).Do(upstream)
    if err != nil {
        http.Error(w, "Renderer unavailable", http.StatusBadGateway)
        return
    }
    defer response.Body.Close()

    if contentType := response.Header.Get("Content-Type"); contentType != "" {
        w.Header().Set("Content-Type", contentType)
    }
    w.WriteHeader(response.StatusCode)
    _, _ = io.Copy(w, io.LimitReader(response.Body, 2_200_000))
}

func main() {
    proxyServer := &http.Server{
        Addr: ":3128",
        Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
            if r.Method == http.MethodConnect {
                handleConnect(w, r)
                return
            }
            handleHTTP(w, r)
        }),
        ReadHeaderTimeout: 5 * time.Second,
        MaxHeaderBytes: 16 * 1024,
    }

    go func() {
        if err := proxyServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatal(err)
        }
    }()

    bridgeServer := &http.Server{
        Addr: ":8001",
        Handler: http.HandlerFunc(handleBridge),
        ReadHeaderTimeout: 5 * time.Second,
        MaxHeaderBytes: 16 * 1024,
    }
    log.Fatal(bridgeServer.ListenAndServe())
}
