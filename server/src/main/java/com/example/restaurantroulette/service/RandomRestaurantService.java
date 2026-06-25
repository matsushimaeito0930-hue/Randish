package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
import java.util.List;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class RandomRestaurantService {
  private static final int RECENT_HISTORY_LIMIT = 100;
  private static final int RANDOM_CANDIDATE_POOL_LIMIT = 360;

  private final RestaurantQueryService restaurantQueryService;
  private final RandomHistoryService randomHistoryService;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public RandomRestaurantService(
      RestaurantQueryService restaurantQueryService,
      RandomHistoryService randomHistoryService,
      DtoMapper mapper,
      ValidationService validationService) {
    this.restaurantQueryService = restaurantQueryService;
    this.randomHistoryService = randomHistoryService;
    this.mapper = mapper;
    this.validationService = validationService;
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
    List<Restaurant> lotteryPool = preferredCandidates.isEmpty() ? candidates : preferredCandidates;
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
    return mapper.toRestaurantResponse(selected);
  }

  private String historyKey(String provider, String providerPlaceId) {
    return "%s:%s".formatted(
        provider == null ? "" : provider.trim().toUpperCase(),
        providerPlaceId == null ? "" : providerPlaceId.trim());
  }
}
