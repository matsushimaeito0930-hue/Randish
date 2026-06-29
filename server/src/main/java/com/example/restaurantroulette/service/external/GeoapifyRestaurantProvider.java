package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.service.ApiUsageCounter;
import com.example.restaurantroulette.service.external.GeoapifyRestaurantMapper.SearchContext;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.http.MediaType;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@Order(20)
public class GeoapifyRestaurantProvider implements ExternalRestaurantProvider {
  private static final Logger logger = LoggerFactory.getLogger(GeoapifyRestaurantProvider.class);
  private static final String API_URL = "https://api.geoapify.com/v2";
  private static final int API_LIMIT = 100;
  private static final int DEFAULT_RADIUS_METERS = 500;
  private static final int DEFAULT_CACHE_TTL_SECONDS = 600;
  private static final List<String> RAMEN_CATEGORIES = List.of(
      "catering.restaurant.ramen",
      "catering.fast_food.ramen",
      "catering.restaurant.noodle",
      "catering.fast_food.noodle",
      "catering.restaurant.japanese");
  private static final List<String> NOODLE_CATEGORIES = List.of(
      "catering.restaurant.noodle",
      "catering.fast_food.noodle",
      "catering.restaurant.ramen",
      "catering.fast_food.ramen",
      "catering.restaurant.japanese");
  private static final List<String> DEFAULT_CATEGORIES = List.of(
      "catering.restaurant",
      "catering.fast_food",
      "catering.cafe",
      "catering.bar");
  private static final List<String> JAPANESE_CATEGORIES = List.of(
      "catering.restaurant.japanese",
      "catering.restaurant");
  private static final Map<String, List<String>> GENRE_CATEGORIES = Map.ofEntries(
      Map.entry("ラーメン", RAMEN_CATEGORIES),
      Map.entry("うどん", NOODLE_CATEGORIES),
      Map.entry("そば", NOODLE_CATEGORIES),
      Map.entry("焼肉", List.of("catering.restaurant.barbecue", "catering.restaurant.steak_house", "catering.restaurant")),
      Map.entry("居酒屋", List.of("catering.pub", "catering.bar", "catering.restaurant.japanese")),
      Map.entry("韓国料理", List.of("catering.restaurant.korean", "catering.restaurant")),
      Map.entry("カレー", List.of("catering.restaurant.curry", "catering.restaurant.indian", "catering.restaurant")),
      Map.entry("粉もの", JAPANESE_CATEGORIES),
      Map.entry("たこ焼き", JAPANESE_CATEGORIES),
      Map.entry("お好み焼き", JAPANESE_CATEGORIES),
      Map.entry("焼き鳥", List.of("catering.restaurant.chicken", "catering.restaurant.japanese", "catering.restaurant")),
      Map.entry("ピザ", List.of("catering.restaurant.pizza", "catering.fast_food.pizza")),
      Map.entry("ハンバーガー", List.of("catering.fast_food.burger", "catering.restaurant.burger", "catering.fast_food")),
      Map.entry("定食", JAPANESE_CATEGORIES),
      Map.entry("串カツ", JAPANESE_CATEGORIES),
      Map.entry("餃子", List.of("catering.restaurant.dumpling", "catering.restaurant.chinese", "catering.restaurant")),
      Map.entry("和食", JAPANESE_CATEGORIES),
      Map.entry("洋食", List.of("catering.restaurant", "catering.restaurant.steak_house", "catering.restaurant.burger")),
      Map.entry("イタリアン", List.of("catering.restaurant.italian", "catering.restaurant.pizza", "catering.restaurant")),
      Map.entry("中華", List.of("catering.restaurant.chinese", "catering.restaurant.dumpling", "catering.restaurant")),
      Map.entry("寿司", List.of("catering.restaurant.sushi", "catering.restaurant.japanese")),
      Map.entry("海鮮", List.of("catering.restaurant.seafood", "catering.restaurant.fish", "catering.restaurant.japanese")),
      Map.entry("肉料理", List.of("catering.restaurant.steak_house", "catering.restaurant.barbecue", "catering.restaurant")),
      Map.entry("サラダ・野菜", List.of("catering.fast_food.salad", "catering.restaurant", "catering.cafe")),
      Map.entry("スープ", List.of("catering.restaurant.soup", "catering.fast_food.soup", "catering.restaurant")),
      Map.entry("スイーツ", List.of("catering.cafe.dessert", "catering.cafe.cake", "catering.ice_cream", "catering.cafe")),
      Map.entry("カフェ", List.of("catering.cafe", "catering.cafe.coffee_shop", "catering.cafe.cake")),
      Map.entry("パン", List.of("commercial.food_and_drink.bakery", "catering.cafe", "catering.restaurant")),
      Map.entry("郷土料理", JAPANESE_CATEGORIES),
      Map.entry("ファストフード", List.of("catering.fast_food")),
      Map.entry("お酒・バー", List.of("catering.bar", "catering.pub", "catering.taproom")),
      Map.entry("各国料理", List.of(
          "catering.restaurant.international",
          "catering.restaurant.asian",
          "catering.restaurant.thai",
          "catering.restaurant.vietnamese",
          "catering.restaurant.indian",
          "catering.restaurant.mexican",
          "catering.restaurant")));

