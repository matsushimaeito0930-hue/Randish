package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.ExcludedRestaurant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class ExcludedRestaurantRepository {
  private final JdbcClient jdbcClient;

  public ExcludedRestaurantRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
  }

  /**
   * 登録する。同じ店を二度外したときは、あとの内容で上書きする。
   *
   * <p>二度押したときに増えたり失敗したりするのは、利用者から見れば同じ操作なのに
   * 結果が違うということになる。理由を書き直したいこともあるので上書きにする。
   */
  public ExcludedRestaurant save(ExcludedRestaurant excluded) {
    jdbcClient.sql("""
        INSERT INTO excluded_restaurants (
          id, user_id, provider, provider_place_id, restaurant_name, reason, created_at
        )
        VALUES (:id, :userId, :provider, :providerPlaceId, :restaurantName, :reason, :createdAt)
        ON CONFLICT (user_id, provider, provider_place_id) DO UPDATE SET
          restaurant_name = EXCLUDED.restaurant_name,
          reason = EXCLUDED.reason
        """)
        .param("id", excluded.id())
        .param("userId", excluded.userId())
        .param("provider", excluded.provider())
        .param("providerPlaceId", excluded.providerPlaceId())
        .param("restaurantName", excluded.restaurantName())
        .param("reason", excluded.reason())
        .param("createdAt", Timestamp.from(excluded.createdAt()))
        .update();
    return findByKey(excluded.userId(), excluded.provider(), excluded.providerPlaceId())
        .orElse(excluded);
  }

  public List<ExcludedRestaurant> findByUserId(String userId) {
    return jdbcClient.sql("""
        SELECT * FROM excluded_restaurants
        WHERE user_id = :userId
        ORDER BY created_at DESC
        """)
        .param("userId", userId)
        .query(this::map)
        .list();
  }

  public Optional<ExcludedRestaurant> findById(String id) {
    return jdbcClient.sql("SELECT * FROM excluded_restaurants WHERE id = :id")
        .param("id", id)
        .query(this::map)
        .optional();
  }

  public Optional<ExcludedRestaurant> findByKey(String userId, String provider, String providerPlaceId) {
    return jdbcClient.sql("""
        SELECT * FROM excluded_restaurants
        WHERE user_id = :userId AND provider = :provider AND provider_place_id = :providerPlaceId
        """)
        .param("userId", userId)
        .param("provider", provider)
        .param("providerPlaceId", providerPlaceId)
        .query(this::map)
        .optional();
  }

  public void delete(String id) {
    jdbcClient.sql("DELETE FROM excluded_restaurants WHERE id = :id")
        .param("id", id)
        .update();
  }

  private ExcludedRestaurant map(ResultSet resultSet, int rowNumber) throws SQLException {
    return new ExcludedRestaurant(
        resultSet.getString("id"),
        resultSet.getString("user_id"),
        resultSet.getString("provider"),
        resultSet.getString("provider_place_id"),
        resultSet.getString("restaurant_name"),
        resultSet.getString("reason"),
        resultSet.getTimestamp("created_at").toInstant());
  }
}
