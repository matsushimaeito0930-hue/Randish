package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.FavoriteRestaurant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class FavoriteRestaurantRepository {
  private final JdbcClient jdbcClient;

  public FavoriteRestaurantRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  public FavoriteRestaurant save(FavoriteRestaurant favorite) {
    jdbcClient.sql("""
        INSERT INTO favorite_restaurants (id, user_id, restaurant_id, created_at)
        VALUES (:id, :userId, :restaurantId, :createdAt)
        """)
        .param("id", favorite.id())
        .param("userId", favorite.userId())
        .param("restaurantId", favorite.restaurantId())
        .param("createdAt", Timestamp.from(favorite.createdAt()))
        .update();
    return favorite;
  }

  public void deleteById(String id) {
    jdbcClient.sql("DELETE FROM favorite_restaurants WHERE id = :id")
        .param("id", id)
        .update();
  }

  public List<FavoriteRestaurant> findByUserId(String userId) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, created_at
        FROM favorite_restaurants
        WHERE user_id = :userId
        ORDER BY created_at DESC
        """)
        .param("userId", userId)
        .query(this::mapFavorite)
        .list();
  }

  public Optional<FavoriteRestaurant> findById(String id) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, created_at
        FROM favorite_restaurants
        WHERE id = :id
        """)
        .param("id", id)
        .query(this::mapFavorite)
        .optional();
  }

  public Optional<FavoriteRestaurant> findByUserIdAndRestaurantId(String userId, String restaurantId) {
    return jdbcClient.sql("""
        SELECT id, user_id, restaurant_id, created_at
        FROM favorite_restaurants
        WHERE user_id = :userId AND restaurant_id = :restaurantId
        """)
        .param("userId", userId)
        .param("restaurantId", restaurantId)
        .query(this::mapFavorite)
        .optional();
  }

  private FavoriteRestaurant mapFavorite(ResultSet resultSet, int rowNumber) throws SQLException {
    return new FavoriteRestaurant(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("restaurant_id"),
        resultSet.getTimestamp("created_at").toInstant());
  }
}
