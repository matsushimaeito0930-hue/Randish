package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import com.fasterxml.jackson.databind.JsonNode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.springframework.stereotype.Component;

@Component
public class GeoapifyRestaurantMapper {
  static final String PROVIDER = "GEOAPIFY";

  private static final int MAX_EXTERNAL_ID_LENGTH = 255;
  private static final String ALL_GENRES = "すべて";
  private static final List<String> RAMEN_KEYWORDS = List.of(
      "ラーメン",
      "らーめん",
      "つけ麺",
      "つけめん",
      "油そば",
      "まぜそば",
      "麺",
      "ramen",
      "noodle");
  private static final List<String> JAPANESE_KEYWORDS = List.of("和食", "日本料理", "食堂", "定食", "japanese");
  private static final BudgetRange DEFAULT_BUDGET = new BudgetRange(0, 8000);
  private static final Map<String, BudgetRange> GENRE_BUDGETS = Map.ofEntries(
      Map.entry("ラーメン", new BudgetRange(700, 1500)),
      Map.entry("焼肉", new BudgetRange(2500, 7000)),
      Map.entry("居酒屋", new BudgetRange(2000, 5000)),
      Map.entry("韓国料理", new BudgetRange(1500, 4000)),
      Map.entry("カレー", new BudgetRange(800, 1800)),
      Map.entry("うどん", new BudgetRange(600, 1600)),
      Map.entry("そば", new BudgetRange(600, 1800)),
      Map.entry("粉もの", new BudgetRange(700, 2500)),
      Map.entry("たこ焼き", new BudgetRange(300, 1200)),
      Map.entry("お好み焼き", new BudgetRange(1000, 2500)),
      Map.entry("焼き鳥", new BudgetRange(1800, 4000)),
      Map.entry("ピザ", new BudgetRange(1200, 3500)),
      Map.entry("ハンバーガー", new BudgetRange(0, 1800)),
      Map.entry("定食", new BudgetRange(700, 1800)),
      Map.entry("串カツ", new BudgetRange(1500, 3500)),
      Map.entry("餃子", new BudgetRange(600, 2000)),
      Map.entry("和食", new BudgetRange(1200, 5000)),
      Map.entry("洋食", new BudgetRange(1000, 3500)),
      Map.entry("イタリアン", new BudgetRange(1500, 4500)),
      Map.entry("中華", new BudgetRange(900, 3500)),
      Map.entry("寿司", new BudgetRange(1800, 8000)),
      Map.entry("海鮮", new BudgetRange(1800, 6000)),
      Map.entry("肉料理", new BudgetRange(1800, 7000)),
      Map.entry("サラダ・野菜", new BudgetRange(800, 2500)),
      Map.entry("スープ", new BudgetRange(700, 2200)),
      Map.entry("スイーツ", new BudgetRange(500, 2200)),
      Map.entry("カフェ", new BudgetRange(500, 2200)),
      Map.entry("パン", new BudgetRange(300, 1600)),
      Map.entry("郷土料理", new BudgetRange(1000, 4500)),
      Map.entry("ファストフード", new BudgetRange(0, 1800)),
      Map.entry("お酒・バー", new BudgetRange(2000, 5500)),
      Map.entry("各国料理", new BudgetRange(1000, 4500)));

