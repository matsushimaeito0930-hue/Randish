package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.entity.FavoriteRestaurant;
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
    validationService.requireRestaurantId(request.restaurantId());
    var restaurant = restaurantQueryService.getEntityOrThrow(request.restaurantId());
    favoriteRepository.findByUserIdAndRestaurantId(request.userId(), request.restaurantId())
        .ifPresent(favorite -> {
          throw new ConflictException("Restaurant is already registered as favorite.");
        });
    FavoriteRestaurant favorite = new FavoriteRestaurant(UUID.randomUUID().toString(), request.userId(), request.restaurantId(), Instant.now());
    return mapper.toFavoriteResponse(favoriteRepository.save(favorite), restaurant);
  }

  public void delete(String id) {
    favoriteRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Favorite not found: " + id));
    favoriteRepository.deleteById(id);
  }

  public List<FavoriteResponse> findByUserId(String userId) {
    validationService.requireUserId(userId);
    return favoriteRepository.findByUserId(userId).stream()
        .map(favorite -> mapper.toFavoriteResponse(favorite, restaurantQueryService.getEntityOrThrow(favorite.restaurantId())))
        .toList();
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
}
