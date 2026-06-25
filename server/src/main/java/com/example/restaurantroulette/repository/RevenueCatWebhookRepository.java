package com.example.restaurantroulette.repository;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RevenueCatWebhookRepository {
  private final JdbcClient jdbcClient;

  public RevenueCatWebhookRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public boolean insertPaymentEvent(RevenueCatEvent event) {
    try {
      jdbcClient.sql("""
          INSERT INTO payment_events (
            id, provider, environment, provider_event_id, event_type,
            provider_created_at, processed_at, processing_status, raw_payload
          )
          VALUES (
            :id, :provider, :environment, :providerEventId, :eventType,
            :providerCreatedAt, :processedAt, :processingStatus, :rawPayload
          )
          """)
          .param("id", event.id())
          .param("provider", event.provider())
          .param("environment", event.environment())
          .param("providerEventId", event.providerEventId())
          .param("eventType", event.eventType())
          .param("providerCreatedAt", toTimestamp(event.providerCreatedAt()))
          .param("processedAt", toTimestamp(event.processedAt()))
          .param("processingStatus", event.processingStatus())
          .param("rawPayload", event.rawPayload())
          .update();
      return true;
    } catch (DuplicateKeyException ignored) {
      return false;
    }
  }

  public Optional<String> findExistingUserId(List<String> candidateUserIds) {
    for (String userId : candidateUserIds) {
      Optional<String> found = jdbcClient.sql("SELECT id FROM app_users WHERE id = :userId")
          .param("userId", userId)
          .query(String.class)
          .optional();
      if (found.isPresent()) {
        return found;
      }
    }
    return Optional.empty();
  }

  public void upsertSubscription(RevenueCatSubscription subscription) {
    Optional<String> existingId = jdbcClient.sql("""
        SELECT id
        FROM subscriptions
        WHERE provider = :provider
          AND environment = :environment
          AND provider_subscription_id = :providerSubscriptionId
        """)
        .param("provider", subscription.provider())
        .param("environment", subscription.environment())
        .param("providerSubscriptionId", subscription.providerSubscriptionId())
        .query(String.class)
        .optional();

    if (existingId.isPresent()) {
      jdbcClient.sql("""
          UPDATE subscriptions
          SET user_id = :userId,
              provider_customer_id = :providerCustomerId,
              provider_product_id = :providerProductId,
              status = :status,
              raw_status = :rawStatus,
              entitlement_key = :entitlementKey,
              current_period_start = :currentPeriodStart,
              current_period_end = :currentPeriodEnd,
              trial_start = :trialStart,
              trial_end = :trialEnd,
              grace_period_end = :gracePeriodEnd,
              original_transaction_id = :originalTransactionId,
              latest_transaction_id = :latestTransactionId,
              updated_at = :updatedAt
          WHERE id = :id
          """)
          .param("id", existingId.get())
          .param("userId", subscription.userId())
          .param("providerCustomerId", subscription.providerCustomerId())
          .param("providerProductId", subscription.providerProductId())
          .param("status", subscription.status())
          .param("rawStatus", subscription.rawStatus())
          .param("entitlementKey", subscription.entitlementKey())
          .param("currentPeriodStart", toTimestamp(subscription.currentPeriodStart()))
          .param("currentPeriodEnd", toTimestamp(subscription.currentPeriodEnd()))
          .param("trialStart", toTimestamp(subscription.trialStart()))
          .param("trialEnd", toTimestamp(subscription.trialEnd()))
          .param("gracePeriodEnd", toTimestamp(subscription.gracePeriodEnd()))
          .param("originalTransactionId", subscription.originalTransactionId())
          .param("latestTransactionId", subscription.latestTransactionId())
          .param("updatedAt", toTimestamp(subscription.updatedAt()))
          .update();
      return;
    }

    jdbcClient.sql("""
        INSERT INTO subscriptions (
          id, user_id, provider, environment, provider_subscription_id,
          provider_customer_id, provider_product_id, status, raw_status,
          entitlement_key, current_period_start, current_period_end,
          trial_start, trial_end, grace_period_end, original_transaction_id,
          latest_transaction_id, created_at, updated_at
        )
        VALUES (
          :id, :userId, :provider, :environment, :providerSubscriptionId,
          :providerCustomerId, :providerProductId, :status, :rawStatus,
          :entitlementKey, :currentPeriodStart, :currentPeriodEnd,
          :trialStart, :trialEnd, :gracePeriodEnd, :originalTransactionId,
          :latestTransactionId, :createdAt, :updatedAt
        )
        """)
        .param("id", subscription.id())
        .param("userId", subscription.userId())
        .param("provider", subscription.provider())
        .param("environment", subscription.environment())
        .param("providerSubscriptionId", subscription.providerSubscriptionId())
        .param("providerCustomerId", subscription.providerCustomerId())
        .param("providerProductId", subscription.providerProductId())
        .param("status", subscription.status())
        .param("rawStatus", subscription.rawStatus())
        .param("entitlementKey", subscription.entitlementKey())
        .param("currentPeriodStart", toTimestamp(subscription.currentPeriodStart()))
        .param("currentPeriodEnd", toTimestamp(subscription.currentPeriodEnd()))
        .param("trialStart", toTimestamp(subscription.trialStart()))
        .param("trialEnd", toTimestamp(subscription.trialEnd()))
        .param("gracePeriodEnd", toTimestamp(subscription.gracePeriodEnd()))
        .param("originalTransactionId", subscription.originalTransactionId())
        .param("latestTransactionId", subscription.latestTransactionId())
        .param("createdAt", toTimestamp(subscription.createdAt()))
        .param("updatedAt", toTimestamp(subscription.updatedAt()))
        .update();
  }

  private Timestamp toTimestamp(Instant instant) {
    return instant == null ? null : Timestamp.from(instant);
  }

  public record RevenueCatEvent(
      String id,
      String provider,
      String environment,
      String providerEventId,
      String eventType,
      Instant providerCreatedAt,
      Instant processedAt,
      String processingStatus,
      String rawPayload) {
  }

  public record RevenueCatSubscription(
      String id,
      String userId,
      String provider,
      String environment,
      String providerSubscriptionId,
      String providerCustomerId,
      String providerProductId,
      String status,
      String rawStatus,
      String entitlementKey,
      Instant currentPeriodStart,
      Instant currentPeriodEnd,
      Instant trialStart,
      Instant trialEnd,
      Instant gracePeriodEnd,
      String originalTransactionId,
      String latestTransactionId,
      Instant createdAt,
      Instant updatedAt) {
  }
}
