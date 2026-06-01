package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.VisitCollection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class VisitCollectionRepository {
  private final JdbcClient jdbcClient;

  public VisitCollectionRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public VisitCollection save(VisitCollection visit) {
    jdbcClient.sql("""
        INSERT INTO visit_collections (id, user_id, restaurant_id, visit_date, photo_url, memo, rating, created_at)
        VALUES (:id, :userId, :restaurantId, :visitDate, :photoUrl, :memo, :rating, :createdAt)
        """)
        .param("id", visit.id())
        .param("userId", visit.userId())
        .param("restaurantId", visit.restaurantId())
        .param("visitDate", visit.visitDate())
        .param("photoUrl", visit.photoUrl())
        .param("memo", visit.memo())
        .param("rating", visit.rating())
        .param("createdAt", Timestamp.from(visit.createdAt()))
        .update();
    return visit;
  }

  public List<VisitCollection> findByUserId(String userId) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, visit_date, photo_url, memo, rating, created_at
        FROM visit_collections
        WHERE user_id = :userId
        ORDER BY visit_date DESC, created_at DESC
        """)
        .param("userId", userId)
        .query(this::mapVisit)
        .list();
  }

  public boolean existsByUserIdAndRestaurantId(String userId, String restaurantId) {
    Integer count = jdbcClient.sql("""
        SELECT COUNT(*) FROM visit_collections
        WHERE user_id = :userId AND restaurant_id = :restaurantId
        """)
        .param("userId", userId)
        .param("restaurantId", restaurantId)
        .query(Integer.class)
        .single();
    return count != null && count > 0;
  }

  private VisitCollection mapVisit(ResultSet resultSet, int rowNumber) throws SQLException {
    return new VisitCollection(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("restaurant_id"),
        resultSet.getDate("visit_date").toLocalDate(),
        resultSet.getString("photo_url"),
        resultSet.getString("memo"),
        resultSet.getInt("rating"),
        resultSet.getTimestamp("created_at").toInstant());
  }
}