  Optional<Restaurant> toRestaurant(JsonNode feature, SearchContext context) {
    JsonNode properties = feature == null ? null : feature.path("properties");
    if (properties == null || properties.isMissingNode() || properties.isNull()) {
      return Optional.empty();
    }

    String name = firstPresent(
        text(properties, "name"),
        text(properties, "name_international"),
        text(properties, "address_line1"));
    if (name == null || name.isBlank()) {
      return Optional.empty();
    }

    Double latitude = firstPresent(
        number(properties, "lat"),
        coordinate(feature, 1));
    Double longitude = firstPresent(
        number(properties, "lon"),
        coordinate(feature, 0));
    if (latitude == null || longitude == null) {
      return Optional.empty();
    }

    String address = firstPresent(
        text(properties, "formatted"),
        text(properties, "address_line2"),
        buildStreetAddress(properties),
        normalizeAreaForDisplay(context.area()));
    List<String> categories = categories(properties);
    if (!matchesRequestedGenre(name, address, categories, context.genre())) {
      return Optional.empty();
    }

    String externalId = externalId(properties, name, latitude, longitude);
    String genre = restaurantGenre(context.genre(), categories, name, address);
    BudgetRange budgetRange = defaultBudgetForGenre(genre, categories, name);

    return Optional.of(new Restaurant(
        restaurantId(externalId),
        PROVIDER,
        externalId,
        name.trim(),
        restaurantArea(context.area(), properties),
        genre,
        budgetRange.min(),
        budgetRange.max(),
        0.0,
        0,
        address,
        null,
        "Geoapify Places APIで補完",
        latitude,
        longitude));
  }

