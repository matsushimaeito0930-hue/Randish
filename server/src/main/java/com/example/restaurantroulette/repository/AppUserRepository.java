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

  private AppUser mapUser(ResultSet resultSet, int rowNumber) throws SQLException {
    return new AppUser(
        resultSet.getString("id"),
        resultSet.getString("email"),
        resultSet.getString("display_name"),
        resultSet.getString("auth_provider"),
        resultSet.getTimestamp("created_at").toInstant(),
        resultSet.getTimestamp("updated_at").toInstant());
  }
}
