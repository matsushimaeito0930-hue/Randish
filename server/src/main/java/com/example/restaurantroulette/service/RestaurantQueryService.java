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
  private static final int HYBRID_TARGET_RESULT_COUNT = 100;
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
    return searchEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range).stream()
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

    int fallbackLimit = fallbackCandidateLimit(desiredCandidateCount, externalOnlyRestaurants.size());
    if (allowFallbackProviders && fallbackLimit > 0) {
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
      return limitedCandidates(externalOnlyRestaurants, desiredCandidateCount);
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
    return searchEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range, false);
  }

  public List<Restaurant> searchEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      boolean allowFallbackProviders) {
    validationService.validateSearchRequest(area, genre, budgetMin, budgetMax, latitude, longitude, range);

    // 同じ条件での引き直しは外部APIへ行かない。
    // 家や職場から繰り返し使うのが普通なので、毎回取り直すと待たせるうえ課金も積み上がる。
    if (searchCacheService == null) {
      return searchEntitiesFromProviders(
          area, genre, budgetMin, budgetMax, latitude, longitude, range, allowFallbackProviders);
    }
    String cacheKey = searchCacheService.buildKey(area, genre, budgetMin, budgetMax, latitude, longitude, range);
    Optional<List<Restaurant>> cached = searchCacheService.find(cacheKey);
    if (cached.isPresent()) {
      return cached.get();
    }
    List<Restaurant> freshResults = searchEntitiesFromProviders(
        area, genre, budgetMin, budgetMax, latitude, longitude, range, allowFallbackProviders);
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
      boolean allowFallbackProviders) {
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

    int fallbackLimit = fallbackCandidateLimit(HYBRID_TARGET_RESULT_COUNT, externalOnlyRestaurants.size());
    if (allowFallbackProviders && fallbackLimit > 0) {
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
      return limitedCandidates(externalOnlyRestaurants, HYBRID_TARGET_RESULT_COUNT);
    }

    if (hasCoordinates(latitude, longitude)) {
      return List.of();
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
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
