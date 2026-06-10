package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class HotPepperRestaurantProvider implements ExternalRestaurantProvider {
  private static final String PROVIDER = "HOTPEPPER";
  private static final String API_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";
  private static final String ALL_GENRES = "\u3059\u3079\u3066";
  private static final int PAGE_SIZE = 30;
  private static final int MAX_RESULTS_PER_PLAN = 300;
  private static final int RANDOM_PAGE_COUNT_PER_PLAN = 5;
  private static final Pattern PRICE_PATTERN = Pattern.compile("(\\d[\\d,]*)");
  private static final Map<String, List<SearchPlan>> GENRE_SEARCH_PLANS = Map.ofEntries(
      Map.entry("ラーメン", List.of(new SearchPlan(List.of("G013"), List.of()))),
      Map.entry("焼肉", List.of(new SearchPlan(List.of("G008"), List.of("焼肉")))),
      Map.entry("居酒屋", List.of(new SearchPlan(List.of("G001"), List.of()))),
      Map.entry("韓国料理", List.of(new SearchPlan(List.of("G017"), List.of("韓国料理")), new SearchPlan(List.of(), List.of("韓国料理")))),
      Map.entry("カレー", List.of(new SearchPlan(List.of("G009"), List.of("カレー")), new SearchPlan(List.of(), List.of("スパイスカレー")))),
      Map.entry("うどん", List.of(new SearchPlan(List.of("G004"), List.of("うどん")), new SearchPlan(List.of(), List.of("うどん")))),
      Map.entry("そば", List.of(new SearchPlan(List.of("G004"), List.of("そば")), new SearchPlan(List.of(), List.of("蕎麦")))),
      Map.entry("粉もの", List.of(
          new SearchPlan(List.of("G016"), List.of("お好み焼き")),
          new SearchPlan(List.of("G016"), List.of("たこ焼き")),
          new SearchPlan(List.of("G016"), List.of("もんじゃ")),
          new SearchPlan(List.of(), List.of("粉もの")))),
      Map.entry("たこ焼き", List.of(new SearchPlan(List.of("G016"), List.of("たこ焼き")), new SearchPlan(List.of(), List.of("たこ焼き")))),
      Map.entry("お好み焼き", List.of(new SearchPlan(List.of("G016"), List.of("お好み焼き")))),
      Map.entry("焼き鳥", List.of(new SearchPlan(List.of("G001"), List.of("焼き鳥")), new SearchPlan(List.of(), List.of("焼鳥")))),
      Map.entry("ピザ", List.of(new SearchPlan(List.of("G006"), List.of("ピザ")), new SearchPlan(List.of(), List.of("ピッツァ")))),
      Map.entry("ハンバーガー", List.of(new SearchPlan(List.of("G015"), List.of("ハンバーガー")))),
      Map.entry("定食", List.of(new SearchPlan(List.of("G004"), List.of("定食")), new SearchPlan(List.of(), List.of("食堂")))),
      Map.entry("串カツ", List.of(new SearchPlan(List.of("G016"), List.of("串カツ")), new SearchPlan(List.of("G001"), List.of("串カツ")))),
      Map.entry("餃子", List.of(new SearchPlan(List.of("G007"), List.of("餃子")), new SearchPlan(List.of(), List.of("餃子")))),
      Map.entry("和食", List.of(new SearchPlan(List.of("G004"), List.of()))),
      Map.entry("洋食", List.of(new SearchPlan(List.of("G005"), List.of()))),
      Map.entry("イタリアン", List.of(new SearchPlan(List.of("G006"), List.of("イタリアン")))),
      Map.entry("中華", List.of(new SearchPlan(List.of("G007"), List.of()))),
      Map.entry("寿司", List.of(new SearchPlan(List.of("G004"), List.of("寿司")))),
      Map.entry("海鮮", List.of(new SearchPlan(List.of("G004"), List.of("海鮮")), new SearchPlan(List.of("G001"), List.of("海鮮")))),
      Map.entry("肉料理", List.of(new SearchPlan(List.of("G008"), List.of()), new SearchPlan(List.of("G005"), List.of("ステーキ")))),
      Map.entry("サラダ・野菜", List.of(new SearchPlan(List.of(), List.of("野菜")), new SearchPlan(List.of(), List.of("サラダ")))),
      Map.entry("スープ", List.of(new SearchPlan(List.of(), List.of("スープ")))),
      Map.entry("スイーツ", List.of(new SearchPlan(List.of("G014"), List.of("スイーツ")))),
      Map.entry("カフェ", List.of(new SearchPlan(List.of("G014"), List.of("カフェ")))),
      Map.entry("パン", List.of(new SearchPlan(List.of("G014"), List.of("パン")), new SearchPlan(List.of("G015"), List.of("パン")))),
      Map.entry("郷土料理", List.of(
          new SearchPlan(List.of("G004"), List.of("郷土料理")),
          new SearchPlan(List.of(), List.of("ご当地 グルメ")),
          new SearchPlan(List.of(), List.of("名物料理")))),
      Map.entry("その他", List.of(SearchPlan.noGenre())),
      Map.entry("ファストフード", List.of(
          new SearchPlan(List.of("G015"), List.of()),
          new SearchPlan(List.of(), List.of("ハンバーガー")),
          new SearchPlan(List.of(), List.of("バーガー")),
          new SearchPlan(List.of(), List.of("マクドナルド")),
          new SearchPlan(List.of(), List.of("マック")),
          new SearchPlan(List.of(), List.of("モスバーガー")),
          new SearchPlan(List.of(), List.of("ロッテリア")),
          new SearchPlan(List.of(), List.of("ケンタッキー")))),
      Map.entry("お酒・バー", List.of(new SearchPlan(List.of("G012"), List.of()), new SearchPlan(List.of("G001"), List.of()))),
      Map.entry("各国料理", List.of(new SearchPlan(List.of("G010"), List.of()), new SearchPlan(List.of("G009"), List.of()), new SearchPlan(List.of("G017"), List.of())))
  );

  private final RestClient restClient;
  private final ObjectMapper objectMapper;
  private final String apiKey;

  public HotPepperRestaurantProvider(RestClient.Builder restClientBuilder, ObjectMapper objectMapper) {
    this.restClient = restClientBuilder.baseUrl(API_URL).build();
    this.objectMapper = objectMapper;
    this.apiKey = resolveApiKey();
  }

  @Override
  public String providerKey() {
    return PROVIDER;
  }

  @Override
  public boolean isAvailable() {
    return apiKey != null && !apiKey.isBlank();
  }

  public Map<String, Object> diagnostics(String area, String genre) {
    Map<String, Object> result = new LinkedHashMap<>();
    result.put("provider", PROVIDER);
    result.put("workingDirectory", Path.of("").toAbsolutePath().toString());
    result.put("apiKeyLoaded", isAvailable());
    result.put("apiKeyLength", apiKey == null ? 0 : apiKey.length());
    List<SearchPlan> searchPlans = buildSearchPlans(genre);
    result.put("keyword", buildKeyword(area, searchPlans.getFirst().extraKeywords()));
    result.put("searchPlanCount", searchPlans.size());
    result.put("checkedEnvFiles", List.of(
        envFileStatus(Path.of(".env.local")),
        envFileStatus(Path.of("..", ".env.local")),
        envFileStatus(Path.of(".env")),
        envFileStatus(Path.of("..", ".env"))));

    if (!isAvailable()) {
      result.put("status", "API_KEY_NOT_LOADED");
      return result;
    }

    try {
      List<Restaurant> restaurants = search(area, genre, null, null, null, null, null);
      result.put("status", "OK");
      result.put("restaurantCount", restaurants.size());
      result.put("firstRestaurant", restaurants.isEmpty() ? null : restaurants.getFirst());
    } catch (RuntimeException exception) {
      result.put("status", "HOTPEPPER_REQUEST_FAILED");
      result.put("errorClass", exception.getClass().getName());
      result.put("errorMessage", exception.getMessage());
      result.put("causeClass", exception.getCause() == null ? null : exception.getCause().getClass().getName());
      result.put("causeMessage", exception.getCause() == null ? null : exception.getCause().getMessage());
    }
    return result;
  }

  @Override
  public synchronized List<Restaurant> search(
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

    Map<String, Restaurant> restaurantsById = new LinkedHashMap<>();
    for (SearchPlan plan : buildSearchPlans(genre)) {
      fetchAll(area, plan, latitude, longitude, range).stream()
          .filter(restaurant -> matchesRequestedGenre(restaurant, genre))
          .filter(restaurant -> matchesBudget(restaurant, budgetMin, budgetMax))
          .forEach(restaurant -> restaurantsById.putIfAbsent(restaurant.id(), restaurant));
    }
    return List.copyOf(restaurantsById.values());
  }

  @Override
  public synchronized Optional<Restaurant> findByExternalId(
      String externalId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    if (!isAvailable() || externalId == null || externalId.isBlank()) {
      return Optional.empty();
    }
    HotPepperResponse response = requestById(externalId.trim());
    if (response == null || response.results() == null || response.results().shop() == null || response.results().shop().isEmpty()) {
      return Optional.empty();
    }
    return Optional.of(toRestaurant(response.results().shop().getFirst()));
  }

  @Override
  public synchronized List<Restaurant> searchRandomCandidates(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates) {
    if (!isAvailable()) {
      return List.of();
    }

    Map<String, Restaurant> restaurantsById = new LinkedHashMap<>();
    for (SearchPlan plan : buildSearchPlans(genre)) {
      int available = fetchAvailableCount(area, plan, latitude, longitude, range);
      if (available <= 0) {
        continue;
      }

      int sizeBeforePlan = restaurantsById.size();
      int pageCount = Math.min(RANDOM_PAGE_COUNT_PER_PLAN, Math.max(1, maxCandidates / PAGE_SIZE + 1));
      for (int index = 0; index < pageCount && restaurantsById.size() < maxCandidates; index++) {
        int maxStart = Math.max(1, available - PAGE_SIZE + 1);
        int randomStart = ThreadLocalRandom.current().nextInt(1, maxStart + 1);
        HotPepperResponse response = requestPage(area, plan, randomStart, latitude, longitude, range);
        if (response == null || response.results() == null || response.results().shop() == null) {
          continue;
        }
        if (response.results().error() != null) {
          throw new IllegalStateException("HotPepper API error: " + response.results().error().message());
        }

        response.results().shop().stream()
            .map(this::toRestaurant)
            .filter(restaurant -> matchesRequestedGenre(restaurant, genre))
            .filter(restaurant -> matchesBudget(restaurant, budgetMin, budgetMax))
            .forEach(restaurant -> restaurantsById.putIfAbsent(restaurant.id(), restaurant));
      }

      if (restaurantsById.size() == sizeBeforePlan && restaurantsById.size() < maxCandidates) {
        fetchAll(area, plan, latitude, longitude, range).stream()
            .filter(restaurant -> matchesRequestedGenre(restaurant, genre))
            .filter(restaurant -> matchesBudget(restaurant, budgetMin, budgetMax))
            .forEach(restaurant -> {
              if (restaurantsById.size() < maxCandidates) {
                restaurantsById.putIfAbsent(restaurant.id(), restaurant);
              }
            });
      }
    }

    return restaurantsById.values().stream().limit(maxCandidates).toList();
  }

  private int fetchAvailableCount(String area, SearchPlan plan, Double latitude, Double longitude, Integer range) {
    HotPepperResponse response = requestPage(area, plan, 1, latitude, longitude, range, 1);
    if (response == null || response.results() == null) {
      return 0;
    }
    if (response.results().error() != null) {
      throw new IllegalStateException("HotPepper API error: " + response.results().error().message());
    }
    return response.results().resultsAvailable() == null ? 0 : response.results().resultsAvailable();
  }

  private List<Restaurant> fetchAll(String area, SearchPlan plan, Double latitude, Double longitude, Integer range) {
    Map<String, Restaurant> restaurantsById = new LinkedHashMap<>();
    int start = 1;
    int available = Integer.MAX_VALUE;

    while (start <= available && start <= MAX_RESULTS_PER_PLAN) {
      HotPepperResponse response = requestPage(area, plan, start, latitude, longitude, range);
      if (response == null || response.results() == null) {
        break;
      }
      if (response.results().error() != null) {
        throw new IllegalStateException("HotPepper API error: " + response.results().error().message());
      }
      if (response.results().shop() == null) {
        break;
      }

      available = response.results().resultsAvailable() == null ? response.results().shop().size() : response.results().resultsAvailable();
      response.results().shop().stream()
          .map(this::toRestaurant)
          .forEach(restaurant -> restaurantsById.putIfAbsent(restaurant.id(), restaurant));

      int returned = response.results().resultsReturned() == null ? response.results().shop().size() : response.results().resultsReturned();
      if (returned <= 0) {
        break;
      }
      start += returned;
    }

    return List.copyOf(restaurantsById.values());
  }

  private HotPepperResponse requestPage(String area, SearchPlan plan, int start, Double latitude, Double longitude, Integer range) {
    return requestPage(area, plan, start, latitude, longitude, range, PAGE_SIZE);
  }

  private HotPepperResponse requestPage(String area, SearchPlan plan, int start, Double latitude, Double longitude, Integer range, int count) {
    boolean hasCoordinates = latitude != null && longitude != null;
    String keyword = hasCoordinates ? buildKeyword(null, plan.extraKeywords()) : buildKeyword(area, plan.extraKeywords());
    if (!hasCoordinates && keyword.isBlank()) {
      keyword = "\u6885\u7530";
    }
    String requestKeyword = keyword;
    Integer safeRange = range == null ? 4 : Math.max(1, Math.min(5, range));

    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .queryParam("key", apiKey)
            .queryParamIfPresent("keyword", requestKeyword.isBlank() ? Optional.empty() : Optional.of(requestKeyword))
            .queryParamIfPresent("lat", hasCoordinates ? Optional.of(latitude) : Optional.empty())
            .queryParamIfPresent("lng", hasCoordinates ? Optional.of(longitude) : Optional.empty())
            .queryParamIfPresent("range", hasCoordinates ? Optional.of(safeRange) : Optional.empty())
            .queryParamIfPresent("order", hasCoordinates ? Optional.of(4) : Optional.empty())
            .queryParamIfPresent("genre", buildGenreCodes(plan))
            .queryParam("start", start)
            .queryParam("count", count)
            .queryParam("format", "json")
            .build())
        .retrieve()
        .body(byte[].class);

    return parseResponse(responseBody == null ? null : new String(responseBody, StandardCharsets.UTF_8));
  }

  private HotPepperResponse requestById(String id) {
    byte[] responseBody = restClient.get()
        .uri(uriBuilder -> uriBuilder
            .queryParam("key", apiKey)
            .queryParam("id", id)
            .queryParam("format", "json")
            .build())
        .retrieve()
        .body(byte[].class);

    return parseResponse(responseBody == null ? null : new String(responseBody, StandardCharsets.UTF_8));
  }

  private HotPepperResponse parseResponse(String responseBody) {
    if (responseBody == null || responseBody.isBlank()) {
      return null;
    }
    try {
      return objectMapper.readValue(responseBody, HotPepperResponse.class);
    } catch (JsonProcessingException exception) {
      throw new IllegalStateException("Failed to parse HotPepper response body.", exception);
    }
  }

  private List<SearchPlan> buildSearchPlans(String genre) {
    if (genre == null || genre.isBlank() || ALL_GENRES.equals(genre.trim())) {
      return List.of(SearchPlan.noGenre());
    }
    return GENRE_SEARCH_PLANS.getOrDefault(genre.trim(), List.of(new SearchPlan(List.of(), List.of(genre.trim()))));
  }

  private Optional<String> buildGenreCodes(SearchPlan plan) {
    return plan.genreCodes().isEmpty() ? Optional.empty() : Optional.of(String.join(",", plan.genreCodes()));
  }

  private String buildKeyword(String area, List<String> extraKeywords) {
    List<String> words = new ArrayList<>();
    if (area != null && !area.isBlank()) {
      words.add(area.trim());
    }
    words.addAll(extraKeywords);
    return words.isEmpty() ? "" : String.join(" ", words);
  }

  private Restaurant toRestaurant(HotPepperShop shop) {
    BudgetRange budgetRange = parseBudget(shop.budget() == null ? null : shop.budget().name());
    String genre = shop.genre() == null || shop.genre().name() == null ? "Unknown" : shop.genre().name();
    return new Restaurant(
        "hotpepper-" + shop.id(),
        PROVIDER,
        shop.id(),
        shop.name(),
        guessArea(shop.address()),
        genre,
        budgetRange.min(),
        budgetRange.max(),
        0,
        0,
        shop.address(),
        extractPhotoUrl(shop.photo()),
        shop.catchText(),
        shop.lat(),
        shop.lng());
  }

  private String extractPhotoUrl(HotPepperPhoto photo) {
    if (photo == null) {
      return null;
    }
    if (photo.pc() != null && photo.pc().l() != null) {
      return photo.pc().l();
    }
    if (photo.pc() != null && photo.pc().m() != null) {
      return photo.pc().m();
    }
    if (photo.mobile() != null && photo.mobile().l() != null) {
      return photo.mobile().l();
    }
    if (photo.mobile() != null && photo.mobile().s() != null) {
      return photo.mobile().s();
    }
    return null;
  }

  private String guessArea(String address) {
    if (address == null || address.isBlank()) {
      return "Unknown";
    }
    return address.length() > 16 ? address.substring(0, 16) : address;
  }

  private BudgetRange parseBudget(String budgetName) {
    if (budgetName == null || budgetName.isBlank()) {
      return new BudgetRange(0, 999999);
    }
    Matcher matcher = PRICE_PATTERN.matcher(budgetName.replace(",", ""));
    List<Integer> prices = new ArrayList<>();
    while (matcher.find()) {
      prices.add(Integer.parseInt(matcher.group(1)));
    }
    if (prices.isEmpty()) {
      return new BudgetRange(0, 999999);
    }
    if (prices.size() == 1) {
      return new BudgetRange(prices.getFirst(), prices.getFirst());
    }
    return new BudgetRange(prices.get(0), prices.get(1));
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

  private boolean matchesRequestedGenre(Restaurant restaurant, String requestedGenre) {
    if (requestedGenre == null || requestedGenre.isBlank() || ALL_GENRES.equals(requestedGenre.trim())) {
      return true;
    }

    String genre = requestedGenre.trim();
    String source = String.join(" ",
        restaurant.genre() == null ? "" : restaurant.genre(),
        restaurant.name() == null ? "" : restaurant.name(),
        restaurant.note() == null ? "" : restaurant.note());

    return switch (genre) {
      case "定食" -> !containsAny(source, List.of("韓国", "焼肉", "カラオケ", "バー"))
          && containsAny(source, List.of("定食", "食堂", "和食", "ごはん", "御膳", "膳"));
      case "居酒屋" -> containsAny(source, List.of("居酒屋", "酒場", "炉端", "バル"));
      case "韓国料理" -> containsAny(source, List.of("韓国", "サムギョプサル", "チーズタッカルビ", "冷麺"));
      case "ラーメン" -> containsAny(source, List.of("ラーメン", "らーめん", "つけ麺", "麺"));
      case "焼肉" -> containsAny(source, List.of("焼肉", "ホルモン", "ジンギスカン"));
      case "カレー" -> containsAny(source, List.of("カレー", "スパイス"));
      case "うどん" -> containsAny(source, List.of("うどん"));
      case "そば" -> containsAny(source, List.of("そば", "蕎麦"));
      case "粉もの" -> containsAny(source, List.of("粉もの", "たこ焼き", "お好み焼き", "もんじゃ"));
      case "たこ焼き" -> containsAny(source, List.of("たこ焼き"));
      case "お好み焼き" -> containsAny(source, List.of("お好み焼き", "もんじゃ"));
      case "焼き鳥" -> containsAny(source, List.of("焼き鳥", "焼鳥"));
      case "ピザ" -> containsAny(source, List.of("ピザ", "ピッツァ"));
      case "ハンバーガー" -> containsAny(source, List.of("ハンバーガー", "バーガー"));
      case "串カツ" -> containsAny(source, List.of("串カツ", "串かつ"));
      case "餃子" -> containsAny(source, List.of("餃子"));
      case "和食" -> containsAny(source, List.of("和食", "日本料理", "定食", "食堂", "懐石", "割烹"));
      case "洋食" -> containsAny(source, List.of("洋食", "ステーキ", "ハンバーグ", "オムライス"));
      case "イタリアン" -> containsAny(source, List.of("イタリアン", "パスタ", "ピザ", "ピッツァ", "トラットリア"));
      case "中華" -> containsAny(source, List.of("中華", "中国料理", "餃子", "四川"));
      case "寿司" -> containsAny(source, List.of("寿司", "鮨", "すし"));
      case "海鮮" -> containsAny(source, List.of("海鮮", "魚", "刺身", "浜焼き"));
      case "郷土料理" -> containsAny(source, List.of("郷土料理", "郷土", "ご当地", "名物", "地元料理", "沖縄料理", "北海道料理"));
      case "肉料理" -> containsAny(source, List.of("肉", "焼肉", "ステーキ", "ハンバーグ", "ホルモン"));
      case "サラダ・野菜" -> containsAny(source, List.of("サラダ", "野菜", "ベジ"));
      case "スープ" -> containsAny(source, List.of("スープ", "汁", "鍋"));
      case "スイーツ" -> containsAny(source, List.of("スイーツ", "デザート", "ケーキ", "パフェ", "甘味"));
      case "カフェ" -> containsAny(source, List.of("カフェ", "喫茶"));
      case "パン" -> containsAny(source, List.of("パン", "ベーカリー"));
      case "ファストフード" -> containsAny(source, List.of(
          "ファストフード",
          "ファーストフード",
          "ハンバーガー",
          "バーガー",
          "サンド",
          "フライド",
          "マクドナルド",
          "マック",
          "モスバーガー",
          "ロッテリア",
          "ケンタッキー",
          "KFC",
          "バーガーキング",
          "フレッシュネス",
          "サブウェイ",
          "ドムドム"));
      case "お酒・バー" -> containsAny(source, List.of("バー", "ダイニングバー", "居酒屋", "ワイン", "ビール", "酒"));
      case "各国料理" -> containsAny(source, List.of("各国料理", "韓国", "アジア", "エスニック", "タイ", "インド", "メキシコ", "スペイン", "ベトナム"));
      case "その他" -> true;
      default -> true;
    };
  }

  private boolean containsAny(String source, List<String> keywords) {
    return keywords.stream().anyMatch(source::contains);
  }

  private String resolveApiKey() {
    String envValue = System.getenv("HOTPEPPER_API_KEY");
    if (envValue != null && !envValue.isBlank()) {
      return trimValue(envValue);
    }
    for (Path path : List.of(
        Path.of(".env.local"),
        Path.of("..", ".env.local"),
        Path.of(".env"),
        Path.of("..", ".env"))) {
      Optional<String> fileValue = readApiKeyFromFile(path);
      if (fileValue.isPresent()) {
        return fileValue.get();
      }
    }
    return null;
  }

  private Optional<String> readApiKeyFromFile(Path path) {
    if (!Files.exists(path)) {
      return Optional.empty();
    }
    try {
      return Files.readAllLines(path, StandardCharsets.UTF_8).stream()
          .map(String::trim)
          .filter(line -> !line.isBlank())
          .filter(line -> !line.startsWith("#"))
          .filter(line -> line.contains("HOTPEPPER_API_KEY"))
          .map(line -> line.substring(line.indexOf('=') + 1))
          .map(this::trimValue)
          .filter(value -> !value.isBlank())
          .findFirst();
    } catch (IOException ignored) {
      return Optional.empty();
    }
  }

  private Map<String, Object> envFileStatus(Path path) {
    Map<String, Object> status = new LinkedHashMap<>();
    Path absolutePath = path.toAbsolutePath().normalize();
    status.put("path", absolutePath.toString());
    status.put("exists", Files.exists(path));
    return status;
  }

  private String trimValue(String value) {
    return value.trim().replaceFirst("^['\\\"]", "").replaceFirst("['\\\"]$", "");
  }

  private record BudgetRange(int min, int max) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperResponse(HotPepperResults results) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record SearchPlan(List<String> genreCodes, List<String> extraKeywords) {
    static SearchPlan noGenre() {
      return new SearchPlan(List.of(), List.of());
    }
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperResults(
      @JsonProperty("results_available") Integer resultsAvailable,
      @JsonProperty("results_returned") Integer resultsReturned,
      @JsonProperty("results_start") Integer resultsStart,
      List<HotPepperShop> shop,
      HotPepperError error) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperError(String message, String code) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperShop(
      String id,
      String name,
      String address,
      Double lat,
      Double lng,
      HotPepperName genre,
      HotPepperName budget,
      HotPepperPhoto photo,
      @JsonProperty("catch") String catchText) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperName(String name) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperPhoto(HotPepperPhotoSize pc, HotPepperPhotoSize mobile) {
  }

  @JsonIgnoreProperties(ignoreUnknown = true)
  private record HotPepperPhotoSize(String l, String m, String s) {
  }
}
