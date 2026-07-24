package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.ContactRequest;
import com.example.restaurantroulette.dto.ApiDtos.ContactResponse;
import com.example.restaurantroulette.exception.BadRequestException;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

@Service
public class ContactService {
  private static final Pattern EMAIL_PATTERN = Pattern.compile(
      "^[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}$",
      Pattern.CASE_INSENSITIVE);
  private static final String CONTACT_TO_EMAIL = "info@randish.jp";

  private final RestClient resendClient;
  private final String resendApiKey;
  private final String resendFromEmail;

  public ContactService(RestClient.Builder restClientBuilder) {
    this.resendClient = restClientBuilder.baseUrl("https://api.resend.com").build();
    this.resendApiKey = firstPresent(System.getProperty("RESEND_API_KEY"), System.getenv("RESEND_API_KEY"));
    this.resendFromEmail = firstPresent(
        System.getProperty("RESEND_CONTACT_FROM_EMAIL"),
        System.getenv("RESEND_CONTACT_FROM_EMAIL"),
        "RANDISH Contact <info@randish.jp>");
  }

  public ContactResponse send(ContactRequest request) {
    if (request == null) {
      throw new BadRequestException("request body is required.");
    }
    String name = required(request.name(), "name", 100);
    String email = normalizeEmail(request.email());
    String subject = required(request.subject(), "subject", 200);
    String content = required(request.content(), "content", 5000);
    if (resendApiKey == null || resendApiKey.isBlank()) {
      throw new BadRequestException("Resend contact email is not configured.");
    }

    String mailSubject = "[RANDISH お問い合わせ] " + subject;
    String text = "名前: " + name + "\nメールアドレス: " + email + "\n件名: " + subject + "\n\n" + content;
    String html = """
        <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.7;color:#18130f">
          <h1 style="margin:0 0 20px;font-size:24px">RANDISH お問い合わせ</h1>
          <p><strong>名前:</strong> %s</p>
          <p><strong>メールアドレス:</strong> %s</p>
          <p><strong>件名:</strong> %s</p>
          <hr style="border:0;border-top:1px solid #eadfd2;margin:20px 0">
          <p style="white-space:pre-wrap">%s</p>
        </div>
        """.formatted(escapeHtml(name), escapeHtml(email), escapeHtml(subject), escapeHtml(content));

    try {
      resendClient.post()
          .uri("/emails")
          .header("Authorization", "Bearer " + resendApiKey)
          .body(Map.of(
              "from", resendFromEmail,
              "to", List.of(CONTACT_TO_EMAIL),
              "reply_to", email,
              "subject", mailSubject,
              "html", html,
              "text", text))
          .retrieve()
          .toBodilessEntity();
      return new ContactResponse(true, "お問い合わせを送信しました。");
    } catch (RestClientResponseException exception) {
      throw new BadRequestException("Resend contact email send failed.");
    }
  }

  private String normalizeEmail(String value) {
    String email = required(value, "email", 254).toLowerCase(Locale.ROOT);
    if (!EMAIL_PATTERN.matcher(email).matches()) {
      throw new BadRequestException("email format is invalid.");
    }
    return email;
  }

  private String required(String value, String field, int maxLength) {
    if (value == null || value.isBlank()) {
      throw new BadRequestException(field + " is required.");
    }
    String normalized = value.trim();
    if (normalized.length() > maxLength) {
      throw new BadRequestException(field + " must be " + maxLength + " characters or less.");
    }
    return normalized;
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
