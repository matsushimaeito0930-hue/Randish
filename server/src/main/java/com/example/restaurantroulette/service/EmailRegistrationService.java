package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.EmailVerificationResponse;
import com.example.restaurantroulette.dto.ApiDtos.UserCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.entity.PendingEmailRegistration;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.repository.PendingEmailRegistrationRepository;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class EmailRegistrationService {
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
      "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
      Pattern.CASE_INSENSITIVE);
  private static final Duration TOKEN_TTL = Duration.ofMinutes(30);
  private static final SecureRandom SECURE_RANDOM = new SecureRandom();

  private final PendingEmailRegistrationRepository pendingRepository;
  private final UserService userService;
  private final PasswordHashService passwordHashService;
  private final RestClient resendClient;
  private final String resendApiKey;
  private final String resendFromEmail;
  private final String verificationBaseUrl;

  public EmailRegistrationService(
      PendingEmailRegistrationRepository pendingRepository,
      UserService userService,
      PasswordHashService passwordHashService,
      RestClient.Builder restClientBuilder) {
    this.pendingRepository = pendingRepository;
    this.userService = userService;
    this.passwordHashService = passwordHashService;
    this.resendClient = restClientBuilder.baseUrl("https://api.resend.com").build();
    this.resendApiKey = firstPresent(System.getProperty("RESEND_API_KEY"), System.getenv("RESEND_API_KEY"));
    this.resendFromEmail = firstPresent(
        System.getProperty("RESEND_FROM_EMAIL"),
        System.getenv("RESEND_FROM_EMAIL"),
        "RANDISH <onboarding@resend.dev>");
    this.verificationBaseUrl = trimTrailingSlash(firstPresent(
        System.getProperty("RANDISH_EMAIL_VERIFICATION_BASE_URL"),
        System.getenv("RANDISH_EMAIL_VERIFICATION_BASE_URL"),
        "http://localhost:8080"));
  }

  public EmailVerificationResponse requestRegistration(UserCreateRequest request) {
    String email = normalizeEmail(request.email());
    String displayName = normalizeDisplayName(request.displayName(), email);
    validatePassword(request.password());
    if (userService.emailExists(email)) {
      throw new ConflictException("Email is already registered.");
    }
    if (resendApiKey == null || resendApiKey.isBlank()) {
      throw new BadRequestException("Resend email verification is not configured.");
    }

    String token = generateToken();
    String tokenHash = hashToken(token);
    PasswordHashService.PasswordSecret secret = passwordHashService.hash(request.password());
    Instant now = Instant.now();
    Instant expiresAt = now.plus(TOKEN_TTL);
    PendingEmailRegistration registration = new PendingEmailRegistration(
        UUID.randomUUID().toString(),
        email,
        displayName,
        secret.hash(),
        secret.salt(),
        tokenHash,
        expiresAt,
        null,
        now);

    pendingRepository.deleteOpenByEmail(email);
    pendingRepository.save(registration);
    try {
      sendVerificationEmail(email, displayName, buildVerificationUrl(token), expiresAt);
    } catch (RuntimeException exception) {
      pendingRepository.deleteOpenByEmail(email);
      throw exception;
    }

    return new EmailVerificationResponse(email, expiresAt);
  }

  public UserResponse verifyRegistration(String token) {
    if (token == null || token.isBlank()) {
      throw new BadRequestException("verification token is required.");
    }
    PendingEmailRegistration registration = pendingRepository.findByTokenHash(hashToken(token.trim()))
        .orElseThrow(() -> new BadRequestException("verification token is invalid or expired."));
    if (registration.consumedAt() != null || registration.expiresAt().isBefore(Instant.now())) {
      throw new BadRequestException("verification token is invalid or expired.");
    }

    UserResponse user = userService.registerVerifiedEmail(
        registration.email(),
        registration.displayName(),
        registration.passwordHash(),
        registration.passwordSalt());
    pendingRepository.consume(registration.id(), Instant.now());
    return user;
  }

  private void sendVerificationEmail(String email, String displayName, String verificationUrl, Instant expiresAt) {
    String subject = "RANDISHの会員登録を確認してください";
    String safeName = escapeHtml(displayName);
    String html = """
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#18130f">
          <h1 style="margin:0 0 12px;font-size:28px">RANDISH</h1>
          <p>%sさん、会員登録を完了するには下のボタンを押してください。</p>
          <p style="margin:24px 0">
            <a href="%s" style="display:inline-block;background:#f4512c;color:#fff;text-decoration:none;padding:14px 22px;border-radius:16px;font-weight:800">メールを確認して登録する</a>
          </p>
          <p>このURLは30分で期限切れになります。</p>
          <p style="font-size:13px;color:#756d66">有効期限: %s</p>
        </div>
        """.formatted(safeName, verificationUrl, expiresAt);
    String text = """
        RANDISHの会員登録を確認してください。

        以下のURLを開くと登録が完了します。
        %s

        このURLは30分で期限切れになります。
        """.formatted(verificationUrl);

    try {
      resendClient.post()
          .uri("/emails")
          .header("Authorization", "Bearer " + resendApiKey)
          .body(Map.of(
              "from", resendFromEmail,
              "to", List.of(email),
              "subject", subject,
              "html", html,
              "text", text))
          .retrieve()
          .toBodilessEntity();
    } catch (RestClientResponseException exception) {
      throw new BadRequestException("Resend email send failed. " + exception.getResponseBodyAsString());
    }
  }

  private String buildVerificationUrl(String token) {
    return verificationBaseUrl
        + "/api/auth/register/verify?token="
        + URLEncoder.encode(token, StandardCharsets.UTF_8);
  }

  private String generateToken() {
    byte[] bytes = new byte[32];
    SECURE_RANDOM.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String hashToken(String token) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      return Base64.getUrlEncoder().withoutPadding().encodeToString(digest.digest(token.getBytes(StandardCharsets.UTF_8)));
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to hash verification token.", exception);
    }
  }

  private String normalizeEmail(String email) {
    if (email == null || email.isBlank()) {
      throw new BadRequestException("email is required.");
    }
    String normalized = email.trim().toLowerCase(Locale.ROOT);
    if (!EMAIL_PATTERN.matcher(normalized).matches()) {
      throw new BadRequestException("email format is invalid.");
    }
    return normalized;
  }

  private String normalizeDisplayName(String displayName, String email) {
    String normalized = displayName == null || displayName.isBlank()
        ? email.substring(0, email.indexOf('@'))
        : displayName.trim();
    if (normalized.length() > 120) {
      throw new BadRequestException("displayName must be 120 characters or less.");
    }
    return normalized;
  }

  private void validatePassword(String password) {
    if (password == null || password.length() < 8) {
      throw new BadRequestException("password must be at least 8 characters.");
    }
  }

  private String trimTrailingSlash(String value) {
    return value == null ? null : value.trim().replaceFirst("/+$", "");
  }

  private String firstPresent(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return null;
  }

  private String escapeHtml(String value) {
    return value
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace("\"", "&quot;")
        .replace("'", "&#39;");
  }
}
