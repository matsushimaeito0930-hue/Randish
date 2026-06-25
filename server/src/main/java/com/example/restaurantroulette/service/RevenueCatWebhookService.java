package com.example.restaurantroulette.service;

import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.repository.RevenueCatWebhookRepository;
import com.example.restaurantroulette.repository.RevenueCatWebhookRepository.RevenueCatEvent;
import com.example.restaurantroulette.repository.RevenueCatWebhookRepository.RevenueCatSubscription;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Service;

@Service
public class RevenueCatWebhookService {
  private static final Set<String> SUBSCRIPTION_EVENT_TYPES = Set.of(
      "INITIAL_PURCHASE",
      "RENEWAL",
      "CANCELLATION",
      "UNCANCELLATION",
      "NON_RENEWING_PURCHASE",
      "SUBSCRIPTION_PAUSED",
      "EXPIRATION",
      "BILLING_ISSUE",
      "PRODUCT_CHANGE",
      "SUBSCRIPTION_EXTENDED",
      "REFUND_REVERSED");
  private static final int MAX_RAW_PAYLOAD_LENGTH = 50_000;

  private final RevenueCatWebhookRepository repository;
  private final ObjectMapper objectMapper;
  private final String webhookAuthorization;

  public RevenueCatWebhookService(RevenueCatWebhookRepository repository, ObjectMapper objectMapper) {
    this.repository = repository;
    this.objectMapper = objectMapper;
    this.webhookAuthorization = firstPresent(
        System.getProperty("REVENUECAT_WEBHOOK_AUTHORIZATION"),
        System.getenv("REVENUECAT_WEBHOOK_AUTHORIZATION"));
  }

  public void handle(String authorizationHeader, JsonNode payload) {
    requireAuthorized(authorizationHeader);
    JsonNode event = payload == null ? null : payload.get("event");
    if (event == null || !event.isObject()) {
      return;
    }

    String eventType = text(event, "type").toUpperCase(Locale.ROOT);
    if (!SUBSCRIPTION_EVENT_TYPES.contains(eventType) || !hasPremiumEntitlement(event)) {
      return;
    }

    Optional<String> provider = mapStoreToProvider(text(event, "store"));
    if (provider.isEmpty()) {
      return;
    }

    String environment = normalizeEnvironment(text(event, "environment"));
    String providerEventId = firstPresent(text(event, "id"), stableId("rc_evt_source_", rawPayload(payload)));
    Optional<String> userId = repository.findExistingUserId(userCandidates(event));
    Instant now = Instant.now();

    boolean inserted = repository.insertPaymentEvent(new RevenueCatEvent(
        stableId("rc_evt_", providerEventId),
        provider.get(),
        environment,
        providerEventId,
        eventType,
        instantFromMillis(event, "event_timestamp_ms"),
        now,
        userId.isPresent() ? "processed" : "ignored",
        rawPayload(payload)));
    if (!inserted || userId.isEmpty()) {
      return;
    }

    String transactionId = text(event, "transaction_id");
    String originalTransactionId = text(event, "original_transaction_id");
    String providerSubscriptionId = firstPresent(originalTransactionId, transactionId, providerEventId);

    repository.upsertSubscription(new RevenueCatSubscription(
        stableId("rc_sub_", "%s:%s:%s".formatted(provider.get(), environment, providerSubscriptionId)),
        userId.get(),
        provider.get(),
        environment,
        providerSubscriptionId,
        firstPresent(text(event, "app_user_id"), userId.get()),
        text(event, "product_id"),
        mapStatus(eventType, text(event, "period_type")),
        eventType,
        PremiumService.PREMIUM_ENTITLEMENT_KEY,
        instantFromMillis(event, "purchased_at_ms"),
        instantFromMillis(event, "expiration_at_ms"),
        "TRIAL".equalsIgnoreCase(text(event, "period_type")) ? instantFromMillis(event, "purchased_at_ms") : null,
        "TRIAL".equalsIgnoreCase(text(event, "period_type")) ? instantFromMillis(event, "expiration_at_ms") : null,
        instantFromMillis(event, "grace_period_expiration_at_ms"),
        originalTransactionId,
        transactionId,
        now,
        now));
  }

