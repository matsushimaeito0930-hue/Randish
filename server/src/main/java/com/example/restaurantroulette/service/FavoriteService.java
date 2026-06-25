package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.FavoriteRestaurant;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.ConflictException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.FavoriteRestaurantRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

@Service
public class FavoriteService {
  private final FavoriteRestaurantRepository favoriteRepository;
  private final RestaurantQueryService restaurantQueryService;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public FavoriteService(
      FavoriteRestaurantRepository favoriteRepository,
      RestaurantQueryService restaurantQueryService,
      DtoMapper mapper,
      ValidationService validationService) {
    this.favoriteRepository = favoriteRepository;
    this.restaurantQueryService = restaurantQueryService;
    this.mapper = mapper;
    this.validationService = validationService;
  }

  public FavoriteResponse create(FavoriteCreateRequest request) {
    String userId = validationService.requirePersistentUserId(request.userId());
    Restaurant localRestaurant = null;
    String restaurantId = validationService.cleanOptionalText("restaurantId", request.restaurantId(), 120);
    String provider = validationService.optionalProvider(request.provider());
    String providerPlaceId = validationService.optionalProviderPlaceId(request.providerPlaceId());
    validationService.validateBudget(request.savedBudgetMin(), request.savedBudgetMax());
    Integer savedRangeMeters = validationService.optionalPositiveInteger("savedRangeMeters", request.savedRangeMeters());

    if (restaurantId != null) {
      restaurantId = validationService.requireRestaurantId(restaurantId);
      localRestaurant = restaurantQueryService.getEntityOrThrow(restaurantId);
      if (provider == null) {
        provider = localRestaurant.externalProvider();
      }
      if (providerPlaceId == null) {
        providerPlaceId = localRestaurant.externalId();
      }
    }

    if (provider == null || providerPlaceId == null) {
      throw new BadRequestException("provider and providerPlaceId are required.");
    }

    String normalizedProvider = provider.trim().toUpperCase();
    String normalizedProviderPlaceId = providerPlaceId.trim();
    favoriteRepository.findByUserIdAndProviderPlaceId(userId, normalizedProvider, normalizedProviderPlaceId)
        .ifPresent(favorite -> {
          throw new ConflictException("Restaurant is already registered as favorite.");
        });
    FavoriteRestaurant favorite = new FavoriteRestaurant(
        UUID.randomUUID().toString(),
        userId,
        normalizedProvider,
        normalizedProviderPlaceId,
        shouldPersistRestaurantId(normalizedProvider) ? restaurantId : null,
        validationService.optionalSearchText("savedArea", request.savedArea()),
        validationService.optionalSearchText("savedGenre", request.savedGenre()),
        request.savedBudgetMin(),
        request.savedBudgetMax(),
        savedRangeMeters,
        validationService.optionalNote("userMemo", request.userMemo()),
        validationService.optionalNote("userTags", request.userTags()),
        Instant.now());
    return mapper.toFavoriteResponse(favoriteRepository.save(favorite), shouldPersistRestaurantId(normalizedProvider) ? localRestaurant : null);
  }

  public void delete(String id) {
    favoriteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Favorite not found: " + id));
    favoriteRepository.deleteById(id);
  }

  public String findOwnerUserId(String id) {
    return favoriteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Favorite not found: " + id))
        .userId();
  }

  public List<FavoriteResponse> findByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return favoriteRepository.findByUserId(cleanUserId).stream()
        .map(favorite -> mapper.toFavoriteResponse(favorite, findLocalRestaurantForList(favorite)))
        .toList();
  }

  public RestaurantResponse findRestaurant(String id) {
    FavoriteRestaurant favorite = favoriteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Favorite not found: " + id));
    Restaurant restaurant = resolveFavoriteRestaurant(favorite);
    return mapper.toRestaurantResponse(restaurant);
  }

  public FavoriteCheckResponse check(String userId, String restaurantId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    String cleanRestaurantId = validationService.requireRestaurantId(restaurantId);
    restaurantQueryService.getEntityOrThrow(cleanRestaurantId);
    return favoriteRepository.findByUserIdAndRestaurantId(cleanUserId, cleanRestaurantId)
        .map(favorite -> new FavoriteCheckResponse(true, favorite.id()))
        .orElseGet(() -> new FavoriteCheckResponse(false, null));
  }

  public long countByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return favoriteRepository.findByUserId(cleanUserId).size();
  }

  private Restaurant findLocalRestaurantForList(FavoriteRestaurant favorite) {
    if (favorite.restaurantId() == null || !shouldPersistRestaurantId(favorite.provider())) {
      return null;
    }
    return restaurantQueryService.getEntityOrThrow(favorite.restaurantId());
  }

  private Restaurant resolveFavoriteRestaurant(FavoriteRestaurant favorite) {
    if (favorite.restaurantId() != null && shouldPersistRestaurantId(favorite.provider())) {
      return restaurantQueryService.getEntityOrThrow(favorite.restaurantId());
    }

    return restaurantQueryService.findExternalByProviderPlaceId(
            favorite.provider(),
            favorite.providerPlaceId(),
            favorite.savedArea(),
            favorite.savedGenre(),
            favorite.savedBudgetMin(),
            favorite.savedBudgetMax())
        .orElseThrow(() -> new NotFoundException("Favorite restaurant details are not available: " + favorite.id()));
  }

  private boolean shouldPersistRestaurantId(String provider) {
    return provider == null || provider.equalsIgnoreCase("RANDISH_SEED");
  }
}
