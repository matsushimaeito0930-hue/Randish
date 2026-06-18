package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.PendingEmailRegistration;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class PendingEmailRegistrationRepository {
  private final JdbcClient jdbcClient;

  public PendingEmailRegistrationRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public void save(PendingEmailRegistration registration) {
    jdbcClient.sql("""
        INSERT INTO pending_email_registrations (
          id, email, display_name, password_hash, password_salt, token_hash, expires_at, consumed_at, created_at
        )
        VALUES (
          :id, :email, :displayName, :passwordHash, :passwordSalt, :tokenHash, :expiresAt, :consumedAt, :createdAt
        )
        """)
        .param("id", registration.id())
        .param("email", registration.email())
        .param("displayName", registration.displayName())
        .param("passwordHash", registration.passwordHash())
        .param("passwordSalt", registration.passwordSalt())
        .param("tokenHash", registration.tokenHash())
        .param("expiresAt", Timestamp.from(registration.expiresAt()))
        .param("consumedAt", toTimestamp(registration.consumedAt()))
        .param("createdAt", Timestamp.from(registration.createdAt()))
        .update();
  }

  public Optional<PendingEmailRegistration> findByTokenHash(String tokenHash) {
    return jdbcClient.sql("""
        SELECT id, email, display_name, password_hash, password_salt, token_hash, expires_at, consumed_at, created_at
        FROM pending_email_registrations
        WHERE token_hash = :tokenHash
        """)
        .param("tokenHash", tokenHash)
        .query(this::mapRegistration)
        .optional();
  }

  public void consume(String id, Instant consumedAt) {
    jdbcClient.sql("""
        UPDATE pending_email_registrations
        SET consumed_at = :consumedAt
        WHERE id = :id
        """)
        .param("id", id)
        .param("consumedAt", Timestamp.from(consumedAt))
        .update();
  }

  public void deleteOpenByEmail(String email) {
    jdbcClient.sql("""
        DELETE FROM pending_email_registrations
        WHERE email = :email AND consumed_at IS NULL
        """)
        .param("email", email)
        .update();
  }

  private PendingEmailRegistration mapRegistration(ResultSet resultSet, int rowNumber) throws SQLException {
    return new PendingEmailRegistration(
        resultSet.getString("id"),
        resultSet.getString("email"),
        resultSet.getString("display_name"),
        resultSet.getString("password_hash"),
        resultSet.getString("password_salt"),
        resultSet.getString("token_hash"),
        resultSet.getTimestamp("expires_at").toInstant(),
        toInstant(resultSet.getTimestamp("consumed_at")),
        resultSet.getTimestamp("created_at").toInstant());
  }

  private Timestamp toTimestamp(Instant value) {
    return value == null ? null : Timestamp.from(value);
  }

  private Instant toInstant(Timestamp timestamp) {
    return timestamp == null ? null : timestamp.toInstant();
  }
}
