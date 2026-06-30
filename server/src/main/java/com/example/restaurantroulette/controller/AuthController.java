package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.EmailVerificationResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthAuthorizeResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthRefreshRequest;
import com.example.restaurantroulette.dto.ApiDtos.OAuthSessionRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.EmailRegistrationService;
import jakarta.servlet.http.HttpServletRequest;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService authService;
  private final EmailRegistrationService emailRegistrationService;

  public AuthController(AuthService authService, EmailRegistrationService emailRegistrationService) {
    this.authService = authService;
    this.emailRegistrationService = emailRegistrationService;
  }

  @PostMapping("/register")
  public EmailVerificationResponse register(@RequestBody UserCreateRequest request) {
    return emailRegistrationService.requestRegistration(request);
  }

  @PostMapping("/register/request")
  public EmailVerificationResponse requestEmailRegistration(@RequestBody UserCreateRequest request) {
    return emailRegistrationService.requestRegistration(request);
  }

  @GetMapping(value = "/register/verify", produces = MediaType.TEXT_HTML_VALUE)
  public ResponseEntity<String> verifyEmailRegistration(@RequestParam String token) {
    try {
      AuthResponse auth = emailRegistrationService.verifyRegistration(token);
      return ResponseEntity.ok(successPage(auth.accessToken()));
    } catch (RuntimeException exception) {
      return ResponseEntity.badRequest().body(errorPage());
    }
  }

  @PostMapping("/login")
  public AuthResponse login(@RequestBody UserLoginRequest request) {
    return authService.login(request);
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(@RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
    authService.logout(authorizationHeader);
    return ResponseEntity.noContent().build();
  }

  @GetMapping("/oauth/{provider}/authorize")
  public OAuthAuthorizeResponse oauthAuthorize(
      @PathVariable String provider,
      @RequestParam(required = false) String redirectTo,
      @RequestParam(required = false) String appRedirectTo,
      HttpServletRequest request) {
    String resolvedRedirectTo = appRedirectTo == null || appRedirectTo.isBlank()
        ? redirectTo
        : buildOAuthBridgeRedirect(request, appRedirectTo);
    return authService.createOAuthAuthorizeUrl(provider, resolvedRedirectTo);
  }

  @GetMapping(value = "/oauth/callback", produces = MediaType.TEXT_HTML_VALUE)
  public ResponseEntity<String> oauthCallbackBridge(@RequestParam(name = "app_redirect") String appRedirectTo) {
    if (!isAllowedOAuthAppRedirect(appRedirectTo)) {
      throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "OAuth redirect is not allowed.");
    }
    return ResponseEntity.ok(oauthBridgePage(appRedirectTo));
  }

  @PostMapping("/oauth/session")
  public AuthResponse oauthSession(@RequestBody OAuthSessionRequest request) {
    return authService.loginWithOAuthSession(request);
  }

  @PostMapping("/oauth/refresh")
  public AuthResponse oauthRefresh(@RequestBody OAuthRefreshRequest request) {
    return authService.refreshOAuthSession(request);
  }

  private String successPage(String accessToken) {
    String appUrl = "randish://auth/callback?provider=local&access_token="
        + URLEncoder.encode(accessToken, StandardCharsets.UTF_8);
    return """
        <!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>RANDISH ログイン完了</title>
          </head>
          <body style="margin:0;background:#fbf7ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171310">
            <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
              <section style="max-width:520px;background:#fff;border:1px solid #eadfd2;border-radius:28px;padding:32px;box-shadow:0 18px 48px rgba(45,31,18,.12)">
                <p style="color:#f4512c;font-weight:800;letter-spacing:.08em;margin:0 0 8px">RANDISH</p>
                <h1 style="font-size:32px;line-height:1.25;margin:0 0 12px">メール確認が完了しました</h1>
                <p style="font-size:16px;line-height:1.8;margin:0 0 24px;color:#6f665e">下のボタンからアプリに戻ると、そのままログインできます。</p>
                <a href="%s" style="display:inline-block;background:#f4512c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:16px;font-weight:800">RANDISHを開く</a>
              </section>
            </main>
            <script>
              setTimeout(function () { window.location.href = "%s"; }, 700);
            </script>
          </body>
        </html>
        """.formatted(appUrl, appUrl);
  }

  private String buildOAuthBridgeRedirect(HttpServletRequest request, String appRedirectTo) {
    if (!isAllowedOAuthAppRedirect(appRedirectTo)) {
      throw new org.springframework.web.server.ResponseStatusException(HttpStatus.BAD_REQUEST, "OAuth redirect is not allowed.");
    }
    String scheme = firstForwardedValue(request.getHeader("X-Forwarded-Proto"));
    if (scheme == null || scheme.isBlank()) {
      scheme = request.getScheme();
    }
    String host = firstForwardedValue(request.getHeader("X-Forwarded-Host"));
    if (host == null || host.isBlank()) {
      host = request.getHeader("Host");
    }
    if (host == null || host.isBlank()) {
      host = request.getServerName() + (request.getServerPort() > 0 ? ":" + request.getServerPort() : "");
    }
    host = bridgeHostForAppRedirect(host, appRedirectTo);
    String contextPath = request.getContextPath() == null ? "" : request.getContextPath();
    return scheme + "://" + host + contextPath + "/api/auth/oauth/callback?app_redirect="
        + URLEncoder.encode(appRedirectTo.trim(), StandardCharsets.UTF_8);
  }

  private String bridgeHostForAppRedirect(String requestHost, String appRedirectTo) {
    if (requestHost == null || requestHost.isBlank() || !isLoopbackHost(hostWithoutPort(requestHost))) {
      return requestHost;
    }
    try {
      URI appUri = URI.create(appRedirectTo.trim());
      String appHost = appUri.getHost();
      if (appHost == null || appHost.isBlank() || !isLocalDevelopmentHost(appHost)) {
        return requestHost;
      }
      return appHost + ":8080";
    } catch (IllegalArgumentException exception) {
      return requestHost;
    }
  }

  private String oauthBridgePage(String appRedirectTo) {
    String escapedRedirect = escapeJavaScriptString(appRedirectTo.trim());
    return """
        <!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>RANDISH Login</title>
          </head>
          <body style="margin:0;background:#fbf7ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171310">
            <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
              <section style="max-width:520px;background:#fff;border:1px solid #eadfd2;border-radius:28px;padding:32px;box-shadow:0 18px 48px rgba(45,31,18,.12)">
                <p style="color:#f4512c;font-weight:800;letter-spacing:.08em;margin:0 0 8px">RANDISH</p>
                <h1 style="font-size:28px;line-height:1.25;margin:0 0 12px">ログインを完了しています</h1>
                <p style="font-size:15px;line-height:1.8;margin:0 0 22px;color:#6f665e">自動でアプリに戻らない場合は、下のボタンを押してください。</p>
                <a id="open-randish" href="#" style="display:inline-block;background:#f4512c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:16px;font-weight:800">RANDISHを開く</a>
              </section>
            </main>
            <script>
              (function () {
                var appRedirect = "%s";
                var search = new URLSearchParams(window.location.search || "");
                search.delete("app_redirect");
                var cleanSearch = search.toString();
                var suffix = window.location.hash || "";
                if (!suffix && cleanSearch) {
                  suffix = (appRedirect.indexOf("?") >= 0 ? "&" : "?") + cleanSearch;
                }
                var target = appRedirect + suffix;
                var link = document.getElementById("open-randish");
                if (link) {
                  link.href = target;
                }
                window.location.replace(target);
              })();
            </script>
          </body>
        </html>
        """.formatted(escapedRedirect);
  }

  private boolean isAllowedOAuthAppRedirect(String value) {
    if (value == null || value.isBlank()) {
      return false;
    }
    try {
      URI uri = URI.create(value.trim());
      String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
      String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
      String path = uri.getPath() == null ? "" : uri.getPath();
      if ("randish".equals(scheme)) {
        return ("auth".equals(host) && "/callback".equals(path)) || "/auth/callback".equals(path);
      }
      if ("exp".equals(scheme) || "exps".equals(scheme)) {
        return !host.isBlank() && path.endsWith("/--/auth/callback");
      }
      if ("http".equals(scheme) || "https".equals(scheme)) {
        return path.endsWith("/auth/callback") && isLocalDevelopmentHost(host);
      }
      return false;
    } catch (IllegalArgumentException exception) {
      return false;
    }
  }

  private boolean isLocalDevelopmentHost(String host) {
    if (host == null || host.isBlank()) {
      return false;
    }
    if (isLoopbackHost(host)) {
      return true;
    }
    if (host.startsWith("192.168.") || host.startsWith("10.")) {
      return true;
    }
    if (!host.startsWith("172.")) {
      return false;
    }
    String[] parts = host.split("\\.");
    if (parts.length < 2) {
      return false;
    }
    try {
      int secondOctet = Integer.parseInt(parts[1]);
      return secondOctet >= 16 && secondOctet <= 31;
    } catch (NumberFormatException exception) {
      return false;
    }
  }

  private boolean isLoopbackHost(String host) {
    return "localhost".equals(host) || "127.0.0.1".equals(host) || "::1".equals(host);
  }

  private String hostWithoutPort(String host) {
    if (host == null) {
      return "";
    }
    String trimmed = host.trim();
    if (trimmed.startsWith("[") && trimmed.contains("]")) {
      return trimmed.substring(1, trimmed.indexOf(']'));
    }
    int portSeparator = trimmed.lastIndexOf(':');
    if (portSeparator > -1 && trimmed.indexOf(':') == portSeparator) {
      return trimmed.substring(0, portSeparator);
    }
    return trimmed;
  }

  private String firstForwardedValue(String value) {
    if (value == null || value.isBlank()) {
      return null;
    }
    return value.split(",")[0].trim();
  }

  private String escapeJavaScriptString(String value) {
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026");
  }

  private String errorPage() {
    return """
        <!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>RANDISH 確認エラー</title>
          </head>
          <body style="margin:0;background:#fbf7ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171310">
            <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
              <section style="max-width:520px;background:#fff;border:1px solid #eadfd2;border-radius:28px;padding:32px;box-shadow:0 18px 48px rgba(45,31,18,.12)">
                <p style="color:#f4512c;font-weight:800;letter-spacing:.08em;margin:0 0 8px">RANDISH</p>
                <h1 style="font-size:32px;line-height:1.25;margin:0 0 12px">URLが無効か期限切れです</h1>
                <p style="font-size:16px;line-height:1.8;margin:0;color:#6f665e">アプリからもう一度、確認メールを送ってください。</p>
              </section>
            </main>
          </body>
        </html>
        """;
  }
}