  private void requireAuthorized(String authorizationHeader) {
    if (webhookAuthorization == null || webhookAuthorization.isBlank()) {
      throw new UnauthorizedException("RevenueCat webhook authorization is not configured.");
    }
    if (!MessageDigest.isEqual(
        webhookAuthorization.getBytes(StandardCharsets.UTF_8),
        String.valueOf(authorizationHeader == null ? "" : authorizationHeader).getBytes(StandardCharsets.UTF_8))) {
      throw new UnauthorizedException("RevenueCat webhook authorization is invalid.");
    }
  }

  private boolean hasPremiumEntitlement(JsonNode event) {
    String entitlementId = text(event, "entitlement_id");
    if (PremiumService.PREMIUM_ENTITLEMENT_KEY.equals(entitlementId)) {
      return true;
    }
    JsonNode entitlementIds = event.get("entitlement_ids");
    if (entitlementIds == null || !entitlementIds.isArray()) {
      return false;
    }
    for (JsonNode item : entitlementIds) {
      if (PremiumService.PREMIUM_ENTITLEMENT_KEY.equals(item.asText())) {
        return true;
      }
    }
    return false;
  }

  private List<String> userCandidates(JsonNode event) {
    List<String> candidates = new ArrayList<>();
    addCandidate(candidates, text(event, "app_user_id"));
    addCandidate(candidates, text(event, "original_app_user_id"));
    JsonNode aliases = event.get("aliases");
    if (aliases != null && aliases.isArray()) {
      aliases.forEach(alias -> addCandidate(candidates, alias.asText()));
    }
    return candidates;
  }

  private void addCandidate(List<String> candidates, String value) {
    String cleanValue = value == null ? "" : value.trim();
    if (!cleanValue.isBlank() && !ValidationService.GUEST_USER_ID.equals(cleanValue) && cleanValue.length() <= 120 && !candidates.contains(cleanValue)) {
      candidates.add(cleanValue);
    }
  }

  private Optional<String> mapStoreToProvider(String store) {
    return switch (store.toUpperCase(Locale.ROOT)) {
      case "APP_STORE", "MAC_APP_STORE" -> Optional.of("APP_STORE");
      case "PLAY_STORE" -> Optional.of("GOOGLE_PLAY");
      case "STRIPE" -> Optional.of("STRIPE");
      default -> Optional.empty();
    };
  }

  private String normalizeEnvironment(String environment) {
    return "PRODUCTION".equalsIgnoreCase(environment) ? "PRODUCTION" : "SANDBOX";
  }

  private String mapStatus(String eventType, String periodType) {
    return switch (eventType) {
      case "EXPIRATION" -> "expired";
      case "BILLING_ISSUE" -> "past_due";
      case "SUBSCRIPTION_PAUSED" -> "paused";
      case "CANCELLATION" -> "canceled";
      default -> "TRIAL".equalsIgnoreCase(periodType) ? "trialing" : "active";
    };
  }

  private Instant instantFromMillis(JsonNode event, String fieldName) {
    JsonNode value = event.get(fieldName);
    return value == null || value.isNull() ? null : Instant.ofEpochMilli(value.asLong());
  }

  private String text(JsonNode event, String fieldName) {
    JsonNode value = event.get(fieldName);
    return value == null || value.isNull() ? "" : value.asText("").trim();
  }

  private String rawPayload(JsonNode payload) {
    try {
      String raw = objectMapper.writeValueAsString(payload);
      return raw.length() <= MAX_RAW_PAYLOAD_LENGTH ? raw : raw.substring(0, MAX_RAW_PAYLOAD_LENGTH);
    } catch (Exception ignored) {
      return "{}";
    }
  }

  private String stableId(String prefix, String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8));
      return prefix + HexFormat.of().formatHex(hash).substring(0, 32);
    } catch (Exception exception) {
      throw new IllegalStateException("Unable to build stable id.", exception);
    }
  }

  private String firstPresent(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value.trim();
      }
    }
    return "";
  }
}
