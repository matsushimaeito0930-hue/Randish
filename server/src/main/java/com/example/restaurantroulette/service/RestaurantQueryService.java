package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.RestaurantRepository;
import com.example.restaurantroulette.service.external.ExternalRestaurantProvider;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class RestaurantQueryService {
  private static final Logger logger = LoggerFactory.getLogger(RestaurantQueryService.class);
  /**
   * Google Places をどこまで使うか。
   *
   * <p>3つの提供元のうち Google だけが従量課金で、試算では1人あたりの原価の7割を占める。
   * 全員に常用させると持たないが、他が空振りしたときに何も出せないのも困る。
   * そこで「誰の検索か」で使い方を変える。
   */
  public enum GooglePlacesUsage {
    /** 使わない。 */
    NONE,
    /** 他の提供元が1件も返せなかったときだけ。無料枠の空振りを防ぐための最後の手段。 */
    ONLY_WHEN_EMPTY,
    /** 件数が目標に届かないぶんを補う。Premium と dev。 */
    FILL_SHORTFALL
  }

  /**
   * 無料枠で返す件数の上限。
   *
   * 「距離の指定なし」で市全体を引くと、都市部では数百件になる。無料はここで止める。
   */
  private static final int HYBRID_TARGET_RESULT_COUNT = 100;

  /**
   * Premium と dev で返す件数の上限。
   *
   * 「上限なし」にはできない。ホットペッパーが1条件あたり300件までしか返さないので、
   * それ以上を約束しても提供元が持っていない。天井をそのまま上限にする。
   */
  private static final int PREMIUM_TARGET_RESULT_COUNT = 300;
  /** ホットペッパーの距離指定の最大値（約3km）。近くに無いときはここまでは広げる。 */
  private static final int WIDEST_RANGE = 5;
  private static final int MAX_FALLBACK_FILL_COUNT = 30;
  private static final int DUPLICATE_DISTANCE_METERS = 60;
  private static final Map<String, Integer> PROVIDER_SEARCH_ORDER = Map.of(
      "HOTPEPPER", 10,
      "GEOAPIFY", 20,
      "GOOGLE_PLACES", 100);

  private final RestaurantRepository restaurantRepository;
  private final List<ExternalRestaurantProvider> externalRestaurantProviders;
  private final DtoMapper mapper;
  private final ValidationService validationService;
  private final SearchCacheService searchCacheService;

  // コンストラクタが2つあるため、Spring にどちらを使うかを明示する。
  @Autowired
  public RestaurantQueryService(
      RestaurantRepository restaurantRepository,
      List<ExternalRestaurantProvider> externalRestaurantProviders,
      DtoMapper mapper,
      ValidationService validationService,
      SearchCacheService searchCacheService) {
    this.restaurantRepository = restaurantRepository;
    this.externalRestaurantProviders = externalRestaurantProviders;
    this.mapper = mapper;
    this.validationService = validationService;
    this.searchCacheService = searchCacheService;
  }

  /**
   * キャッシュを使わない生成。テストなど、DBを用意しない場面のために残している。
   * 本番では Spring が上のコンストラクタを使う。
   */
  public RestaurantQueryService(
      RestaurantRepository restaurantRepository,
      List<ExternalRestaurantProvider> externalRestaurantProviders,
      DtoMapper mapper,
      ValidationService validationService) {
    this(restaurantRepository, externalRestaurantProviders, mapper, validationService, null);
  }

  public List<RestaurantResponse> search(String area, String genre, Integer budgetMin, Integer budgetMax) {
    return search(area, genre, budgetMin, budgetMax, null, null, null);
  }

  public List<RestaurantResponse> search(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    return search(area, genre, budgetMin, budgetMax, latitude, longitude, range, GooglePlacesUsage.NONE);
  }

  public List<RestaurantResponse> search(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      GooglePlacesUsage googlePlacesUsage) {
    return searchEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range, googlePlacesUsage).stream()
        .map(mapper::toRestaurantResponse)
        .toList();
  }

  public List<Restaurant> searchEntities(String area, String genre, Integer budgetMin, Integer budgetMax) {
    return searchEntities(area, genre, budgetMin, budgetMax, null, null, null);
  }

  public List<Restaurant> searchRandomEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates) {
    return searchRandomEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range, maxCandidates, false);
  }

  public List<Restaurant> searchRandomEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates,
      boolean allowFallbackProviders) {
    return searchRandomEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range, maxCandidates,
        allowFallbackProviders ? GooglePlacesUsage.FILL_SHORTFALL : GooglePlacesUsage.NONE);
  }

  public List<Restaurant> searchRandomEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates,
      GooglePlacesUsage googlePlacesUsage) {
    validationService.validateSearchRequest(area, genre, budgetMin, budgetMax, latitude, longitude, range);
    Map<String, Restaurant> externalOnlyRestaurants = new LinkedHashMap<>();
    boolean hasAvailableProvider = false;

    int desiredCandidateCount = Math.max(1, maxCandidates);
    hasAvailableProvider = queryRandomProviders(
        primaryProviders(),
        area,
        genre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        desiredCandidateCount,
        externalOnlyRestaurants);

    if (externalOnlyRestaurants.isEmpty() && shouldWidenRange(latitude, longitude, range)) {
      hasAvailableProvider = queryRandomProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          WIDEST_RANGE,
          desiredCandidateCount,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    int fallbackLimit = googlePlacesFetchLimit(
        googlePlacesUsage, externalOnlyRestaurants.size(), desiredCandidateCount);
    if (fallbackLimit > 0) {
      hasAvailableProvider = queryRandomProviders(
          fallbackProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          fallbackLimit,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (hasAvailableProvider && externalOnlyRestaurants.isEmpty()) {
      hasAvailableProvider = queryProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (!hasAvailableProvider) {
      return restaurantRepository.search(area, genre, budgetMin, budgetMax);
    }

    if (!externalOnlyRestaurants.isEmpty()) {
      // 一覧と同じ照合を抽選側にも掛ける。ここを抜かすと、一覧には出ない東京の店が
      // 抽選で当たることになる。
      return limitedCandidates(
          keepInsideRequestedArea(externalOnlyRestaurants, area, latitude, longitude),
          desiredCandidateCount);
    }

    if (hasCoordinates(latitude, longitude)) {
      return List.of();
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
  }

  public List<Restaurant> searchEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    return searchEntities(
        area, genre, budgetMin, budgetMax, latitude, longitude, range, GooglePlacesUsage.NONE);
  }

  public List<Restaurant> searchEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      GooglePlacesUsage googlePlacesUsage) {
    validationService.validateSearchRequest(area, genre, budgetMin, budgetMax, latitude, longitude, range);

    // 同じ条件での引き直しは外部APIへ行かない。
    // 家や職場から繰り返し使うのが普通なので、毎回取り直すと待たせるうえ課金も積み上がる。
    if (searchCacheService == null) {
      return searchEntitiesFromProviders(
          area, genre, budgetMin, budgetMax, latitude, longitude, range, googlePlacesUsage);
    }
    // Google を使った結果と使っていない結果は中身が違う。同じキーに入れると、
    // 無料の検索がPremiumの控えを引いたり、その逆が起きる。使い方ごとに分ける。
    String cacheKey = searchCacheService.buildKey(
        area, genre, budgetMin, budgetMax, latitude, longitude, range, googlePlacesUsage.name());
    Optional<List<Restaurant>> cached = searchCacheService.find(cacheKey);
    if (cached.isPresent()) {
      return cached.get();
    }
    List<Restaurant> freshResults = searchEntitiesFromProviders(
        area, genre, budgetMin, budgetMax, latitude, longitude, range, googlePlacesUsage);
    searchCacheService.save(cacheKey, freshResults);
    return freshResults;
  }

  private List<Restaurant> searchEntitiesFromProviders(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      GooglePlacesUsage googlePlacesUsage) {
    Map<String, Restaurant> externalOnlyRestaurants = new LinkedHashMap<>();
    boolean hasAvailableProvider = false;

    hasAvailableProvider = queryProviders(
        primaryProviders(),
        area,
        genre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        externalOnlyRestaurants);

    if (externalOnlyRestaurants.isEmpty() && shouldWidenRange(latitude, longitude, range)) {
      hasAvailableProvider = queryProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          WIDEST_RANGE,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    int targetResultCount = targetResultCount(googlePlacesUsage);
    int fallbackLimit = googlePlacesFetchLimit(
        googlePlacesUsage, externalOnlyRestaurants.size(), targetResultCount);
    if (fallbackLimit > 0) {
      hasAvailableProvider = queryRandomProviders(
          fallbackProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          fallbackLimit,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (!hasAvailableProvider) {
      return restaurantRepository.search(area, genre, budgetMin, budgetMax);
    }

    if (!externalOnlyRestaurants.isEmpty()) {
      return limitedCandidates(
          keepInsideRequestedArea(externalOnlyRestaurants, area, latitude, longitude),
          targetResultCount);
    }

    if (hasCoordinates(latitude, longitude)) {
      return List.of();
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
  }

  /**
   * 頼まれた市区町村の外にある店を落とす。
   *
   * <p>ホットペッパーのキーワード検索は住所だけを見ていない。店名や紹介文にも当たるので、
   * 「広島県 府中市」で引くと、葛飾区にある広島風お好み焼きの店が返ってくる。実際に返ってきた。
   * 利用者からすれば、広島の町を選んだのに東京の店が出ているようにしか見えない。
   *
   * <p>座標で引いているときは距離で絞れているので触らない。ここが効くのは地名で引いたときだけ。
   *
   * <p>住所が読めない店は落とさない。提供元によっては住所が空のことがあり、
   * 「確かめられない」を「外にある」と同じ扱いにすると、正しい店まで消える。
   */
  private Map<String, Restaurant> keepInsideRequestedArea(
      Map<String, Restaurant> restaurants,
      String area,
      Double latitude,
      Double longitude) {
    if (hasCoordinates(latitude, longitude) || area == null || area.isBlank()) {
      return restaurants;
    }
    List<String> tokens = List.of(area.trim().split("[\\s/、,]+")).stream()
        .map(String::trim)
        .filter(token -> token.length() >= 2)
        .toList();
    if (tokens.isEmpty()) {
      return restaurants;
    }
    Map<String, Restaurant> kept = new LinkedHashMap<>();
    restaurants.forEach((key, restaurant) -> {
      String address = restaurant.address();
      if (address == null || address.isBlank()) {
        kept.put(key, restaurant);
        return;
      }
      if (tokens.stream().allMatch(address::contains)) {
        kept.put(key, restaurant);
      }
    });
    // 全部落ちるのは、地名の書き方が住所と噛み合っていないとき。
    // その場合はこちらの照合が外れているのであって、店が悪いわけではない。
    return kept.isEmpty() ? restaurants : kept;
  }

  private List<ExternalRestaurantProvider> primaryProviders() {
    return orderedProviders(externalRestaurantProviders.stream()
        .filter(provider -> !provider.isFallback())
        .toList());
  }

  private List<ExternalRestaurantProvider> fallbackProviders() {
    return orderedProviders(externalRestaurantProviders.stream()
        .filter(ExternalRestaurantProvider::isFallback)
        .toList());
  }

  private List<ExternalRestaurantProvider> orderedProviders(List<ExternalRestaurantProvider> providers) {
    return providers.stream()
        .sorted(Comparator.comparingInt(this::providerSearchOrder))
        .toList();
  }

  private int providerSearchOrder(ExternalRestaurantProvider provider) {
    String providerKey = provider.providerKey() == null ? "" : provider.providerKey().trim().toUpperCase(Locale.ROOT);
    return PROVIDER_SEARCH_ORDER.getOrDefault(providerKey, provider.isFallback() ? 1_000 : 50);
  }

  private boolean queryProviders(
      List<ExternalRestaurantProvider> providers,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      Map<String, Restaurant> externalOnlyRestaurants) {
    boolean hasAvailableProvider = false;
    for (ExternalRestaurantProvider provider : providers) {
      if (!provider.isAvailable()) {
        logger.warn("External restaurant provider is not available: {}.", provider.getClass().getSimpleName());
        continue;
      }
      hasAvailableProvider = true;
      try {
        List<Restaurant> externalRestaurants = provider.search(area, genre, budgetMin, budgetMax, latitude, longitude, range);
        externalRestaurants.forEach(restaurant -> putIfUnique(externalOnlyRestaurants, restaurant));
      } catch (RuntimeException exception) {
        logger.warn("External restaurant provider failed: {}", provider.getClass().getSimpleName(), exception);
      }
    }

    return hasAvailableProvider;
  }

  private boolean queryRandomProviders(
      List<ExternalRestaurantProvider> providers,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates,
      Map<String, Restaurant> externalOnlyRestaurants) {
    if (maxCandidates <= 0) {
      return false;
    }
    boolean hasAvailableProvider = false;
    for (ExternalRestaurantProvider provider : providers) {
      if (!provider.isAvailable()) {
        logger.warn("External restaurant provider is not available: {}.", provider.getClass().getSimpleName());
        continue;
      }
      hasAvailableProvider = true;
      try {
        List<Restaurant> externalRestaurants = provider.searchRandomCandidates(
            area,
            genre,
            budgetMin,
            budgetMax,
            latitude,
            longitude,
            range,
            maxCandidates);
        externalRestaurants.forEach(restaurant -> putIfUnique(externalOnlyRestaurants, restaurant));
      } catch (RuntimeException exception) {
        logger.warn("External restaurant provider failed: {}", provider.getClass().getSimpleName(), exception);
      }
    }

    return hasAvailableProvider;
  }

  public void cacheForUserAction(Restaurant restaurant) {
    if (shouldPersistRestaurant(restaurant)) {
      restaurantRepository.saveAll(List.of(restaurant));
    }
  }

  public boolean shouldPersistRestaurant(Restaurant restaurant) {
    return restaurant != null && "RANDISH_SEED".equalsIgnoreCase(restaurant.externalProvider());
  }

  public Optional<Restaurant> findExternalByProviderPlaceId(
      String provider,
      String providerPlaceId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    if (provider == null || provider.isBlank() || providerPlaceId == null || providerPlaceId.isBlank()) {
      return Optional.empty();
    }
    return externalRestaurantProviders.stream()
        .filter(ExternalRestaurantProvider::isAvailable)
        .filter(externalProvider -> provider.equalsIgnoreCase(externalProvider.providerKey()))
        .map(externalProvider -> externalProvider.findByExternalId(providerPlaceId, savedArea, savedGenre, savedBudgetMin, savedBudgetMax))
        .filter(Optional::isPresent)
        .map(Optional::get)
        .findFirst();
  }

  /**
   * 何件まで返すか。
   *
   * <p>Google をどう使うかと同じ区分で決めている。FILL_SHORTFALL は Premium と dev だけなので、
   * 判定をもう一本増やさずに済む。区分の意味を変えるときは、こちらも一緒に見ること。
   */
  private int targetResultCount(GooglePlacesUsage usage) {
    return usage == GooglePlacesUsage.FILL_SHORTFALL
        ? PREMIUM_TARGET_RESULT_COUNT
        : HYBRID_TARGET_RESULT_COUNT;
  }

  /**
   * Google Places から何件取るか。0なら引かない。
   *
   * <p>ここが従量課金の入口なので、判断を1か所にまとめている。
   */
  private int googlePlacesFetchLimit(
      GooglePlacesUsage usage, int currentResultCount, int targetResultCount) {
    return switch (usage) {
      case NONE -> 0;
      // 他が1件でも返せているなら引かない。無料枠でGoogleに行くのは空振りのときだけ。
      case ONLY_WHEN_EMPTY -> currentResultCount == 0 ? MAX_FALLBACK_FILL_COUNT : 0;
      case FILL_SHORTFALL -> fallbackCandidateLimit(targetResultCount, currentResultCount);
    };
  }

  private int fallbackCandidateLimit(int targetResultCount, int currentResultCount) {
    int missingCount = targetResultCount - currentResultCount;
    if (missingCount <= 0) {
      return 0;
    }
    return Math.min(missingCount, MAX_FALLBACK_FILL_COUNT);
  }

  private boolean hasCoordinates(Double latitude, Double longitude) {
    return latitude != null && longitude != null;
  }

  /**
   * 近くで見つからなかったときに、距離だけ広げて引き直してよいかを返す。
   *
   * <p>以前はここで座標そのものを捨てて引き直していた。結果として島根から引いても
   * 大阪の店が並ぶという、利用者から見れば明確な誤りが起きていた。
   * 見つからないことより、違う場所を出すことのほうが困る。
   */
  private boolean shouldWidenRange(Double latitude, Double longitude, Integer range) {
    return hasCoordinates(latitude, longitude) && (range == null || range < WIDEST_RANGE);
  }

  private List<Restaurant> limitedCandidates(Map<String, Restaurant> restaurants, int maxCandidates) {
    return restaurants.values().stream()
        .limit(Math.max(1, maxCandidates))
        .toList();
  }

  private void putIfUnique(Map<String, Restaurant> restaurants, Restaurant candidate) {
    boolean alreadyPresent = restaurants.values().stream().anyMatch(existing -> isSameRestaurant(existing, candidate));
    if (!alreadyPresent) {
      restaurants.put(candidate.id(), candidate);
    }
  }

  private boolean isSameRestaurant(Restaurant first, Restaurant second) {
    String firstName = normalizeComparableText(first.name());
    String secondName = normalizeComparableText(second.name());
    if (firstName.isBlank() || secondName.isBlank()) {
      return false;
    }
    if (firstName.equals(secondName)) {
      return true;
    }

    String firstAddress = normalizeComparableText(first.address());
    String secondAddress = normalizeComparableText(second.address());
    Integer distanceMeters = distanceMeters(first.latitude(), first.longitude(), second.latitude(), second.longitude());
    if (distanceMeters != null
        && distanceMeters <= DUPLICATE_DISTANCE_METERS
        && (firstName.contains(secondName)
            || secondName.contains(firstName)
            || (!firstAddress.isBlank()
                && !secondAddress.isBlank()
                && (firstAddress.contains(secondAddress) || secondAddress.contains(firstAddress))))) {
      return true;
    }

    return !firstAddress.isBlank()
        && !secondAddress.isBlank()
        && (firstAddress.contains(secondAddress) || secondAddress.contains(firstAddress))
        && (firstName.contains(secondName) || secondName.contains(firstName));
  }

  private String normalizeComparableText(String value) {
    if (value == null) {
      return "";
    }
    return value.toLowerCase(Locale.ROOT)
        .replaceAll("\\s+", "")
        .replaceAll("[\\p{Punct}　－ー・ｰ]", "");
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

  public Restaurant getEntityOrThrow(String id) {
    String cleanId = validationService.requireRestaurantId(id);
    return restaurantRepository.findById(cleanId)
        .orElseThrow(() -> new NotFoundException("Restaurant not found: " + cleanId));
  }

  public RestaurantResponse findById(String id) {
    return mapper.toRestaurantResponse(getEntityOrThrow(id));
  }
}
