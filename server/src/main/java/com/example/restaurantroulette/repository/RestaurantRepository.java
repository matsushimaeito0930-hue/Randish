package com.example.restaurantroulette.repository;

import com.example.restaurantroulette.entity.Restaurant;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

@Repository
public class RestaurantRepository {
  private final JdbcClient jdbcClient;

  public RestaurantRepository(JdbcClient jdbcClient) {
    this.jdbcClient = jdbcClient;
    saveAll(seedRestaurants());
  }

  public List<Restaurant> findAll() {
    return jdbcClient.sql("""
        SELECT id, external_provider, external_id, name, area, genre, budget_min, budget_max,
               rating, minutes, address, photo_url, note, latitude, longitude
        FROM restaurants
        ORDER BY name
        """)
        .query(this::mapRestaurant)
        .list();
  }

  public void saveAll(List<Restaurant> incomingRestaurants) {
    incomingRestaurants.forEach(this::save);
  }

  public Optional<Restaurant> findById(String id) {
    return jdbcClient.sql("""
        SELECT id, external_provider, external_id, name, area, genre, budget_min, budget_max,
               rating, minutes, address, photo_url, note, latitude, longitude
        FROM restaurants
        WHERE id = :id
        """)
        .param("id", id)
        .query(this::mapRestaurant)
        .optional();
  }

