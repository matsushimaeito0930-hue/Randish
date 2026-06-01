package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.Stamp;
import com.example.restaurantroulette.entity.StampType;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class StampRepository {
  private final JdbcClient jdbcClient;

  public StampRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public Stamp save(Stamp stamp) {
    jdbcClient.sql("""
        INSERT INTO stamps (id, user_id, restaurant_id, stamp_type, awarded_at)
        VALUES (:id, :userId, :restaurantId, :stampType, :awardedAt)
        """)
        .param("id", stamp.id())
        .param("userId", stamp.userId())
        .param("restaurantId", stamp.restaurantId())
        .param("stampType", stamp.stampType().name())
        .param("awardedAt", Timestamp.from(stamp.awardedAt()))
        .update();
    return stamp;
  }

  public List<Stamp> findByUserId(String userId) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, stamp_type, awarded_at
        FROM stamps
        WHERE user_id = :userId
        ORDER BY awarded_at DESC
        """)
        .param("userId", userId)
        .query(this::mapStamp)
        .list();
  }

  public boolean existsByUserIdAndRestaurantIdAndStampType(String userId, String restaurantId, StampType stampType) {
    Integer count = jdbcClient.sql("""
        SELECT COUNT(*) FROM stamps
        WHERE user_id = :userId AND restaurant_id = :restaurantId AND stamp_type = :stampType
        """)
        .param("userId", userId)
        .param("restaurantId", restaurantId)
        .param("stampType", stampType.name())
        .query(Integer.class)
        .single();
    return count != null && count > 0;
  }

  private Stamp mapStamp(ResultSet resultSet, int rowNumber) throws SQLException {
    return new Stamp(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("restaurant_id"),
        StampType.valueOf(resultSet.getString("stamp_type")),
        resultSet.getTimestamp("awarded_at").toInstant());
  }
}
