package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.RandomHistory;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RandomHistoryRepository {
  private final JdbcClient jdbcClient;

  public RandomHistoryRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public RandomHistory save(RandomHistory history) {
    jdbcClient.sql("""
        INSERT INTO random_histories (
          id, user_id, restaurant_id, provider, provider_place_id,
          area, genre, budget_min, budget_max, range_meters, created_at
        )
        VALUES (
          :id, :userId, :restaurantId, :provider, :providerPlaceId,
          :area, :genre, :budgetMin, :budgetMax, :rangeMeters, :createdAt
        )
        """)
        .param("id", history.id())
        .param("userId", history.userId())
        .param("restaurantId", history.restaurantId())
        .param("provider", history.provider())
        .param("providerPlaceId", history.providerPlaceId())
        .param("area", history.area())
        .param("genre", history.genre())
        .param("budgetMin", history.budgetMin())
        .param("budgetMax", history.budgetMax())
        .param("rangeMeters", history.rangeMeters())
        .param("createdAt", Timestamp.from(history.createdAt()))
        .update();
    return history;
  }

  public List<RandomHistory> findByUserId(String userId) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, provider, provider_place_id,
               area, genre, budget_min, budget_max, range_meters, created_at
        FROM random_histories
        WHERE user_id = :userId
        ORDER BY created_at DESC
        """)
        .param("userId", userId)
        .query(this::mapHistory)
        .list();
  }

  public Optional<RandomHistory> findById(String id) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, provider, provider_place_id,
               area, genre, budget_min, budget_max, range_meters, created_at
        FROM random_histories
        WHERE id = :id
        """)
        .param("id", id)
        .query(this::mapHistory)
        .optional();
  }

  private RandomHistory mapHistory(ResultSet resultSet, int rowNumber) throws SQLException {
    return new RandomHistory(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("restaurant_id"),
        resultSet.getString("provider"),
        resultSet.getString("provider_place_id"),
        resultSet.getString("area"),
        resultSet.getString("genre"),
        getNullableInteger(resultSet, "budget_min"),
        getNullableInteger(resultSet, "budget_max"),
        getNullableInteger(resultSet, "range_meters"),
        resultSet.getTimestamp("created_at").toInstant());
  }

  private Integer getNullableInteger(ResultSet resultSet, String column) throws SQLException {
    int value = resultSet.getInt(column);
    return resultSet.wasNull() ? null : value;
  }
}
