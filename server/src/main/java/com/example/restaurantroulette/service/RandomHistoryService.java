package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryRatingRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistorySpendRequest;
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
        null,
        // 実際の支払額は、あとから本人が入れる。抽選した時点では分からない。
        null,
        Instant.now());
    return mapper.toRandomHistoryResponse(randomHistoryRepository.save(history), persistRestaurantId ? restaurant : null);
  }

  /**
   * 実際に払った額を記録する。
   *
   * <p>分析に出していた金額は、店の予算帯から作った推定だけだった。価格を持たない
   * 提供元の店は推定すらできず、外食32回のうち18回ぶんしか集計に入らない状態になる。
   * 本人が入れた額があれば、そちらを使う。
   */
  public RandomHistoryResponse updateActualSpend(String id, RandomHistorySpendRequest request) {
    // updateRating と同じく、存在確認を兼ねて先に引く。
    randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id));
    Integer actualSpend = request == null ? null : request.actualSpend();
    // 0は「0円だった」ではなく「消したい」として扱う。
    Integer normalized = actualSpend == null || actualSpend <= 0 ? null : actualSpend;
    if (normalized != null && normalized > 1_000_000) {
      throw new BadRequestException("actualSpend must be 1,000,000 or less.");
    }
    randomHistoryRepository.updateActualSpend(id, normalized);
    RandomHistory updated = randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id));
    return mapper.toRandomHistoryResponse(updated, findLocalRestaurantForList(updated));
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

  public RandomHistoryResponse updateRating(String id, RandomHistoryRatingRequest request) {
    RandomHistory history = randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id));
    Integer rating = request == null ? null : request.rating();
    Integer normalizedRating = rating == null || rating == 0 ? null : rating;
    if (normalizedRating != null && (normalizedRating < 1 || normalizedRating > 5)) {
      throw new BadRequestException("rating must be between 1 and 5, or 0 to clear.");
    }
    randomHistoryRepository.updateUserRating(id, normalizedRating);
    RandomHistory updated = randomHistoryRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Random history not found: " + id));
    return mapper.toRandomHistoryResponse(updated, findLocalRestaurantForList(updated));
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