  public List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax) {
    return findAll().stream()
        .filter(restaurant -> matchesArea(restaurant, area))
        .filter(restaurant -> genre == null || genre.isBlank() || genre.equals("すべて") || restaurant.genre().equals(genre))
        .filter(restaurant -> matchesBudget(restaurant, budgetMin, budgetMax))
        .sorted(Comparator.comparing(Restaurant::name))
        .toList();
  }

  private boolean matchesBudget(Restaurant restaurant, Integer budgetMin, Integer budgetMax) {
    if (budgetMin == null && budgetMax == null) {
      return true;
    }
    if (budgetMin == null || budgetMin <= 0) {
      return budgetMax == null || restaurant.budgetMin() <= budgetMax;
    }
    int averageBudget = (restaurant.budgetMin() + restaurant.budgetMax()) / 2;
    return averageBudget >= budgetMin
        && (budgetMax == null || averageBudget <= budgetMax);
  }

  private void save(Restaurant restaurant) {
    int updatedRows = jdbcClient.sql("""
        UPDATE restaurants
        SET external_provider = :externalProvider,
            external_id = :externalId,
            name = :name,
            area = :area,
            genre = :genre,
            budget_min = :budgetMin,
            budget_max = :budgetMax,
            rating = :rating,
            minutes = :minutes,
            address = :address,
            photo_url = :photoUrl,
            note = :note,
            latitude = :latitude,
            longitude = :longitude,
            source_synced_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = :id
        """)
        .param("id", restaurant.id())
        .param("externalProvider", restaurant.externalProvider())
        .param("externalId", restaurant.externalId())
        .param("name", restaurant.name())
        .param("area", restaurant.area())
        .param("genre", restaurant.genre())
        .param("budgetMin", restaurant.budgetMin())
        .param("budgetMax", restaurant.budgetMax())
        .param("rating", restaurant.rating())
        .param("minutes", restaurant.minutes())
        .param("address", restaurant.address())
        .param("photoUrl", restaurant.photoUrl())
        .param("note", restaurant.note())
        .param("latitude", restaurant.latitude())
        .param("longitude", restaurant.longitude())
        .update();
    if (updatedRows > 0) {
      return;
    }

    jdbcClient.sql("""
        INSERT INTO restaurants (
          id, external_provider, external_id, name, area, genre, budget_min, budget_max,
          rating, minutes, address, photo_url, note, latitude, longitude
        ) VALUES (
          :id, :externalProvider, :externalId, :name, :area, :genre, :budgetMin, :budgetMax,
          :rating, :minutes, :address, :photoUrl, :note, :latitude, :longitude
        )
        """)
        .param("id", restaurant.id())
        .param("externalProvider", restaurant.externalProvider())
        .param("externalId", restaurant.externalId())
        .param("name", restaurant.name())
        .param("area", restaurant.area())
        .param("genre", restaurant.genre())
        .param("budgetMin", restaurant.budgetMin())
        .param("budgetMax", restaurant.budgetMax())
        .param("rating", restaurant.rating())
        .param("minutes", restaurant.minutes())
        .param("address", restaurant.address())
        .param("photoUrl", restaurant.photoUrl())
        .param("note", restaurant.note())
        .param("latitude", restaurant.latitude())
        .param("longitude", restaurant.longitude())
        .update();
  }

  private boolean matchesArea(Restaurant restaurant, String area) {
    if (area == null || area.isBlank() || area.equals("現在地")) {
      return true;
    }
    return restaurant.area().contains(area) || restaurant.address().contains(area);
  }

  private Restaurant mapRestaurant(ResultSet resultSet, int rowNumber) throws SQLException {
    return new Restaurant(
        resultSet.getString("id"),
        resultSet.getString("external_provider"),
        resultSet.getString("external_id"),
        resultSet.getString("name"),
        resultSet.getString("area"),
        resultSet.getString("genre"),
        resultSet.getInt("budget_min"),
        resultSet.getInt("budget_max"),
        resultSet.getDouble("rating"),
        resultSet.getInt("minutes"),
        resultSet.getString("address"),
        resultSet.getString("photo_url"),
        resultSet.getString("note"),
        getNullableDouble(resultSet, "latitude"),
        getNullableDouble(resultSet, "longitude"));
  }

  private Double getNullableDouble(ResultSet resultSet, String column) throws SQLException {
    double value = resultSet.getDouble(column);
    return resultSet.wasNull() ? null : value;
  }

  private List<Restaurant> seedRestaurants() {
    return List.of(
        restaurant("seed-umeda-ramen", "梅田", "ラーメン", "麺や RANDISH 梅田", 900, 1400, 4.4, 8,
            "大阪府大阪市北区梅田1-1", "香ばしいスープと細麺。迷った日の一杯に。", 34.7025, 135.4959),
        restaurant("seed-namba-yakiniku", "難波", "焼肉", "炭火焼肉 夕映え 難波", 2800, 5200, 4.3, 10,
            "大阪府大阪市中央区難波2-2", "軽く贅沢したい夜にちょうどいい焼肉。", 34.6658, 135.5011),
        restaurant("seed-motomachi-cafe", "元町", "カフェ", "白い皿のカフェ 元町", 1000, 2200, 4.5, 7,
            "兵庫県神戸市中央区元町通1-1", "静かに決めたい昼ごはんに。", 34.6896, 135.1877),
        restaurant("seed-kyoto-washoku", "河原町", "和食", "京だし食堂 河原町", 1400, 3200, 4.2, 9,
            "京都府京都市中京区河原町通1-1", "だしの香りで落ち着ける和食。", 35.0037, 135.7689),
        restaurant("seed-sapporo-izakaya", "札幌", "居酒屋", "北の小皿 札幌", 2200, 4200, 4.1, 11,
            "北海道札幌市中央区北1条1-1", "旅先でも使いやすい小皿居酒屋。", 43.0618, 141.3545),
        restaurant("seed-tokyo-sushi", "銀座", "寿司", "鮨 RANDISH 銀座", 3000, 8000, 4.6, 6,
            "東京都中央区銀座1-1", "少し背伸びしたい日にちょうどいい寿司。", 35.6719, 139.7659),
        restaurant("seed-fukuoka-ramen", "博多", "ラーメン", "博多細麺 つきあかり", 800, 1300, 4.3, 8,
            "福岡県福岡市博多区博多駅前1-1", "迷わず決めたい夜の豚骨ラーメン。", 33.5904, 130.4207),
        restaurant("seed-okinawa-world", "国際通り", "各国料理", "島テーブル 国際通り", 1400, 3600, 4.2, 10,
            "沖縄県那覇市牧志1-1", "沖縄らしい料理を気軽に選べる店。", 26.2154, 127.6891));
  }

  private Restaurant restaurant(
      String id,
      String area,
      String genre,
      String name,
      int budgetMin,
      int budgetMax,
      double rating,
      int minutes,
      String address,
      String note,
      Double latitude,
      Double longitude) {
    return new Restaurant(
        id,
        "RANDISH_SEED",
        id,
        name,
        area,
        genre,
        budgetMin,
        budgetMax,
        rating,
        minutes,
        address,
        null,
        note,
        latitude,
        longitude);
  }
}
