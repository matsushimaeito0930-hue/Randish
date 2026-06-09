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
    validationService.requireUserId(request.userId());
    Restaurant localRestaurant = null;
    String restaurantId = clean(request.restaurantId());
    String provider = clean(request.provider());
    String providerPlaceId = clean(request.providerPlaceId());

    if (restaurantId != null) {
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
    favoriteRepository.findByUserIdAndProviderPlaceId(request.userId(), normalizedProvider, normalizedProviderPlaceId)
        .ifPresent(favorite -> {
          throw new ConflictException("Restaurant is already registered as favorite.");
        });
    FavoriteRestaurant favorite = new FavoriteRestaurant(
        UUID.randomUUID().toString(),
        request.userId(),
        normalizedProvider,
        normalizedProviderPlaceId,
        shouldPersistRestaurantId(normalizedProvider) ? restaurantId : null,
        clean(request.savedArea()),
        clean(request.savedGenre()),
        request.savedBudgetMin(),
        request.savedBudgetMax(),
        clean(request.userMemo()),
        clean(request.userTags()),
        Instant.now());
    return mapper.toFavoriteResponse(favoriteRepository.save(favorite), shouldPersistRestaurantId(normalizedProvider) ? localRestaurant : null);
  }

  public void delete(String id) {
    favoriteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Favorite not found: " + id));
    favoriteRepository.deleteById(id);
  }

  public List<FavoriteResponse> findByUserId(String userId) {
    validationService.requireUserId(userId);
    return favoriteRepository.findByUserId(userId).stream()
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
    validationService.requireUserId(userId);
    validationService.requireRestaurantId(restaurantId);
    restaurantQueryService.getEntityOrThrow(restaurantId);
    return favoriteRepository.findByUserIdAndRestaurantId(userId, restaurantId)
        .map(favorite -> new FavoriteCheckResponse(true, favorite.id()))
        .orElseGet(() -> new FavoriteCheckResponse(false, null));
  }

  public long countByUserId(String userId) {
    validationService.requireUserId(userId);
    return favoriteRepository.findByUserId(userId).size();
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

  private String clean(String value) {
    if (value == null) {
      return null;
    }
    String trimmed = value.trim();
    return trimmed.isEmpty() ? null : trimmed;
  }
}
