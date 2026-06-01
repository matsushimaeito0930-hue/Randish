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
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class HotPepperRestaurantProvider implements ExternalRestaurantProvider {
  private static final String PROVIDER = "HOTPEPPER";
  private static final String API_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";
  private static final String ALL_GENRES = "\u3059\u3079\u3066";
  private static final int PAGE_SIZE = 100;
  private static final int MAX_RESULTS_PER_PLAN = 10000;
  private static final Pattern PRICE_PATTERN = Pattern.compile("(\\d[\\d,]*)");
  private static final Map<String, List<SearchPlan>> GENRE_SEARCH_PLANS = Map.ofEntries(
      Map.entry("ラーメン", List.of(new SearchPlan(List.of("G013"), List.of()))),
      Map.entry("焼肉", List.of(new SearchPlan(List.of("G008"), List.of("焼肉")))),
      Map.entry("居酒屋", List.of(new SearchPlan(List.of("G001"), List.of()))),
      Map.entry("韓国料理", List.of(new SearchPlan(List.of("G017"), List.of("韓国料理")), new SearchPlan(List.of(), List.of("韓国料理")))),
      Map.entry("カレー", List.of(new SearchPlan(List.of("G009"), List.of("カレー")), new SearchPlan(List.of(), List.of("スパイスカレー")))),
      Map.entry("うどん", List.of(new SearchPlan(List.of("G004"), List.of("うどん")), new SearchPlan(List.of(), List.of("うどん")))),
      Map.entry("そば", List.of(new SearchPlan(List.of("G004"), List.of("そば")), new SearchPlan(List.of(), List.of("蕎麦")))),
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
      Map.entry("ファストフード", List.of(new SearchPlan(List.of("G015"), List.of()), new SearchPlan(List.of(), List.of("ハンバーガー")))),
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
          .filter(restaurant -> matchesBudget(restaurant, budgetMin, budgetMax))
          .forEach(restaurant -> restaurantsById.putIfAbsent(restaurant.id(), restaurant));
    }
    return List.copyOf(restaurantsById.values());
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
            .queryParam("count", PAGE_SIZE)
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
    return (budgetMin == null || restaurant.budgetMax() >= budgetMin)
        && (budgetMax == null || restaurant.budgetMin() <= budgetMax);
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
