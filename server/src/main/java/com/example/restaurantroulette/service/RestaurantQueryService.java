package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.RestaurantRepository;
import com.example.restaurantroulette.service.external.ExternalRestaurantProvider;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class RestaurantQueryService {
  private static final Logger logger = LoggerFactory.getLogger(RestaurantQueryService.class);
  private static final int HYBRID_TARGET_RESULT_COUNT = 100;
  private static final int MAX_FALLBACK_FILL_COUNT = 30;
  private static final int DUPLICATE_DISTANCE_METERS = 60;

  private final RestaurantRepository restaurantRepository;
  private final List<ExternalRestaurantProvider> externalRestaurantProviders;
  private final DtoMapper mapper;
  private final ValidationService validationService;

  public RestaurantQueryService(
      RestaurantRepository restaurantRepository,
      List<ExternalRestaurantProvider> externalRestaurantProviders,
      DtoMapper mapper,
      ValidationService validationService) {
    this.restaurantRepository = restaurantRepository;
    this.externalRestaurantProviders = externalRestaurantProviders;
    this.mapper = mapper;
    this.validationService = validationService;
  }

  public List<RestaurantResponse> search(String area, String genre, Integer budgetMin, Integer budgetMax) {
    return search(area, genre, budgetMin, budgetMax, null, null, null);
  }

  public List<RestaurantResponse> search(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    return searchEntities(area, genre, budgetMin, budgetMax, latitude, longitude, range).stream()
        .map(mapper::toRestaurantResponse)
        .toList();
  }

  public List<Restaurant> searchEntities(String area, String genre, Integer budgetMin, Integer budgetMax) {
    return searchEntities(area, genre, budgetMin, budgetMax, null, null, null);
  }

  public List<Restaurant> searchRandomEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates) {
    validationService.validateSearchRequest(area, genre, budgetMin, budgetMax, latitude, longitude, range);
    Map<String, Restaurant> externalOnlyRestaurants = new LinkedHashMap<>();
    boolean hasAvailableProvider = false;

    int desiredCandidateCount = Math.max(1, maxCandidates);
    hasAvailableProvider = queryRandomProviders(
        primaryProviders(),
        area,
        genre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        desiredCandidateCount,
        externalOnlyRestaurants);

    if (externalOnlyRestaurants.isEmpty() && hasCoordinates(latitude, longitude)) {
      hasAvailableProvider = queryRandomProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          null,
          null,
          null,
          desiredCandidateCount,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    int fallbackLimit = fallbackCandidateLimit(desiredCandidateCount, externalOnlyRestaurants.size());
    if (fallbackLimit > 0) {
      hasAvailableProvider = queryRandomProviders(
          fallbackProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          fallbackLimit,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (hasAvailableProvider && externalOnlyRestaurants.isEmpty()) {
      hasAvailableProvider = queryProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (!hasAvailableProvider) {
      return restaurantRepository.search(area, genre, budgetMin, budgetMax);
    }

    if (!externalOnlyRestaurants.isEmpty()) {
      return limitedCandidates(externalOnlyRestaurants, desiredCandidateCount);
    }

    if (hasCoordinates(latitude, longitude)) {
      return List.of();
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
  }

  public List<Restaurant> searchEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    validationService.validateSearchRequest(area, genre, budgetMin, budgetMax, latitude, longitude, range);
    Map<String, Restaurant> externalOnlyRestaurants = new LinkedHashMap<>();
    boolean hasAvailableProvider = false;

    hasAvailableProvider = queryProviders(
        primaryProviders(),
        area,
        genre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        externalOnlyRestaurants);

    if (externalOnlyRestaurants.isEmpty() && hasCoordinates(latitude, longitude)) {
      hasAvailableProvider = queryProviders(
          primaryProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          null,
          null,
          null,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    int fallbackLimit = fallbackCandidateLimit(HYBRID_TARGET_RESULT_COUNT, externalOnlyRestaurants.size());
    if (fallbackLimit > 0) {
      hasAvailableProvider = queryRandomProviders(
          fallbackProviders(),
          area,
          genre,
          budgetMin,
          budgetMax,
          latitude,
          longitude,
          range,
          fallbackLimit,
          externalOnlyRestaurants) || hasAvailableProvider;
    }

    if (!hasAvailableProvider) {
      return restaurantRepository.search(area, genre, budgetMin, budgetMax);
    }

    if (!externalOnlyRestaurants.isEmpty()) {
      return limitedCandidates(externalOnlyRestaurants, HYBRID_TARGET_RESULT_COUNT);
    }

    if (hasCoordinates(latitude, longitude)) {
      return List.of();
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
  }

  private List<ExternalRestaurantProvider> primaryProviders() {
    return externalRestaurantProviders.stream().filter(provider -> !provider.isFallback()).toList();
  }

  private List<ExternalRestaurantProvider> fallbackProviders() {
    return externalRestaurantProviders.stream().filter(ExternalRestaurantProvider::isFallback).toList();
  }

  private boolean queryProviders(
      List<ExternalRestaurantProvider> providers,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      Map<String, Restaurant> externalOnlyRestaurants) {
    boolean hasAvailableProvider = false;
    for (ExternalRestaurantProvider provider : providers) {
      if (!provider.isAvailable()) {
        logger.warn("External restaurant provider is not available: {}.", provider.getClass().getSimpleName());
        continue;
      }
      hasAvailableProvider = true;
      try {
        List<Restaurant> externalRestaurants = provider.search(area, genre, budgetMin, budgetMax, latitude, longitude, range);
        externalRestaurants.forEach(restaurant -> putIfUnique(externalOnlyRestaurants, restaurant));
      } catch (RuntimeException exception) {
        logger.warn("External restaurant provider failed: {}", provider.getClass().getSimpleName(), exception);
      }
    }

    return hasAvailableProvider;
  }

  private boolean queryRandomProviders(
      List<ExternalRestaurantProvider> providers,
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates,
      Map<String, Restaurant> externalOnlyRestaurants) {
    if (maxCandidates <= 0) {
      return false;
    }
    boolean hasAvailableProvider = false;
    for (ExternalRestaurantProvider provider : providers) {
      if (!provider.isAvailable()) {
        logger.warn("External restaurant provider is not available: {}.", provider.getClass().getSimpleName());
        continue;
      }
      hasAvailableProvider = true;
      try {
        List<Restaurant> externalRestaurants = provider.searchRandomCandidates(
            area,
            genre,
            budgetMin,
            budgetMax,
            latitude,
            longitude,
            range,
            maxCandidates);
        externalRestaurants.forEach(restaurant -> putIfUnique(externalOnlyRestaurants, restaurant));
      } catch (RuntimeException exception) {
        logger.warn("External restaurant provider failed: {}", provider.getClass().getSimpleName(), exception);
      }
    }

    return hasAvailableProvider;
  }

  public void cacheForUserAction(Restaurant restaurant) {
    if (shouldPersistRestaurant(restaurant)) {
      restaurantRepository.saveAll(List.of(restaurant));
    }
  }

  public boolean shouldPersistRestaurant(Restaurant restaurant) {
    return restaurant != null && "RANDISH_SEED".equalsIgnoreCase(restaurant.externalProvider());
  }

  public Optional<Restaurant> findExternalByProviderPlaceId(
      String provider,
      String providerPlaceId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    if (provider == null || provider.isBlank() || providerPlaceId == null || providerPlaceId.isBlank()) {
      return Optional.empty();
    }
    return externalRestaurantProviders.stream()
        .filter(ExternalRestaurantProvider::isAvailable)
        .filter(externalProvider -> provider.equalsIgnoreCase(externalProvider.providerKey()))
        .map(externalProvider -> externalProvider.findByExternalId(providerPlaceId, savedArea, savedGenre, savedBudgetMin, savedBudgetMax))
        .filter(Optional::isPresent)
        .map(Optional::get)
        .findFirst();
  }

  private int fallbackCandidateLimit(int targetResultCount, int currentResultCount) {
    int missingCount = targetResultCount - currentResultCount;
    if (missingCount <= 0) {
      return 0;
    }
    return Math.min(missingCount, MAX_FALLBACK_FILL_COUNT);
  }

  private boolean hasCoordinates(Double latitude, Double longitude) {
    return latitude != null && longitude != null;
  }

  private List<Restaurant> limitedCandidates(Map<String, Restaurant> restaurants, int maxCandidates) {
    return restaurants.values().stream()
        .limit(Math.max(1, maxCandidates))
        .toList();
  }

  private void putIfUnique(Map<String, Restaurant> restaurants, Restaurant candidate) {
    boolean alreadyPresent = restaurants.values().stream().anyMatch(existing -> isSameRestaurant(existing, candidate));
    if (!alreadyPresent) {
      restaurants.put(candidate.id(), candidate);
    }
  }

  private boolean isSameRestaurant(Restaurant first, Restaurant second) {
    String firstName = normalizeComparableText(first.name());
    String secondName = normalizeComparableText(second.name());
    if (firstName.isBlank() || secondName.isBlank()) {
      return false;
    }
    if (firstName.equals(secondName)) {
      return true;
    }

    String firstAddress = normalizeComparableText(first.address());
    String secondAddress = normalizeComparableText(second.address());
    Integer distanceMeters = distanceMeters(first.latitude(), first.longitude(), second.latitude(), second.longitude());
    if (distanceMeters != null
        && distanceMeters <= DUPLICATE_DISTANCE_METERS
        && (firstName.contains(secondName)
            || secondName.contains(firstName)
            || (!firstAddress.isBlank()
                && !secondAddress.isBlank()
                && (firstAddress.contains(secondAddress) || secondAddress.contains(firstAddress))))) {
      return true;
    }

    return !firstAddress.isBlank()
        && !secondAddress.isBlank()
        && (firstAddress.contains(secondAddress) || secondAddress.contains(firstAddress))
        && (firstName.contains(secondName) || secondName.contains(firstName));
  }

  private String normalizeComparableText(String value) {
    if (value == null) {
      return "";
    }
    return value.toLowerCase(Locale.ROOT)
        .replaceAll("\\s+", "")
        .replaceAll("[\\p{Punct}　－ー・ｰ]", "");
  }

  private Integer distanceMeters(Double fromLatitude, Double fromLongitude, Double toLatitude, Double toLongitude) {
    if (fromLatitude == null || fromLongitude == null || toLatitude == null || toLongitude == null) {
      return null;
    }
    double earthRadiusMeters = 6_371_000;
    double latitudeDelta = Math.toRadians(toLatitude - fromLatitude);
    double longitudeDelta = Math.toRadians(toLongitude - fromLongitude);
    double fromLatitudeRad = Math.toRadians(fromLatitude);
    double toLatitudeRad = Math.toRadians(toLatitude);
    double haversine = Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
        + Math.cos(fromLatitudeRad) * Math.cos(toLatitudeRad)
        * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);
    return (int) Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)));
  }

  public Restaurant getEntityOrThrow(String id) {
    String cleanId = validationService.requireRestaurantId(id);
    return restaurantRepository.findById(cleanId)
        .orElseThrow(() -> new NotFoundException("Restaurant not found: " + cleanId));
  }

  public RestaurantResponse findById(String id) {
    return mapper.toRestaurantResponse(getEntityOrThrow(id));
  }
}
