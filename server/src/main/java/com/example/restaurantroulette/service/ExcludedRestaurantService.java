package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.ExcludedRestaurantCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.ExcludedRestaurantResponse;
import com.example.restaurantroulette.entity.ExcludedRestaurant;
import com.example.restaurantroulette.exception.BadRequestException;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.ExcludedRestaurantRepository;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.stereotype.Service;

/**
 * 出したくない店の管理。
 *
 * <p>「同じ店ばかり当たる」を利用者側から断てるようにするための機能。
 * 抽選の重み付けをこちらで勝手に調整するより、本人が外せるほうが分かりやすい。
 */
@Service
public class ExcludedRestaurantService {
  private final ExcludedRestaurantRepository excludedRepository;
  private final ValidationService validationService;

  public ExcludedRestaurantService(
      ExcludedRestaurantRepository excludedRepository,
      ValidationService validationService) {
    this.excludedRepository = excludedRepository;
    this.validationService = validationService;
  }

  public ExcludedRestaurantResponse create(ExcludedRestaurantCreateRequest request) {
    String userId = validationService.requirePersistentUserId(request.userId());
    String provider = validationService.optionalProvider(request.provider());
    String providerPlaceId = validationService.optionalProviderPlaceId(request.providerPlaceId());
    if (provider == null || providerPlaceId == null) {
      throw new BadRequestException("provider and providerPlaceId are required.");
    }
    ExcludedRestaurant saved = excludedRepository.save(new ExcludedRestaurant(
        UUID.randomUUID().toString(),
        userId,
        provider.trim().toUpperCase(),
        providerPlaceId.trim(),
        validationService.cleanOptionalText("restaurantName", request.restaurantName(), 255),
        validationService.cleanOptionalText("reason", request.reason(), 255),
        Instant.now()));
    return toResponse(saved);
  }

  public List<ExcludedRestaurantResponse> findByUserId(String userId) {
    String cleanUserId = validationService.requirePersistentUserId(userId);
    return excludedRepository.findByUserId(cleanUserId).stream()
        .map(this::toResponse)
        .toList();
  }

  public String findOwnerUserId(String id) {
    return excludedRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Excluded restaurant not found: " + id))
        .userId();
  }

  public void delete(String id) {
    excludedRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Excluded restaurant not found: " + id));
    excludedRepository.delete(id);
  }

  private ExcludedRestaurantResponse toResponse(ExcludedRestaurant excluded) {
    return new ExcludedRestaurantResponse(
        excluded.id(),
        excluded.userId(),
        excluded.provider(),
        excluded.providerPlaceId(),
        excluded.restaurantName(),
        excluded.reason(),
        excluded.createdAt());
  }
}
