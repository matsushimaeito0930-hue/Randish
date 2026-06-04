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
    validationService.requireUserId(request.userId());
    validationService.validateBudget(request.budgetMin(), request.budgetMax());
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

    Set<String> recentRestaurantIds = randomHistoryService.findRecentEntities(request.userId(), RECENT_HISTORY_LIMIT).stream()
        .map(history -> history.restaurantId())
        .collect(Collectors.toSet());
    List<Restaurant> preferredCandidates = candidates.stream()
        .filter(restaurant -> !recentRestaurantIds.contains(restaurant.id()))
        .toList();
    List<Restaurant> lotteryPool = preferredCandidates.isEmpty() ? candidates : preferredCandidates;
    Restaurant selected = lotteryPool.get(ThreadLocalRandom.current().nextInt(lotteryPool.size()));

    restaurantQueryService.cacheForUserAction(selected);
    randomHistoryService.create(new RandomHistoryCreateRequest(
        request.userId(),
        selected.id(),
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax()));
    return mapper.toRestaurantResponse(selected);
  }
}
