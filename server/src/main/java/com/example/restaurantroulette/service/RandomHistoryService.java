package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.entity.RandomHistory;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.repository.RandomHistoryRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class RandomHistoryService {
  private final RandomHistoryRepository randomHistoryRepository;
  private final RestaurantQueryService restaurantQueryService;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public RandomHistoryService(
      RandomHistoryRepository randomHistoryRepository,
      RestaurantQueryService restaurantQueryService,
      DtoMapper mapper,
      ValidationService validationService) {
    this.randomHistoryRepository = randomHistoryRepository;
    this.restaurantQueryService = restaurantQueryService;
    this.mapper = mapper;
    this.validationService = validationService;
  }

  public RandomHistoryResponse create(RandomHistoryCreateRequest request) {
    validationService.requireUserId(request.userId());
    validationService.requireRestaurantId(request.restaurantId());
    validationService.validateBudget(request.budgetMin(), request.budgetMax());
    Restaurant restaurant = restaurantQueryService.getEntityOrThrow(request.restaurantId());
    RandomHistory history = new RandomHistory(
        UUID.randomUUID().toString(),
        request.userId(),
        request.restaurantId(),
        request.area(),
        request.genre(),
        request.budgetMin(),
        request.budgetMax(),
        Instant.now());
    return mapper.toRandomHistoryResponse(randomHistoryRepository.save(history), restaurant);
  }

  public List<RandomHistoryResponse> findByUserId(String userId) {
    validationService.requireUserId(userId);
    return randomHistoryRepository.findByUserId(userId).stream()
        .map(history -> mapper.toRandomHistoryResponse(history, restaurantQueryService.getEntityOrThrow(history.restaurantId())))
        .toList();
  }

  public List<RandomHistory> findRecentEntities(String userId, int limit) {
    validationService.requireUserId(userId);
    return randomHistoryRepository.findByUserId(userId).stream().limit(limit).toList();
  }
}
