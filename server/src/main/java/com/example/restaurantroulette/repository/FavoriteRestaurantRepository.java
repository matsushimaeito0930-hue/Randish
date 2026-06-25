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
        INSERT INTO favorite_restaurants (
          id, user_id, provider, provider_place_id, restaurant_id,
          saved_area, saved_genre, saved_budget_min, saved_budget_max, saved_range_meters,
          user_memo, user_tags, created_at
        )
        VALUES (
          :id, :userId, :provider, :providerPlaceId, :restaurantId,
          :savedArea, :savedGenre, :savedBudgetMin, :savedBudgetMax, :savedRangeMeters,
          :userMemo, :userTags, :createdAt
        )
        """)
        .param("id", favorite.id())
        .param("userId", favorite.userId())
        .param("provider", favorite.provider())
        .param("providerPlaceId", favorite.providerPlaceId())
        .param("restaurantId", favorite.restaurantId())
        .param("savedArea", favorite.savedArea())
        .param("savedGenre", favorite.savedGenre())
        .param("savedBudgetMin", favorite.savedBudgetMin())
        .param("savedBudgetMax", favorite.savedBudgetMax())
        .param("savedRangeMeters", favorite.savedRangeMeters())
        .param("userMemo", favorite.userMemo())
        .param("userTags", favorite.userTags())
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
        SELECT id, user_id, provider, provider_place_id, restaurant_id,
               saved_area, saved_genre, saved_budget_min, saved_budget_max, saved_range_meters,
               user_memo, user_tags, created_at
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
        SELECT id, user_id, provider, provider_place_id, restaurant_id,
               saved_area, saved_genre, saved_budget_min, saved_budget_max, saved_range_meters,
               user_memo, user_tags, created_at
        FROM favorite_restaurants
        WHERE id = :id
        """)
        .param("id", id)
        .query(this::mapFavorite)
        .optional();
  }

  public Optional<FavoriteRestaurant> findByUserIdAndRestaurantId(String userId, String restaurantId) {
    return jdbcClient.sql("""
        SELECT id, user_id, provider, provider_place_id, restaurant_id,
               saved_area, saved_genre, saved_budget_min, saved_budget_max, saved_range_meters,
               user_memo, user_tags, created_at
        FROM favorite_restaurants
        WHERE user_id = :userId AND restaurant_id = :restaurantId
        """)
        .param("userId", userId)
        .param("restaurantId", restaurantId)
        .query(this::mapFavorite)
        .optional();
  }

  public Optional<FavoriteRestaurant> findByUserIdAndProviderPlaceId(String userId, String provider, String providerPlaceId) {
    return jdbcClient.sql("""
        SELECT id, user_id, provider, provider_place_id, restaurant_id,
               saved_area, saved_genre, saved_budget_min, saved_budget_max, saved_range_meters,
               user_memo, user_tags, created_at
        FROM favorite_restaurants
        WHERE user_id = :userId AND provider = :provider AND provider_place_id = :providerPlaceId
        """)
        .param("userId", userId)
        .param("provider", provider)
        .param("providerPlaceId", providerPlaceId)
        .query(this::mapFavorite)
        .optional();
  }

  private FavoriteRestaurant mapFavorite(ResultSet resultSet, int rowNumber) throws SQLException {
    return new FavoriteRestaurant(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("provider"),
        resultSet.getString("provider_place_id"),
        resultSet.getString("restaurant_id"),
        resultSet.getString("saved_area"),
        resultSet.getString("saved_genre"),
        getNullableInteger(resultSet, "saved_budget_min"),
        getNullableInteger(resultSet, "saved_budget_max"),
        getNullableInteger(resultSet, "saved_range_meters"),
        resultSet.getString("user_memo"),
        resultSet.getString("user_tags"),
        resultSet.getTimestamp("created_at").toInstant());
  }

  private Integer getNullableInteger(ResultSet resultSet, String column) throws SQLException {
    int value = resultSet.getInt(column);
    return resultSet.wasNull() ? null : value;
  }
}
