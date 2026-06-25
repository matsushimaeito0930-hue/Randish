package com.example.restaurantroulette.repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PremiumRepository {
  private final JdbcClient jdbcClient;

  public PremiumRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public Optional<PremiumEntitlement> findActiveEntitlement(String userId, String entitlementKey, Instant now) {
    return jdbcClient.sql("""
        SELECT entitlement_key, source, active_until, provider, environment
        FROM (
          SELECT
            entitlement_key,
            'SUBSCRIPTION' AS source,
            CASE
              WHEN status = 'past_due' THEN grace_period_end
              ELSE current_period_end
            END AS active_until,
            provider,
            environment,
            updated_at AS sort_at
          FROM subscriptions
          WHERE user_id = :userId
            AND entitlement_key = :entitlementKey
            AND (
              (
                status IN ('active', 'trialing', 'canceled')
                AND current_period_end IS NOT NULL
                AND current_period_end > :now
              )
              OR (
                status = 'past_due'
                AND grace_period_end IS NOT NULL
                AND grace_period_end > :now
              )
            )
          UNION ALL
          SELECT
            entitlement_key,
            'GRANT' AS source,
            ends_at AS active_until,
            NULL AS provider,
            NULL AS environment,
            updated_at AS sort_at
          FROM premium_grants
          WHERE user_id = :userId
            AND entitlement_key = :entitlementKey
            AND status = 'active'
            AND starts_at <= :now
            AND (ends_at IS NULL OR ends_at > :now)
        ) premium_state
        ORDER BY active_until DESC NULLS FIRST, sort_at DESC
        LIMIT 1
        """)
        .param("userId", userId)
        .param("entitlementKey", entitlementKey)
        .param("now", Timestamp.from(now))
        .query(this::mapEntitlement)
        .optional();
  }

  private PremiumEntitlement mapEntitlement(ResultSet resultSet, int rowNumber) throws SQLException {
    Timestamp activeUntil = resultSet.getTimestamp("active_until");
    return new PremiumEntitlement(
        resultSet.getString("entitlement_key"),
        resultSet.getString("source"),
        activeUntil == null ? null : activeUntil.toInstant(),
        resultSet.getString("provider"),
        resultSet.getString("environment"));
  }

  public record PremiumEntitlement(
      String entitlementKey,
      String source,
      Instant activeUntil,
      String provider,
      String environment) {
  }
}
