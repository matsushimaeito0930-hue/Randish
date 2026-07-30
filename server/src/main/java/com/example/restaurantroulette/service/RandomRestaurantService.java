package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
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

  @Autowired
  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.restaurantQueryService = restaurantQueryService;
    this.randomHistoryService = randomHistoryService;
    this.mapper = mapper;
    this.validationService = validationService;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
  }

  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService) {
    this(restaurantQueryService, randomHistoryService, mapper, validationService, null);
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
        RANDOM_CANDIDATE_POOL_LIMIT);
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

    Set<String> recentRestaurantIds = validationService.isGuestUserId(userId)
        ? Set.of()
        : randomHistoryService.findRecentEntities(userId, RECENT_HISTORY_LIMIT).stream()
            .map(history -> historyKey(history.provider(), history.providerPlaceId()))
            .collect(Collectors.toSet());
    List<Restaurant> preferredCandidates = candidates.stream()
        .filter(restaurant -> !recentRestaurantIds.contains(historyKey(restaurant.externalProvider(), restaurant.externalId())))
        .toList();
    List<Restaurant> freshCandidatePool = preferredCandidates.isEmpty() ? candidates : preferredCandidates;
    List<Restaurant> freshCandidatesWithPhotos = freshCandidatePool.stream()
        .filter(restaurant -> restaurant.photoUrl() != null && !restaurant.photoUrl().isBlank())
        .toList();
    List<Restaurant> allCandidatesWithPhotos = candidates.stream()
        .filter(restaurant -> restaurant.photoUrl() != null && !restaurant.photoUrl().isBlank())
        .toList();
    List<Restaurant> lotteryPool = !freshCandidatesWithPhotos.isEmpty()
        ? freshCandidatesWithPhotos
        : !allCandidatesWithPhotos.isEmpty() ? allCandidatesWithPhotos : freshCandidatePool;
    Restaurant selected = lotteryPool.get(ThreadLocalRandom.current().nextInt(lotteryPool.size()));

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