  private final RestClient restClient;
  private final GeoapifyRestaurantMapper mapper;
  private final String apiKey;
  private final ApiUsageCounter usageCounter = new ApiUsageCounter(
      "geoapify",
      "Geoapify",
      "RANDISH_GEOAPIFY_API_LIMIT");
  private final int cacheTtlSeconds;
  private final ApiUsageCounter usageCounter = new ApiUsageCounter(
      "geoapify",
      "Geoapify",
      "RANDISH_GEOAPIFY_API_LIMIT");
  private final Map<GeoapifyCacheKey, GeoapifyCacheEntry> cache = new ConcurrentHashMap<>();
  private final Map<String, CachedRestaurant> restaurantCacheByExternalId = new ConcurrentHashMap<>();
  private final List<Path> envFiles = List.of(
      Path.of(".env.local"),
      Path.of("..", ".env.local"),
      Path.of("server", ".env.local"),
      Path.of("..", "server", ".env.local"),
      Path.of(".env"),
      Path.of("..", ".env"),
      Path.of("server", ".env"),
      Path.of("..", "server", ".env"));

  public GeoapifyRestaurantProvider(RestClient.Builder restClientBuilder, GeoapifyRestaurantMapper mapper) {
    this.restClient = restClientBuilder.baseUrl(API_URL).build();
    this.mapper = mapper;
    this.apiKey = resolveApiKey();
    this.cacheTtlSeconds = resolveCacheTtlSeconds();
  }

  @Override
  public String providerKey() {
    return GeoapifyRestaurantMapper.PROVIDER;
  }

  @Override
  public boolean isAvailable() {
    return apiKey != null && !apiKey.isBlank();
  }

  @Override
  public List<Restaurant> search(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    if (!isAvailable() || latitude == null || longitude == null) {
      return List.of();
    }

    int radiusMeters = radiusMeters(range);
    List<String> categories = categoriesForGenre(genre);
    SearchContext context = new SearchContext(area, genre);
    GeoapifyCacheKey cacheKey = new GeoapifyCacheKey(
        coordinateKey(latitude),
        coordinateKey(longitude),
        radiusMeters,
        normalizeKeyPart(genre),
        String.join(",", categories));

    List<Restaurant> restaurants = cachedRestaurants(cacheKey)
        .orElseGet(() -> fetchAndCache(cacheKey, context, categories, latitude, longitude, radiusMeters));
    return restaurants.stream()
        .filter(restaurant -> mapper.matchesBudget(restaurant, budgetMin, budgetMax))
        .limit(API_LIMIT)
        .toList();
  }

