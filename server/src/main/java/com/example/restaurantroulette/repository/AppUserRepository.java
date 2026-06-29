package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.AppUser;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class AppUserRepository {
  private final JdbcClient jdbcClient;

  public AppUserRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public AppUser save(AppUser user, String passwordHash, String passwordSalt) {
    jdbcClient.sql("""
        INSERT INTO app_users (id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at)
        VALUES (:id, :email, :displayName, :passwordHash, :passwordSalt, :authProvider, :createdAt, :updatedAt)
        """)
        .param("id", user.id())
        .param("email", user.email())
        .param("displayName", user.displayName())
        .param("passwordHash", passwordHash)
        .param("passwordSalt", passwordSalt)
        .param("authProvider", user.authProvider())
        .param("createdAt", Timestamp.from(user.createdAt()))
        .param("updatedAt", Timestamp.from(user.updatedAt()))
        .update();
    return user;
  }

  public AppUser upsertExternalUser(AppUser user) {
    int updatedRows = jdbcClient.sql("""
        UPDATE app_users
        SET email = :email,
            display_name = :displayName,
            auth_provider = :authProvider,
            updated_at = :updatedAt
        WHERE id = :id
        """)
        .param("id", user.id())
        .param("email", user.email())
        .param("displayName", user.displayName())
        .param("authProvider", user.authProvider())
        .param("updatedAt", Timestamp.from(user.updatedAt()))
        .update();
    if (updatedRows > 0) {
      return user;
    }

    Optional<AppUser> existingByEmail = findByEmail(user.email());
    if (existingByEmail.isPresent()) {
      AppUser existingUser = existingByEmail.get();
      jdbcClient.sql("""
          UPDATE app_users
          SET display_name = :displayName,
              auth_provider = :authProvider,
              updated_at = :updatedAt
          WHERE email = :email
          """)
          .param("email", user.email())
          .param("displayName", user.displayName())
          .param("authProvider", user.authProvider())
          .param("updatedAt", Timestamp.from(user.updatedAt()))
          .update();
      return new AppUser(
          existingUser.id(),
          user.email(),
          user.displayName(),
          user.authProvider(),
          existingUser.createdAt(),
          user.updatedAt());
    }

    jdbcClient.sql("""
        INSERT INTO app_users (id, email, display_name, auth_provider, created_at, updated_at)
        VALUES (:id, :email, :displayName, :authProvider, :createdAt, :updatedAt)
        """)
        .param("id", user.id())
        .param("email", user.email())
        .param("displayName", user.displayName())
        .param("authProvider", user.authProvider())
        .param("createdAt", Timestamp.from(user.createdAt()))
        .param("updatedAt", Timestamp.from(user.updatedAt()))
        .update();
    return user;
  }

  public Optional<AppUser> findById(String id) {
    return jdbcClient.sql("""
        SELECT id, email, display_name, auth_provider, created_at, updated_at
        FROM app_users
        WHERE id = :id
        """)
        .param("id", id)
        .query(this::mapUser)
        .optional();
  }

  public Optional<AppUser> findByEmail(String email) {
    return jdbcClient.sql("""
        SELECT id, email, display_name, auth_provider, created_at, updated_at
        FROM app_users
        WHERE email = :email
        """)
        .param("email", email)
        .query(this::mapUser)
        .optional();
  }

  public Optional<AppUserCredentials> findCredentialsByEmail(String email) {
    return jdbcClient.sql("""
        SELECT id, email, display_name, password_hash, password_salt, auth_provider, created_at, updated_at
        FROM app_users
        WHERE email = :email
        """)
        .param("email", email)
        .query(this::mapUserCredentials)
        .optional();
  }

  private AppUser mapUser(ResultSet resultSet, int rowNumber) throws SQLException {
    return new AppUser(
        resultSet.getString("id"),
        resultSet.getString("email"),
        resultSet.getString("display_name"),
        resultSet.getString("auth_provider"),
        resultSet.getTimestamp("created_at").toInstant(),
        resultSet.getTimestamp("updated_at").toInstant());
  }

  private AppUserCredentials mapUserCredentials(ResultSet resultSet, int rowNumber) throws SQLException {
    return new AppUserCredentials(
        mapUser(resultSet, rowNumber),
        resultSet.getString("password_hash"),
        resultSet.getString("password_salt"));
  }

  public record AppUserCredentials(AppUser user, String passwordHash, String passwordSalt) {
  }
}
