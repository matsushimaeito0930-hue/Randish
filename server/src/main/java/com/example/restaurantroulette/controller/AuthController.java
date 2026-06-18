package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.AuthResponse;
import com.example.restaurantroulette.dto.ApiDtos.EmailVerificationResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthAuthorizeResponse;
import com.example.restaurantroulette.dto.ApiDtos.OAuthSessionRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserLoginRequest;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.EmailRegistrationService;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
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
      emailRegistrationService.verifyRegistration(token);
      return ResponseEntity.ok(successPage());
    } catch (RuntimeException exception) {
      return ResponseEntity.badRequest().body(errorPage());
    }
  }

  @PostMapping("/login")
  public AuthResponse login(@RequestBody UserLoginRequest request) {
    return authService.login(request);
  }

  @GetMapping("/oauth/{provider}/authorize")
  public OAuthAuthorizeResponse oauthAuthorize(
      @PathVariable String provider,
      @RequestParam(required = false) String redirectTo) {
    return authService.createOAuthAuthorizeUrl(provider, redirectTo);
  }

  @PostMapping("/oauth/session")
  public AuthResponse oauthSession(@RequestBody OAuthSessionRequest request) {
    return authService.loginWithOAuthSession(request);
  }

  private String successPage() {
    return """
        <!doctype html>
        <html lang="ja">
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <title>RANDISH 登録完了</title>
          </head>
          <body style="margin:0;background:#fbf7ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#171310">
            <main style="min-height:100vh;display:grid;place-items:center;padding:24px">
              <section style="max-width:520px;background:#fff;border:1px solid #eadfd2;border-radius:28px;padding:32px;box-shadow:0 18px 48px rgba(45,31,18,.12)">
                <p style="color:#f4512c;font-weight:800;letter-spacing:.08em;margin:0 0 8px">RANDISH</p>
                <h1 style="font-size:32px;line-height:1.25;margin:0 0 12px">会員登録が完了しました</h1>
                <p style="font-size:16px;line-height:1.8;margin:0;color:#6f665e">アプリに戻って、登録したメールアドレスとパスワードでログインしてください。</p>
              </section>
            </main>
          </body>
        </html>
        """;
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