  boolean matchesBudget(Restaurant restaurant, Integer budgetMin, Integer budgetMax) {
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

  boolean isRamenOrNoodleGenre(String genre) {
    String normalized = normalizeText(genre);
    return !normalized.isBlank() && RAMEN_KEYWORDS.stream().anyMatch(normalized::contains);
  }

  boolean isAllGenre(String genre) {
    String normalized = cleanText(genre);
    return normalized == null
        || normalized.isBlank()
        || ALL_GENRES.equals(normalized)
        || "all".equalsIgnoreCase(normalized);
  }

  private boolean matchesRequestedGenre(String name, String address, List<String> categories, String genre) {
    if (isAllGenre(genre)) {
      return true;
    }

    String source = normalizeText(String.join(" ", name, address, String.join(" ", categories)));
    if (isRamenOrNoodleGenre(genre)) {
      return categories.stream().anyMatch(category -> category.contains(".ramen") || category.contains(".noodle"))
          || RAMEN_KEYWORDS.stream().map(this::normalizeText).anyMatch(source::contains);
    }

    String normalizedGenre = normalizeText(genre);
    if (normalizedGenre.contains("和食") || normalizedGenre.contains("日本料理")) {
      return categories.stream().anyMatch(category -> category.contains(".japanese"))
          || JAPANESE_KEYWORDS.stream().map(this::normalizeText).anyMatch(source::contains);
    }

    return true;
  }

  private String restaurantGenre(String requestedGenre, List<String> categories, String name, String address) {
    if (!isAllGenre(requestedGenre)) {
      return requestedGenre.trim();
    }

    String source = normalizeText(String.join(" ", name, address, String.join(" ", categories)));
    if (categories.stream().anyMatch(category -> category.contains(".ramen")) || source.contains("ラーメン") || source.contains("ramen")) {
      return "ラーメン";
    }
    if (categories.stream().anyMatch(category -> category.contains(".noodle")) || source.contains("noodle") || source.contains("麺")) {
      return "麺類";
    }
    if (categories.stream().anyMatch(category -> category.contains(".japanese"))) {
      return "和食";
    }
    return "飲食店";
  }

  private BudgetRange defaultBudgetForGenre(String genre, List<String> categories, String name) {
    BudgetRange requestedBudget = GENRE_BUDGETS.get(genre);
    if (requestedBudget != null) {
      return requestedBudget;
    }
    if (isRamenOrNoodleGenre(genre)
        || categories.stream().anyMatch(category -> category.contains(".ramen") || category.contains(".noodle"))
        || RAMEN_KEYWORDS.stream().map(this::normalizeText).anyMatch(normalizeText(name)::contains)) {
      return new BudgetRange(700, 1500);
    }
    if (categories.stream().anyMatch(category -> category.contains(".cafe") || category.contains("ice_cream"))) {
      return GENRE_BUDGETS.get("カフェ");
    }
    if (categories.stream().anyMatch(category -> category.contains(".burger") || category.contains(".pizza"))) {
      return GENRE_BUDGETS.get("ファストフード");
    }
    return DEFAULT_BUDGET;
  }

  private String restaurantArea(String requestedArea, JsonNode properties) {
    String cleanArea = cleanText(requestedArea);
    if (cleanArea != null && !cleanArea.isBlank() && !ALL_GENRES.equals(cleanArea)) {
      return cleanArea;
    }
    return firstPresent(
        text(properties, "city"),
        text(properties, "district"),
        text(properties, "suburb"),
        text(properties, "state"),
        "現在地周辺");
  }

  private String normalizeAreaForDisplay(String area) {
    String cleanArea = cleanText(area);
    return cleanArea == null || cleanArea.isBlank() ? "現在地周辺" : cleanArea;
  }

  private String externalId(JsonNode properties, String name, Double latitude, Double longitude) {
    String rawExternalId = firstPresent(
        text(properties, "place_id"),
        text(properties.path("datasource").path("raw"), "osm_id"),
        stableHash("%s:%f:%f".formatted(name, latitude, longitude)));
    if (rawExternalId.length() <= MAX_EXTERNAL_ID_LENGTH) {
      return rawExternalId;
    }
    return "geoapify:" + stableHash(rawExternalId);
  }

  private String restaurantId(String externalId) {
    String safeId = externalId.replaceAll("[^A-Za-z0-9._:@-]", "_");
    if (safeId.length() > 90) {
      safeId = stableHash(externalId);
    }
    return "geoapify-" + safeId;
  }

  private List<String> categories(JsonNode properties) {
    JsonNode categoriesNode = properties.path("categories");
    if (!categoriesNode.isArray()) {
      return List.of();
    }
    List<String> categories = new ArrayList<>();
    categoriesNode.forEach(categoryNode -> {
      String category = categoryNode.asText("");
      if (!category.isBlank()) {
        categories.add(category);
      }
    });
    return categories;
  }

  private String buildStreetAddress(JsonNode properties) {
    String street = firstPresent(text(properties, "street"), text(properties, "address_line1"));
    String houseNumber = text(properties, "housenumber");
    String city = text(properties, "city");
    List<String> parts = new ArrayList<>();
    if (city != null) {
      parts.add(city);
    }
    if (street != null) {
      parts.add(street);
    }
    if (houseNumber != null) {
      parts.add(houseNumber);
    }
    return parts.isEmpty() ? null : String.join(" ", parts);
  }

  private String text(JsonNode node, String fieldName) {
    if (node == null || fieldName == null) {
      return null;
    }
    JsonNode value = node.path(fieldName);
    if (value.isMissingNode() || value.isNull()) {
      return null;
    }
    String text = value.asText(null);
    return cleanText(text);
  }

  private Double number(JsonNode node, String fieldName) {
    if (node == null || fieldName == null) {
      return null;
    }
    JsonNode value = node.path(fieldName);
    return value.isNumber() ? value.asDouble() : null;
  }

  private Double coordinate(JsonNode feature, int index) {
    JsonNode coordinates = feature == null ? null : feature.path("geometry").path("coordinates");
    if (coordinates == null || !coordinates.isArray() || coordinates.size() <= index || !coordinates.get(index).isNumber()) {
      return null;
    }
    return coordinates.get(index).asDouble();
  }

  private String cleanText(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isBlank() ? null : trimmed;
  }

  private String normalizeText(String value) {
    String cleanValue = cleanText(value);
    if (cleanValue == null) {
      return "";
    }
    return cleanValue.toLowerCase(Locale.ROOT).replaceAll("\\s+", "");
  }

  @SafeVarargs
  private final <T> T firstPresent(T... values) {
    for (T value : values) {
      if (value instanceof String text && !text.isBlank()) {
        return value;
      }
      if (value != null && !(value instanceof String)) {
        return value;
      }
    }
    return null;
  }

  private String stableHash(String value) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash).substring(0, 24);
    } catch (NoSuchAlgorithmException exception) {
      return Base64.getUrlEncoder().withoutPadding().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    }
  }

  record SearchContext(String area, String genre) {
  }

  private record BudgetRange(int min, int max) {
  }
}