  @Override
  public Optional<Restaurant> findByExternalId(
      String externalId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    if (externalId == null || externalId.isBlank()) {
      return Optional.empty();
    }

    CachedRestaurant cached = restaurantCacheByExternalId.get(externalId.trim());
    if (cached == null) {
      return Optional.empty();
    }
    long ageSeconds = Duration.between(cached.fetchedAt(), Instant.now()).toSeconds();
    if (ageSeconds > cacheTtlSeconds) {
      restaurantCacheByExternalId.remove(externalId.trim());
      return Optional.empty();
    }
    Restaurant restaurant = cached.restaurant();
    if (!mapper.matchesBudget(restaurant, savedBudgetMin, savedBudgetMax)) {
      return Optional.empty();
    }
    return Optional.of(restaurant);
  }

  @Override
  public List<Restaurant> searchRandomCandidates(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates) {
    if (maxCandidates <= 0) {
      return List.of();
    }
    List<Restaurant> restaurants = new ArrayList<>(search(area, genre, budgetMin, budgetMax, latitude, longitude, range));
    Collections.shuffle(restaurants);
    return restaurants.stream().limit(maxCandidates).toList();
  }

  public Map<String, Object> diagnostics() {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("provider", GeoapifyRestaurantMapper.PROVIDER);
    result.put("available", isAvailable());
    result.put("apiKeyLoaded", isAvailable());
    result.put("cacheTtlSeconds", cacheTtlSeconds);
    result.put("cacheEntries", cache.size());
    return result;
  }

  public Map<String, Object> apiUsage() {
    return usageCounter.snapshot(isAvailable());
  }

  private Optional<List<Restaurant>> cachedRestaurants(GeoapifyCacheKey cacheKey) {
    GeoapifyCacheEntry entry = cache.get(cacheKey);
    if (entry == null) {
      return Optional.empty();
    }
    long ageSeconds = Duration.between(entry.fetchedAt(), Instant.now()).toSeconds();
    if (ageSeconds > cacheTtlSeconds) {
      cache.remove(cacheKey);
      logger.info("[RANDISH_GEOAPIFY] cache expired key={} ageSeconds={}", cacheKey, ageSeconds);
      return Optional.empty();
    }
    logger.info("[RANDISH_GEOAPIFY] cache hit key={} ageSeconds={}", cacheKey, ageSeconds);
    return Optional.of(entry.restaurants());
  }

  private List<Restaurant> fetchAndCache(
      GeoapifyCacheKey cacheKey,
      SearchContext context,
      List<String> categories,
      Double latitude,
      Double longitude,
      int radiusMeters) {
    logger.info("[RANDISH_GEOAPIFY] new places search key={} radiusMeters={} categories={}",
        cacheKey,
        radiusMeters,
        categories);
    List<Restaurant> restaurants = fetch(context, categories, latitude, longitude, radiusMeters);
    GeoapifyCacheEntry entry = new GeoapifyCacheEntry(Instant.now(), List.copyOf(restaurants));
    cache.put(cacheKey, entry);
    restaurants.forEach(restaurant -> restaurantCacheByExternalId.put(
        restaurant.externalId(),
        new CachedRestaurant(restaurant, entry.fetchedAt())));
    return entry.restaurants();
  }

  private List<Restaurant> fetch(
      SearchContext context,
      List<String> categories,
      Double latitude,
      Double longitude,
      int radiusMeters) {
    usageCounter.increment();
    JsonNode response = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .path("/places")
            .queryParam("categories", String.join(",", categories))
            .queryParam("filter", "circle:%s,%s,%d".formatted(formatCoordinate(longitude), formatCoordinate(latitude), radiusMeters))
            .queryParam("limit", API_LIMIT)
            .queryParam("lang", "ja")
            .queryParam("apiKey", apiKey)
            .build())
        .accept(MediaType.APPLICATION_JSON)
        .retrieve()
        .body(JsonNode.class);

    JsonNode features = response == null ? null : response.path("features");
    if (features == null || !features.isArray()) {
      return List.of();
    }

