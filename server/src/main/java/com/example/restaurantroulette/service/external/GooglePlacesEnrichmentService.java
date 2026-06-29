package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.dto.ApiDtos.CandidatePlaceResponse;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
@Order(100)
public class GooglePlacesEnrichmentService implements ExternalRestaurantProvider {
  private static final Logger logger = LoggerFactory.getLogger(GooglePlacesEnrichmentService.class);
  private static final String API_URL = "https://places.googleapis.com/v1";
  private static final String ALL_GENRES = "すべて";
  private static final String FIELD_MASK = String.join(",",
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.types",
      "places.priceLevel",
      "places.photos.name",
      "places.googleMapsUri",
      "places.currentOpeningHours.openNow",
      "places.currentOpeningHours.nextOpenTime",
      "places.currentOpeningHours.nextCloseTime");
  private static final String NEARBY_FIELD_MASK = String.join(",",
      "places.id",
      "places.displayName",
      "places.formattedAddress",
      "places.location",
      "places.rating",
      "places.types",
      "places.priceLevel",
      "places.googleMapsUri",
      "places.currentOpeningHours.openNow");
  private static final String DETAIL_FIELD_MASK = String.join(",",
      "id",
      "displayName",
      "formattedAddress",
      "location",
      "rating",
      "types",
      "priceLevel",
      "photos.name",
      "googleMapsUri",
      "currentOpeningHours.openNow",
      "currentOpeningHours.nextOpenTime",
      "currentOpeningHours.nextCloseTime");
  private static final int GOOGLE_RESULT_COUNT_PER_KEYWORD = 20;
  private static final int RANDOM_ALL_GENRE_KEYWORD_COUNT = 5;
  private static final int RANDOM_GENRE_KEYWORD_COUNT = 3;
  private static final int DEFAULT_SESSION_REQUEST_LIMIT = 30;
  private static final int MAX_PHOTO_NAME_LENGTH = 500;
  private static final Pattern GOOGLE_PHOTO_NAME_PATTERN = Pattern.compile("places/[^/?#\\s]+/photos/[^/?#\\s]+");
  private static final List<String> ALL_GENRE_KEYWORDS = List.of(
      "飲食店",
      "レストラン",
      "ランチ",
      "ディナー",
      "居酒屋",
      "カフェ",
      "ラーメン店",
      "焼肉店",
      "和食店",
      "中華料理",
      "イタリアン",
      "寿司店",
      "そば店",
      "カレー店",
      "定食屋",
      "スイーツ店",
      "バー");
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
      Map.entry("その他", DEFAULT_BUDGET),
      Map.entry("ファストフード", new BudgetRange(0, 1800)),
      Map.entry("お酒・バー", new BudgetRange(2000, 5500)),
      Map.entry("各国料理", new BudgetRange(1000, 4500)));
  private static final Map<String, List<String>> GENRE_KEYWORDS = Map.ofEntries(
      Map.entry("ラーメン", List.of("ラーメン店", "らーめん", "つけ麺")),
      Map.entry("焼肉", List.of("焼肉店", "ホルモン", "ジンギスカン")),
      Map.entry("居酒屋", List.of("居酒屋", "酒場", "炉端")),
      Map.entry("韓国料理", List.of("韓国料理", "サムギョプサル", "韓国レストラン")),
      Map.entry("カレー", List.of("カレー店", "スパイスカレー", "インドカレー")),
      Map.entry("うどん", List.of("うどん店", "讃岐うどん")),
      Map.entry("そば", List.of("そば店", "蕎麦")),
      Map.entry("粉もの", List.of("お好み焼き店", "たこ焼き店", "もんじゃ")),
      Map.entry("たこ焼き", List.of("たこ焼き店")),
      Map.entry("お好み焼き", List.of("お好み焼き店", "もんじゃ")),
      Map.entry("焼き鳥", List.of("焼き鳥店", "焼鳥")),
      Map.entry("ピザ", List.of("ピザ店", "ピッツァ", "イタリアン ピザ")),
      Map.entry("ハンバーガー", List.of("ハンバーガー", "バーガー", "マクドナルド", "モスバーガー", "バーガーキング")),
      Map.entry("定食", List.of("定食屋", "食堂", "ごはん屋")),
      Map.entry("串カツ", List.of("串カツ", "串かつ")),
      Map.entry("餃子", List.of("餃子店", "ぎょうざ")),
      Map.entry("和食", List.of("和食店", "日本料理", "定食")),
      Map.entry("洋食", List.of("洋食店", "ハンバーグ", "オムライス")),
      Map.entry("イタリアン", List.of("イタリアン", "パスタ", "トラットリア")),
      Map.entry("中華", List.of("中華料理", "中国料理", "町中華")),
      Map.entry("寿司", List.of("寿司店", "鮨", "すし")),
      Map.entry("海鮮", List.of("海鮮料理", "魚介料理", "刺身")),
      Map.entry("肉料理", List.of("肉料理", "ステーキ", "ハンバーグ")),
      Map.entry("サラダ・野菜", List.of("野菜料理", "サラダ", "ベジタリアン")),
      Map.entry("スープ", List.of("スープ", "スープカレー", "鍋")),
      Map.entry("スイーツ", List.of("スイーツ店", "ケーキ", "パフェ")),
      Map.entry("カフェ", List.of("カフェ", "喫茶店")),
      Map.entry("パン", List.of("パン屋", "ベーカリー")),
      Map.entry("郷土料理", List.of("郷土料理", "ご当地グルメ", "名物料理")),
      Map.entry("その他", List.of("飲食店", "レストラン")),
      Map.entry("ファストフード", List.of("マクドナルド", "モスバーガー", "ケンタッキー", "KFC", "ロッテリア", "バーガーキング", "フレッシュネスバーガー", "サブウェイ", "ハンバーガー")),
      Map.entry("お酒・バー", List.of("バー", "ダイニングバー", "ワインバー")),
      Map.entry("各国料理", List.of("エスニック料理", "タイ料理", "ベトナム料理", "メキシコ料理", "スペイン料理")));

  private final RestClient restClient;
  private final String apiKey;
  private final boolean enabled;
  private final int sessionRequestLimit;
  private final AtomicInteger sessionRequestCount = new AtomicInteger();
  private final List<Path> envFiles = List.of(
      Path.of(".env.local"),
      Path.of("..", ".env.local"),
      Path.of("mobile", ".env.local"),
      Path.of("..", "mobile", ".env.local"),
      Path.of(".env.loical"),
      Path.of("..", ".env.loical"),
      Path.of("mobile", ".env.loical"),
      Path.of("..", "mobile", ".env.loical"),
      Path.of(".env"),
      Path.of("..", ".env"),
      Path.of("mobile", ".env"),
      Path.of("..", "mobile", ".env"));

  public GooglePlacesEnrichmentService(RestClient.Builder restClientBuilder) {
    this.restClient = restClientBuilder.baseUrl(API_URL).build();
    this.apiKey = resolveApiKey();
    this.enabled = resolveEnabled();
    this.sessionRequestLimit = resolveSessionRequestLimit();
  }

  @Override
  public String providerKey() {
    return "GOOGLE_PLACES";
  }

  @Override
  public boolean isAvailable() {
    return enabled && apiKey != null && !apiKey.isBlank() && sessionRequestCount.get() < sessionRequestLimit;
  }

  @Override
  public boolean isFallback() {
    return true;
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
    if (!isAvailable()) {
      return List.of();
    }

    String normalizedGenre = normalizeGenre(genre);
    if (!supportsFallbackGenre(normalizedGenre)) {
      return List.of();
    }

    boolean hasArea = hasExplicitArea(area);
    if (!hasArea && (latitude == null || longitude == null)) {
      return List.of();
    }

    Map<String, Restaurant> restaurants = new LinkedHashMap<>();
    for (String keyword : fallbackKeywords(normalizedGenre)) {
      String textQuery = hasArea ? "%s %s".formatted(keyword, area.trim()) : keyword;
      GooglePlacesTextSearchResponse response = searchText(
          textQuery,
          GOOGLE_RESULT_COUNT_PER_KEYWORD,
          hasArea ? null : latitude,
          hasArea ? null : longitude,
          range);
      if (response == null || response.places() == null) {
        continue;
      }

      for (GooglePlace place : response.places()) {
        toRestaurant(place, area, restaurantGenre(normalizedGenre, keyword), budgetMin, budgetMax)
            .ifPresent(restaurant -> restaurants.putIfAbsent(restaurant.id(), restaurant));
      }
    }

    return List.copyOf(restaurants.values());
  }

  @Override
  public Optional<Restaurant> findByExternalId(
      String externalId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    if (!isAvailable() || externalId == null || externalId.isBlank()) {
      return Optional.empty();
    }
    try {
      if (!reserveGoogleRequests(1, "place details")) {
        return Optional.empty();
      }
      GooglePlace place = restClient.get()
          .uri("/places/{placeId}", externalId.trim())
          .header("X-Goog-Api-Key", apiKey)
          .header("X-Goog-FieldMask", DETAIL_FIELD_MASK)
          .retrieve()
          .body(GooglePlace.class);
      return toRestaurant(place, savedArea, normalizeGenre(savedGenre), savedBudgetMin, savedBudgetMax);
    } catch (RuntimeException exception) {
      logger.warn("Google Places detail fetch failed: {}", externalId, exception);
      return Optional.empty();
    }
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
    if (!isAvailable() || maxCandidates <= 0) {
      return List.of();
    }

    String normalizedGenre = normalizeGenre(genre);
    List<String> keywords = new ArrayList<>(fallbackKeywords(normalizedGenre));
    Collections.shuffle(keywords);
    int keywordLimit = normalizedGenre.isBlank() || ALL_GENRES.equals(normalizedGenre)
        ? RANDOM_ALL_GENRE_KEYWORD_COUNT
        : RANDOM_GENRE_KEYWORD_COUNT;
    return searchKeywords(
        area,
        normalizedGenre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        keywords.stream().limit(keywordLimit).toList()).stream()
        .limit(maxCandidates)
        .toList();
  }

  public List<CandidatePlaceResponse> searchNearbyCandidates(NearbyPlacesRequest request, int maxCandidates) {
    if (!isAvailable() || maxCandidates <= 0) {
      return List.of();
    }

    int radiusMeters = request.radius() == null ? 1500 : request.radius();
    int maxResultCount = Math.max(1, Math.min(maxCandidates, GOOGLE_RESULT_COUNT_PER_KEYWORD));
    if (!reserveGoogleRequests(1, "nearby roulette search")) {
      return List.of();
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("textQuery", buildNearbyTextQuery(request.category()));
    body.put("languageCode", "ja");
    body.put("regionCode", "JP");
    body.put("maxResultCount", maxResultCount);
    body.put("locationBias", Map.of(
        "circle", Map.of(
            "center", Map.of("latitude", request.latitude(), "longitude", request.longitude()),
            "radius", radiusMeters)));

    GooglePlacesTextSearchResponse response = restClient.post()
        .uri("/places:searchText")
        .header("X-Goog-Api-Key", apiKey)
        .header("X-Goog-FieldMask", NEARBY_FIELD_MASK)
        .body(body)
        .retrieve()
        .body(GooglePlacesTextSearchResponse.class);

    if (response == null || response.places() == null) {
      return List.of();
    }

    return response.places().stream()
        .map(place -> toCandidatePlace(place, request))
        .filter(Optional::isPresent)
        .map(Optional::get)
        .filter(candidate -> candidate.distanceMeters() == null || candidate.distanceMeters() <= radiusMeters)
        .filter(candidate -> matchesNearbyOpenNow(candidate, request.openNow()))
        .filter(candidate -> matchesNearbyPrice(candidate.priceLevel(), request.priceRange()))
        .limit(maxResultCount)
        .toList();
  }

  public RestaurantResponse enrich(RestaurantResponse restaurant) {
    if (!isAvailable()) {
      return restaurant;
    }

    try {
      if (!reserveGoogleRequests(1, "restaurant enrichment")) {
        return restaurant;
      }
      GooglePlacesTextSearchResponse response = restClient.post()
          .uri("/places:searchText")
          .header("X-Goog-Api-Key", apiKey)
          .header("X-Goog-FieldMask", FIELD_MASK)
          .body(Map.of(
              "textQuery", "%s %s".formatted(restaurant.name(), restaurant.address()),
              "languageCode", "ja",
              "regionCode", "JP",
              "maxResultCount", 1))
          .retrieve()
          .body(GooglePlacesTextSearchResponse.class);

      GooglePlace place = response == null || response.places() == null || response.places().isEmpty()
          ? null
          : response.places().getFirst();
      if (place == null) {
        return restaurant;
      }

      return new RestaurantResponse(
          restaurant.id(),
          restaurant.externalProvider(),
          restaurant.externalId(),
          restaurant.name(),
          restaurant.area(),
          restaurant.genre(),
          restaurant.budgetMin(),
          restaurant.budgetMax(),
          place.rating() == null ? restaurant.rating() : place.rating(),
          restaurant.minutes(),
          place.formattedAddress() == null ? restaurant.address() : place.formattedAddress(),
          restaurant.photoUrl() == null ? googlePhotoUrl(place) : restaurant.photoUrl(),
          restaurant.note(),
          place.location() == null || place.location().latitude() == null ? restaurant.latitude() : place.location().latitude(),
          place.location() == null || place.location().longitude() == null ? restaurant.longitude() : place.location().longitude(),
          place.rating(),
          place.googleMapsUri(),
          place.currentOpeningHours() == null ? null : place.currentOpeningHours().openNow(),
          place.currentOpeningHours() == null ? null : place.currentOpeningHours().nextOpenTime(),
          place.currentOpeningHours() == null ? null : place.currentOpeningHours().nextCloseTime(),
          place.id());
    } catch (RuntimeException exception) {
      logger.warn("Google Places enrichment failed for restaurant: {}", restaurant.name(), exception);
      return restaurant;
    }
  }

  public Map<String, Object> diagnostics() {
    Map<String, Object> result = new LinkedHashMap<>();
    boolean apiKeyConfigured = apiKey != null && !apiKey.isBlank();
    result.put("provider", "GOOGLE_PLACES");
    result.put("enabled", enabled);
    result.put("available", isAvailable());
    result.put("apiKeyConfigured", apiKeyConfigured);
    result.put("apiKeyLoaded", apiKeyConfigured);
    result.put("sessionRequestLimit", sessionRequestLimit);
    result.put("sessionRequestCount", sessionRequestCount.get());
    result.put("sessionRequestsRemaining", Math.max(0, sessionRequestLimit - sessionRequestCount.get()));
    return result;
  }

  public Map<String, Object> apiUsage() {
    int used = sessionRequestCount.get();
    int limit = Math.max(1, resolveApiUsageLimit());
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("key", "google_places");
    result.put("name", "Google Places");
    result.put("used", used);
    result.put("limit", limit);
    result.put("remaining", Math.max(0, limit - used));
    result.put("display", used + "/" + limit);
    result.put("available", isAvailable());
    return result;
  }

  public ResponseEntity<byte[]> fetchPhoto(String photoName) {
    if (!isAvailable() || !isSafePhotoName(photoName)) {
      return ResponseEntity.notFound().build();
    }

    try {
      if (!reserveGoogleRequests(2, "photo fetch")) {
        return ResponseEntity.notFound().build();
      }
      URI mediaInfoUri = URI.create("%s/%s/media?maxWidthPx=1200&maxHeightPx=900&skipHttpRedirect=true&key=%s"
          .formatted(API_URL, photoName, URLEncoder.encode(apiKey, StandardCharsets.UTF_8)));
      GooglePhotoMediaResponse media = restClient.get()
          .uri(mediaInfoUri)
          .retrieve()
          .body(GooglePhotoMediaResponse.class);
      if (media == null || media.photoUri() == null || media.photoUri().isBlank()) {
        return ResponseEntity.notFound().build();
      }

      ResponseEntity<byte[]> image = restClient.get()
          .uri(URI.create(media.photoUri()))
          .retrieve()
          .toEntity(byte[].class);
      MediaType contentType = image.getHeaders().getContentType();
      return ResponseEntity.ok()
          .contentType(contentType == null ? MediaType.IMAGE_JPEG : contentType)
          .body(image.getBody());
    } catch (RuntimeException exception) {
      logger.warn("Google Places photo fetch failed: {}", photoName, exception);
      return ResponseEntity.notFound().build();
    }
  }

  private GooglePlacesTextSearchResponse searchText(
      String textQuery,
      int maxResultCount,
      Double latitude,
      Double longitude,
      Integer range) {
    if (!reserveGoogleRequests(1, "text search")) {
      return null;
    }

    Map<String, Object> body = new LinkedHashMap<>();
    body.put("textQuery", textQuery);
    body.put("languageCode", "ja");
    body.put("regionCode", "JP");
    body.put("maxResultCount", maxResultCount);

    if (latitude != null && longitude != null) {
      body.put("locationBias", Map.of(
          "circle", Map.of(
              "center", Map.of("latitude", latitude, "longitude", longitude),
              "radius", googleRadiusMeters(range))));
    }

    return restClient.post()
        .uri("/places:searchText")
        .header("X-Goog-Api-Key", apiKey)
        .header("X-Goog-FieldMask", FIELD_MASK)
        .body(body)
        .retrieve()
        .body(GooglePlacesTextSearchResponse.class);
  }

  private List<Restaurant> searchKeywords(
      String area,
      String normalizedGenre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      List<String> keywords) {
    if (!supportsFallbackGenre(normalizedGenre)) {
      return List.of();
    }

    boolean hasArea = hasExplicitArea(area);
    if (!hasArea && (latitude == null || longitude == null)) {
      return List.of();
    }

    Map<String, Restaurant> restaurants = new LinkedHashMap<>();
    for (String keyword : keywords) {
      String textQuery = hasArea ? "%s %s".formatted(keyword, area.trim()) : keyword;
      GooglePlacesTextSearchResponse response = searchText(
          textQuery,
          GOOGLE_RESULT_COUNT_PER_KEYWORD,
          hasArea ? null : latitude,
          hasArea ? null : longitude,
          range);
      if (response == null || response.places() == null) {
        continue;
      }

      for (GooglePlace place : response.places()) {
        toRestaurant(place, area, restaurantGenre(normalizedGenre, keyword), budgetMin, budgetMax)
            .ifPresent(restaurant -> restaurants.putIfAbsent(restaurant.id(), restaurant));
      }
    }

    return List.copyOf(restaurants.values());
  }

  private Optional<CandidatePlaceResponse> toCandidatePlace(GooglePlace place, NearbyPlacesRequest request) {
    if (place == null || place.id() == null || place.id().isBlank() || place.location() == null) {
      return Optional.empty();
    }
    String name = place.displayName() == null ? null : place.displayName().text();
    if (name == null || name.isBlank() || place.location().latitude() == null || place.location().longitude() == null) {
      return Optional.empty();
    }
    Integer distanceMeters = distanceMeters(
        request.latitude(),
        request.longitude(),
        place.location().latitude(),
        place.location().longitude());
    return Optional.of(new CandidatePlaceResponse(
        place.id(),
        name,
        place.location().latitude(),
        place.location().longitude(),
        candidateCategories(request.category(), place.types()),
        place.rating(),
        toCandidatePriceLevel(place.priceLevel()),
        place.currentOpeningHours() == null ? null : place.currentOpeningHours().openNow(),
        place.formattedAddress(),
        distanceMeters,
        place.googleMapsUri()));
  }

  private String buildNearbyTextQuery(String category) {
    String normalizedCategory = normalizeGenre(category);
    if (normalizedCategory.isBlank() || ALL_GENRES.equals(normalizedCategory)) {
      return "飲食店 レストラン";
    }
    return normalizedCategory + " 飲食店";
  }

  private List<String> candidateCategories(String requestedCategory, List<String> placeTypes) {
    List<String> categories = new ArrayList<>();
    String normalizedCategory = normalizeGenre(requestedCategory);
    if (!normalizedCategory.isBlank() && !ALL_GENRES.equals(normalizedCategory)) {
      categories.add(normalizedCategory);
    }
    if (placeTypes != null) {
      placeTypes.stream()
          .filter(type -> type != null && !type.isBlank())
          .limit(4)
          .forEach(categories::add);
    }
    return categories.stream().distinct().toList();
  }

  private boolean matchesNearbyOpenNow(CandidatePlaceResponse candidate, Boolean openNow) {
    return !Boolean.TRUE.equals(openNow) || Boolean.TRUE.equals(candidate.openNow());
  }

  private boolean matchesNearbyPrice(Integer priceLevel, String priceRange) {
    List<Integer> allowedLevels = allowedPriceLevels(priceRange);
    return allowedLevels.isEmpty() || priceLevel == null || allowedLevels.contains(priceLevel);
  }

  private List<Integer> allowedPriceLevels(String priceRange) {
    if (priceRange == null || priceRange.isBlank()) {
      return List.of();
    }
    String normalized = priceRange.trim().toLowerCase(Locale.ROOT);
    if (normalized.matches("\\d+")) {
      int yen = Integer.parseInt(normalized);
      if (yen <= 1000) {
        return List.of(0, 1);
      }
      if (yen <= 3000) {
        return List.of(0, 1, 2);
      }
      if (yen <= 6000) {
        return List.of(0, 1, 2, 3);
      }
      return List.of();
    }
    if (normalized.contains("cheap") || normalized.contains("inexpensive") || normalized.contains("安")) {
      return List.of(0, 1);
    }
    if (normalized.contains("moderate") || normalized.contains("mid") || normalized.contains("普通")) {
      return List.of(1, 2);
    }
    if (normalized.contains("expensive") || normalized.contains("high") || normalized.contains("高")) {
      return List.of(3, 4);
    }
    return normalized.chars()
        .filter(Character::isDigit)
        .map(Character::getNumericValue)
        .filter(value -> value >= 0 && value <= 4)
        .boxed()
        .distinct()
        .toList();
  }

  private Integer toCandidatePriceLevel(String priceLevel) {
    if (priceLevel == null || priceLevel.isBlank()) {
      return null;
    }
    return switch (priceLevel.trim().toUpperCase(Locale.ROOT)) {
      case "PRICE_LEVEL_FREE" -> 0;
      case "PRICE_LEVEL_INEXPENSIVE" -> 1;
      case "PRICE_LEVEL_MODERATE" -> 2;
      case "PRICE_LEVEL_EXPENSIVE" -> 3;
      case "PRICE_LEVEL_VERY_EXPENSIVE" -> 4;
      default -> null;
    };
  }

  private Integer distanceMeters(Double fromLatitude, Double fromLongitude, Double toLatitude, Double toLongitude) {
    if (fromLatitude == null || fromLongitude == null || toLatitude == null || toLongitude == null) {
      return null;
    }
    double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(toLatitude - fromLatitude);
    double longitudeDelta = Math.toRadians(toLongitude - fromLongitude);
    double fromLatitudeRad = Math.toRadians(fromLatitude);
    double toLatitudeRad = Math.toRadians(toLatitude);
    double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad)
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return (int) Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }

  private Optional<Restaurant> toRestaurant(
      GooglePlace place,
      String requestedArea,
      String requestedGenre,
      Integer budgetMin,
      Integer budgetMax) {
    if (place == null || place.id() == null || place.id().isBlank()) {
      return Optional.empty();
    }

    String name = place.displayName() == null ? null : place.displayName().text();
    if (name == null || name.isBlank()) {
      return Optional.empty();
    }

    String address = place.formattedAddress() == null || place.formattedAddress().isBlank()
        ? normalizeAreaForDisplay(requestedArea)
        : place.formattedAddress();
    if (!matchesFallbackRestaurant(name, address, requestedGenre, place.types())) {
      return Optional.empty();
    }

    BudgetRange defaultBudget = defaultBudgetForGenre(requestedGenre);
    if (!budgetMatches(defaultBudget, budgetMin, budgetMax)) {
      return Optional.empty();
    }

    return Optional.of(new Restaurant(
        "google-places-" + place.id().replaceAll("[^A-Za-z0-9_-]", "_"),
        "GOOGLE_PLACES",
        place.id(),
        name,
        normalizeAreaForDisplay(requestedArea),
        requestedGenre,
        defaultBudget.min(),
        defaultBudget.max(),
        place.rating() == null ? 0.0 : place.rating(),
        0,
        address,
        googlePhotoUrl(place),
        "Google Placesで補完",
        place.location() == null ? null : place.location().latitude(),
        place.location() == null ? null : place.location().longitude()));
  }

  private boolean supportsFallbackGenre(String genre) {
    return genre.isBlank() || ALL_GENRES.equals(genre) || GENRE_KEYWORDS.containsKey(genre);
  }

  private String normalizeGenre(String genre) {
    return genre == null ? "" : genre.trim();
  }

  private List<String> fallbackKeywords(String genre) {
    if (genre.isBlank() || ALL_GENRES.equals(genre)) {
      return ALL_GENRE_KEYWORDS;
    }
    return GENRE_KEYWORDS.getOrDefault(genre, List.of(genre));
  }

  private boolean budgetMatches(BudgetRange budget, Integer budgetMin, Integer budgetMax) {
    if (budgetMin == null && budgetMax == null) {
      return true;
    }
    if (budgetMin == null || budgetMin <= 0) {
      return budgetMax == null || budget.min() <= budgetMax;
    }
    int averageBudget = (budget.min() + budget.max()) / 2;
    return averageBudget >= budgetMin
        && (budgetMax == null || averageBudget <= budgetMax);
  }

  private boolean matchesFallbackRestaurant(String name, String address, String genre, List<String> types) {
    if (!matchesFoodPlace(types)) {
      return false;
    }
    if (!requiresStrictNameMatch(genre)) {
      return true;
    }

    String source = "%s %s".formatted(name, address).toLowerCase(Locale.ROOT);
    return List.of("マクドナルド", "マクド", "マック", "モスバーガー", "ケンタッキー", "kfc", "ロッテリア", "バーガーキング",
        "フレッシュネス", "サブウェイ", "ドムドム", "ハンバーガー", "バーガー", "burger")
        .stream()
        .anyMatch(keyword -> source.contains(keyword.toLowerCase(Locale.ROOT)));
  }

  private boolean matchesFoodPlace(List<String> types) {
    if (types == null || types.isEmpty()) {
      return true;
    }
    return types.stream().anyMatch(type -> List.of(
        "restaurant",
        "food",
        "cafe",
        "bar",
        "bakery",
        "meal_takeaway",
        "meal_delivery").contains(type));
  }

  private boolean requiresStrictNameMatch(String genre) {
    return "ファストフード".equals(genre) || "ハンバーガー".equals(genre);
  }

  private BudgetRange defaultBudgetForGenre(String genre) {
    return GENRE_BUDGETS.getOrDefault(genre, DEFAULT_BUDGET);
  }

  private String googlePhotoUrl(GooglePlace place) {
    if (place == null || place.photos() == null || place.photos().isEmpty()) {
      return null;
    }
    String photoName = place.photos().getFirst().name();
    if (photoName == null || photoName.isBlank()) {
      return null;
    }
    return "/api/google-places/photos?name=" + URLEncoder.encode(photoName, StandardCharsets.UTF_8);
  }

  private String restaurantGenre(String requestedGenre, String keyword) {
    if (!requestedGenre.isBlank() && !ALL_GENRES.equals(requestedGenre)) {
      return requestedGenre;
    }
    return GENRE_KEYWORDS.entrySet().stream()
        .filter(entry -> entry.getValue().contains(keyword))
        .map(Map.Entry::getKey)
        .findFirst()
        .orElse(ALL_GENRES);
  }

  private boolean hasExplicitArea(String area) {
    return area != null
        && !area.isBlank()
        && !area.equals("現在地")
        && !area.equals("迴ｾ蝨ｨ蝨ｰ");
  }

  private boolean isSafePhotoName(String photoName) {
    if (photoName == null || photoName.isBlank() || photoName.length() > MAX_PHOTO_NAME_LENGTH) {
      return false;
    }
    return GOOGLE_PHOTO_NAME_PATTERN.matcher(photoName).matches();
  }

  private String normalizeAreaForDisplay(String area) {
    return hasExplicitArea(area) ? area.trim() : "現在地";
  }

  private int googleRadiusMeters(Integer range) {
    return switch (range == null ? 3 : range) {
      case 1 -> 300;
      case 2 -> 500;
      case 4 -> 2000;
      case 5 -> 3000;
      default -> 1000;
    };
  }

  private String resolveApiKey() {
    String envValue = System.getenv("GOOGLE_PLACES_API_KEY");
    if (envValue != null && !envValue.isBlank()) {
      return trimValue(envValue);
    }

    for (Path path : envFiles) {
      Optional<String> fileValue = readApiKeyFromFile(path);
      if (fileValue.isPresent()) {
        return fileValue.get();
      }
    }
    return "";
  }

  private boolean resolveEnabled() {
    Optional<String> configured = readConfigValue("RANDISH_GOOGLE_PLACES_ENABLED")
        .or(() -> readConfigValue("GOOGLE_PLACES_ENABLED"))
        .map(this::trimLower);
    if (configured.isEmpty()) {
      return false;
    }
    if (configured.get().equals("auto")) {
      return resolveEnableAfter().map(Instant.now()::isAfter).orElse(false);
    }
    return isTruthy(configured.get());
  }

  private int resolveSessionRequestLimit() {
    return readConfigValue("RANDISH_GOOGLE_PLACES_SESSION_LIMIT")
        .or(() -> readConfigValue("GOOGLE_PLACES_SESSION_LIMIT"))
        .flatMap(this::parsePositiveInt)
        .orElse(DEFAULT_SESSION_REQUEST_LIMIT);
  }

  private int resolveApiUsageLimit() {
    return readConfigValue("RANDISH_GOOGLE_PLACES_API_LIMIT")
        .or(() -> readConfigValue("GOOGLE_PLACES_API_LIMIT"))
        .flatMap(this::parsePositiveInt)
        .orElse(sessionRequestLimit);
  }

  private boolean reserveGoogleRequests(int count, String reason) {
    if (!enabled || apiKey == null || apiKey.isBlank() || count <= 0) {
      return false;
    }

    while (true) {
      int current = sessionRequestCount.get();
      int next = current + count;
      if (next > sessionRequestLimit) {
        logger.warn("Google Places request blocked for {}. sessionRequestCount={}, requested={}, sessionRequestLimit={}",
            reason, current, count, sessionRequestLimit);
        return false;
      }
      if (sessionRequestCount.compareAndSet(current, next)) {
        return true;
      }
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

  private Optional<Instant> resolveEnableAfter() {
    return readConfigValue("RANDISH_GOOGLE_PLACES_ENABLE_AFTER")
        .or(() -> readConfigValue("GOOGLE_PLACES_ENABLE_AFTER"))
        .flatMap(this::parseInstant);
  }

  private Optional<Instant> parseInstant(String value) {
    String normalized = trimValue(value);
    if (normalized.isBlank()) {
      return Optional.empty();
    }
    try {
      return Optional.of(OffsetDateTime.parse(normalized).toInstant());
    } catch (DateTimeParseException ignored) {
      try {
        return Optional.of(Instant.parse(normalized));
      } catch (DateTimeParseException exception) {
        return Optional.empty();
      }
    }
  }

  private String trimLower(String value) {
    return trimValue(value).toLowerCase(Locale.ROOT);
  }

  private boolean isTruthy(String value) {
    String normalized = trimLower(value);
    return normalized.equals("true") || normalized.equals("1") || normalized.equals("yes") || normalized.equals("on");
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

  private Optional<String> readApiKeyFromFile(Path path) {
    return readConfigValueFromFile(path, "GOOGLE_PLACES_API_KEY");
  }

  private Optional<String> readConfigValueFromFile(Path path, String key) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }

    try {
      return Files.readAllLines(path).stream()
          .map(String::trim)
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.startsWith(key + "="))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(this::trimValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException exception) {
      logger.warn("Failed to read Google Places config from {}", path, exception);
      return Optional.empty();
    }
  }

  private String trimValue(String value) {
    return value.trim().replaceAll("^['\"]|['\"]$", "");
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePlacesTextSearchResponse(List<GooglePlace> places) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePlace(
      String id,
      GoogleDisplayName displayName,
      @JsonProperty("formattedAddress") String formattedAddress,
      GoogleLocation location,
      Double rating,
      List<String> types,
      String priceLevel,
      List<GooglePhoto> photos,
      String googleMapsUri,
      GoogleOpeningHours currentOpeningHours) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GoogleDisplayName(String text) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GoogleLocation(Double latitude, Double longitude) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GoogleOpeningHours(Boolean openNow, String nextOpenTime, String nextCloseTime) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePhoto(String name) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record GooglePhotoMediaResponse(String photoUri) {
  }

  private record BudgetRange(int min, int max) {
  }
}
