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
import org.springframework.stereotype.Service;

@Service
public class RandomRestaurantService {
  private static final int RECENT_HISTORY_LIMIT = 5;

  private final RestaurantQueryService restaurantQueryService;
  private final RandomHistoryService randomHistoryService;
  private final DtoMapper mapper;
  private final ValidationService validationService;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

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

  public RestaurantResponse choose(RandomRestaurantRequest request) {
    validationService.requireUserId(request.userId());
    validationService.validateBudget(request.budgetMin(), request.budgetMax());
    List<Restaurant> candidates = restaurantQueryService.searchEntities(
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax(),
        request.latitude(),
        request.longitude(),
        request.range());
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

    randomHistoryService.create(new RandomHistoryCreateRequest(
        request.userId(),
        selected.id(),
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax()));
    return googlePlacesEnrichmentService.enrich(mapper.toRestaurantResponse(selected));
  }
}
