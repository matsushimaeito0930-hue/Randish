package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.RandomHistory;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.service.RestaurantQueryService.GooglePlacesUsage;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class RandomRestaurantService {
  private static final int RECENT_HISTORY_LIMIT = 100;
  private static final int RANDOM_CANDIDATE_POOL_LIMIT = 360;

  private final RestaurantQueryService restaurantQueryService;
  private final RandomHistoryService randomHistoryService;
  private final DtoMapper mapper;
  private final ValidationService validationService;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;
  private final PremiumService premiumService;

  @Autowired
  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService,
      PremiumService premiumService) {
    this.restaurantQueryService = restaurantQueryService;
    this.randomHistoryService = randomHistoryService;
    this.mapper = mapper;
    this.validationService = validationService;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
    this.premiumService = premiumService;
  }

  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService) {
    this(restaurantQueryService, randomHistoryService, mapper, validationService, null, null);
  }

  /** 課金状態を見ない形。テストなど、権限の判定が本筋でない場面のために残している。 */
  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this(restaurantQueryService, randomHistoryService, mapper, validationService,
        googlePlacesEnrichmentService, null);
  }

  /**
   * この抽選で Google Places をどこまで使うか。
   *
   * <p>従量課金なのは Google だけなので、Premium と dev は候補の不足分を補う形で使い、
   * 無料とゲストは他が1件も返せなかったときだけ使う。呼び出し元（コントローラ）で
   * 本人確認は済んでいる。
   */
  private GooglePlacesUsage googlePlacesUsageFor(String userId) {
    if (premiumService == null) {
      return GooglePlacesUsage.ONLY_WHEN_EMPTY;
    }
    try {
      return premiumService.status(userId).isPro()
          ? GooglePlacesUsage.FILL_SHORTFALL
          : GooglePlacesUsage.ONLY_WHEN_EMPTY;
    } catch (RuntimeException exception) {
      return GooglePlacesUsage.ONLY_WHEN_EMPTY;
    }
  }

  public RestaurantResponse choose(RandomRestaurantRequest request) {
    String userId = validationService.requireUserId(request.userId());
    validationService.validateSearchRequest(
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax(),
        request.latitude(),
        request.longitude(),
        request.range());
    Integer distanceMeters = validationService.optionalPositiveInteger("distanceMeters", request.distanceMeters());
    List<Restaurant> candidates = restaurantQueryService.searchRandomEntities(
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax(),
        request.latitude(),
        request.longitude(),
        request.range(),
        RANDOM_CANDIDATE_POOL_LIMIT,
        googlePlacesUsageFor(userId));
    if (request.latitude() != null && request.longitude() != null && distanceMeters != null) {
      candidates = candidates.stream()
          .filter(restaurant -> restaurant.latitude() != null && restaurant.longitude() != null)
          .filter(restaurant -> distanceMeters(
              request.latitude(),
              request.longitude(),
              restaurant.latitude(),
              restaurant.longitude()) <= distanceMeters)
          .toList();
    }
    if (candidates.isEmpty()) {
      throw new NotFoundException("No restaurants match the requested conditions.");
    }

    List<RandomHistory> recentHistories = validationService.isGuestUserId(userId)
        ? List.of()
        : randomHistoryService.findRecentEntities(userId, RECENT_HISTORY_LIMIT);
    Set<String> recentRestaurantIds = recentHistories.stream()
        .map(history -> historyKey(history.provider(), history.providerPlaceId()))
        .collect(Collectors.toSet());
    // 直前に引いた店（履歴の先頭 = 最新）は「もう一回引く」で連続して出さない。
    String lastDrawnKey = recentHistories.isEmpty()
        ? null
        : historyKey(recentHistories.get(0).provider(), recentHistories.get(0).providerPlaceId());
    List<Restaurant> preferredCandidates = candidates.stream()
        .filter(restaurant -> !recentRestaurantIds.contains(historyKey(restaurant.externalProvider(), restaurant.externalId())))
        .toList();
    List<Restaurant> freshCandidatePool = preferredCandidates.isEmpty() ? candidates : preferredCandidates;
    // 以前は「写真がある候補」だけを抽選対象にしていたため、
    // 写真を持たない提供元（Geoapify など）が多いと、写真付きの数店だけが延々と繰り返し当たっていた。
    // 条件に合う候補は全て当たるようにしつつ、写真付きを少しだけ出やすくする重み付け抽選にする。
    List<Restaurant> lotteryPool = freshCandidatePool.isEmpty() ? candidates : freshCandidatePool;
    if (lastDrawnKey != null && lotteryPool.size() > 1) {
      List<Restaurant> withoutLastDrawn = lotteryPool.stream()
          .filter(restaurant ->
              !lastDrawnKey.equals(historyKey(restaurant.externalProvider(), restaurant.externalId())))
          .toList();
      if (!withoutLastDrawn.isEmpty()) {
        lotteryPool = withoutLastDrawn;
      }
    }
    Restaurant selected = pickWeightedByPhoto(lotteryPool);

    restaurantQueryService.cacheForUserAction(selected);
    if (!validationService.isGuestUserId(userId)) {
      randomHistoryService.create(new RandomHistoryCreateRequest(
          userId,
          restaurantQueryService.shouldPersistRestaurant(selected) ? selected.id() : null,
          selected.externalProvider(),
          selected.externalId(),
          request.area(),
          request.genre(),
          request.budgetMin(),
          request.budgetMax(),
          distanceMeters));
    }
    RestaurantResponse response = mapper.toRestaurantResponse(selected);
    return googlePlacesEnrichmentService == null ? response : googlePlacesEnrichmentService.enrich(response);
  }

  /**
   * 候補全体から1件を抽選する。写真がある店は少しだけ当たりやすくするが、
   * 写真が無い店も必ず当たり得るようにして、同じ数店だけが繰り返されるのを防ぐ。
   */
  private Restaurant pickWeightedByPhoto(List<Restaurant> pool) {
    final int photoWeight = 3;
    final int noPhotoWeight = 1;
    int totalWeight = 0;
    for (Restaurant restaurant : pool) {
      totalWeight += hasPhoto(restaurant) ? photoWeight : noPhotoWeight;
    }
    if (totalWeight <= 0) {
      return pool.get(ThreadLocalRandom.current().nextInt(pool.size()));
    }
    int target = ThreadLocalRandom.current().nextInt(totalWeight);
    for (Restaurant restaurant : pool) {
      target -= hasPhoto(restaurant) ? photoWeight : noPhotoWeight;
      if (target < 0) {
        return restaurant;
      }
    }
    return pool.get(pool.size() - 1);
  }

  private boolean hasPhoto(Restaurant restaurant) {
    return restaurant.photoUrl() != null && !restaurant.photoUrl().isBlank();
  }

  private String historyKey(String provider, String providerPlaceId) {
    return "%s:%s".formatted(
        provider == null ? "" : provider.trim().toUpperCase(),
        providerPlaceId == null ? "" : providerPlaceId.trim());
  }

  private int distanceMeters(double fromLatitude, double fromLongitude, double toLatitude, double toLongitude) {
    double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(toLatitude - fromLatitude);
    double longitudeDelta = Math.toRadians(toLongitude - fromLongitude);
    double fromLatitudeRad = Math.toRadians(fromLatitude);
    double toLatitudeRad = Math.toRadians(toLatitude);
    double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad)
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return (int) Math.round(earthRadiusMeters * 2
        * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }
}