    Map<String, Restaurant> restaurantsById = new LinkedHashMap<>();
    features.forEach(feature -> mapper.toRestaurant(feature, context)
        .ifPresent(restaurant -> restaurantsById.putIfAbsent(restaurant.id(), restaurant)));
    return List.copyOf(restaurantsById.values());
  }

  private List<String> categoriesForGenre(String genre) {
    if (mapper.isRamenOrNoodleGenre(genre)) {
      return RAMEN_CATEGORIES;
    }
    String normalizedGenre = genre == null ? "" : genre.trim();
    List<String> mappedCategories = GENRE_CATEGORIES.get(normalizedGenre);
    if (mappedCategories != null) {
      return mappedCategories;
    }
    String normalizedSearchGenre = normalizedGenre.toLowerCase(Locale.ROOT);
    if (normalizedSearchGenre.contains("和食") || normalizedSearchGenre.contains("日本料理") || normalizedSearchGenre.contains("japanese")) {
      return JAPANESE_CATEGORIES;
    }
    return DEFAULT_CATEGORIES;
  }

  private int radiusMeters(Integer range) {
    if (range == null) {
      return DEFAULT_RADIUS_METERS;
    }
    return switch (range) {
      case 1 -> 300;
      case 2 -> 500;
      case 4 -> 2000;
      case 5 -> 3000;
      default -> 1000;
    };
  }

  private String coordinateKey(Double coordinate) {
    return formatCoordinate(coordinate);
  }

  private String formatCoordinate(Double coordinate) {
    return String.format(Locale.ROOT, "%.5f", coordinate);
  }

  private String normalizeKeyPart(String value) {
    return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
  }

  private String resolveApiKey() {
    String envValue = System.getenv("GEOAPIFY_API_KEY");
    if (envValue != null && !envValue.isBlank()) {
      return trimValue(envValue);
    }
    for (Path path : envFiles) {
      Optional<String> fileValue = readConfigValueFromFile(path, "GEOAPIFY_API_KEY");
      if (fileValue.isPresent()) {
        return fileValue.get();
      }
    }
    return "";
  }

  private int resolveCacheTtlSeconds() {
    return readConfigValue("GEOAPIFY_CACHE_TTL_SECONDS")
        .or(() -> readConfigValue("PLACES_CACHE_TTL_SECONDS"))
        .flatMap(this::parsePositiveInt)
        .map(value -> Math.max(30, value))
        .orElse(DEFAULT_CACHE_TTL_SECONDS);
  }

  private Optional<String> readConfigValue(String key) {
    String envValue = System.getenv(key);
    if (envValue != null && !envValue.isBlank()) {
      return Optional.of(trimValue(envValue));
    }
    for (Path path : envFiles) {
      Optional<String> fileValue = readConfigValueFromFile(path, key);
      if (fileValue.isPresent()) {
        return fileValue;
      }
    }
    return Optional.empty();
  }

  private Optional<String> readConfigValueFromFile(Path path, String key) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }
    try {
      return Files.readAllLines(path, StandardCharsets.UTF_8).stream()
          .map(String::trim)
          .filter(line -> !line.isBlank())
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.startsWith(key + "="))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(this::trimValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      logger.warn("Failed to read Geoapify config from {}", path, exception);
      return Optional.empty();
    }
  }

  private Optional<Integer> parsePositiveInt(String value) {
    try {
      int parsed = Integer.parseInt(trimValue(value));
      return parsed > 0 ? Optional.of(parsed) : Optional.empty();
    } catch (NumberFormatException exception) {
      return Optional.empty();
    }
  }

  private String trimValue(String value) {
    return value.trim().replaceAll("^['\"]|['\"]$", "");
  }

  private record GeoapifyCacheKey(
      String latitude,
      String longitude,
      int radiusMeters,
      String genre,
      String categories) {
  }

  private record GeoapifyCacheEntry(Instant fetchedAt, List<Restaurant> restaurants) {
  }

  private record CachedRestaurant(Restaurant restaurant, Instant fetchedAt) {
  }
}
