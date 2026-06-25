package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.RandomHistory;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.RandomHistoryRepository;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
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
    String userId = validationService.requirePersistentUserId(request.userId());
    String restaurantId = validationService.cleanOptionalText("restaurantId", request.restaurantId(), 120);
    String provider = validationService.optionalProvider(request.provider());
    String providerPlaceId = validationService.optionalProviderPlaceId(request.providerPlaceId());
    validationService.validateBudget(request.budgetMin(), request.budgetMax());
    String area = validationService.optionalSearchText("area", request.area());
    String genre = validationService.optionalSearchText("genre", request.genre());
    Integer rangeMeters = validationService.optionalPositiveInteger("rangeMeters", request.rangeMeters());
    Restaurant restaurant = null;
    if (restaurantId != null) {
      restaurantId = validationService.requireRestaurantId(restaurantId);
      restaurant = restaurantQueryService.getEntityOrThrow(restaurantId);
      if (provider == null) {
        provider = restaurant.externalProvider();
      }
      if (providerPlaceId == null) {
        providerPlaceId = restaurant.externalId();
      }
    }
    if (provider == null || providerPlaceId == null) {
      throw new BadRequestException("provider and providerPlaceId are required.");
    }
    String normalizedProvider = provider.trim().toUpperCase(Locale.ROOT);
    String normalizedProviderPlaceId = providerPlaceId.trim();
    boolean persistRestaurantId = shouldPersistRestaurantId(normalizedProvider);
    RandomHistory history = new RandomHistory(
        UUID.randomUUID().toString(),
        userId,
        persistRestaurantId ? restaurantId : null,
        normalizedProvider,
        normalizedProviderPlaceId,
        area,
        genre,
        request.budgetMin(),
        request.budgetMax(),
        rangeMeters,
        Instant.now());
    return mapper.toRandomHistoryResponse(randomHistoryRepository.save(history), persistRestaurantId ? restaurant : null);
  }

  public List<RandomHistoryResponse> findByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return randomHistoryRepository.findByUserId(cleanUserId).stream()
        .map(history -> mapper.toRandomHistoryResponse(history, findLocalRestaurantForList(history)))
        .toList();
  }

  public List<RandomHistory> findRecentEntities(String userId, int limit) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return randomHistoryRepository.findByUserId(cleanUserId).stream().limit(limit).toList();
  }

  public String findOwnerUserId(String id) {
    return randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id))
        .userId();
  }

  public RestaurantResponse findRestaurant(String id) {
    RandomHistory history = randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id));
    Restaurant restaurant = resolveHistoryRestaurant(history);
    return mapper.toRestaurantResponse(restaurant);
  }

  private Restaurant findLocalRestaurantForList(RandomHistory history) {
    if (history.restaurantId() == null || !shouldPersistRestaurantId(history.provider())) {
      return null;
    }
    return restaurantQueryService.getEntityOrThrow(history.restaurantId());
  }

  private Restaurant resolveHistoryRestaurant(RandomHistory history) {
    if (history.restaurantId() != null && shouldPersistRestaurantId(history.provider())) {
      return restaurantQueryService.getEntityOrThrow(history.restaurantId());
    }
    return restaurantQueryService.findExternalByProviderPlaceId(
            history.provider(),
            history.providerPlaceId(),
            history.area(),
            history.genre(),
            history.budgetMin(),
            history.budgetMax())
        .orElseThrow(() -> new NotFoundException("Random history restaurant details are not available: " + history.id()));
  }

  private boolean shouldPersistRestaurantId(String provider) {
    return provider == null || provider.equalsIgnoreCase("RANDISH_SEED");
  }
}
