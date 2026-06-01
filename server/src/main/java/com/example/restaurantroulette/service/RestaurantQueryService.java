package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.exception.NotFoundException;
import com.example.restaurantroulette.repository.RestaurantRepository;
import com.example.restaurantroulette.service.external.ExternalRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class RestaurantQueryService {
  private static final Logger logger = LoggerFactory.getLogger(RestaurantQueryService.class);

  private final RestaurantRepository restaurantRepository;
  private final List<ExternalRestaurantProvider> externalRestaurantProviders;
  private final DtoMapper mapper;
  private final ValidationService validationService;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  public RestaurantQueryService(
      RestaurantRepository restaurantRepository,
      List<ExternalRestaurantProvider> externalRestaurantProviders,
      DtoMapper mapper,
      ValidationService validationService,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.restaurantRepository = restaurantRepository;
    this.externalRestaurantProviders = externalRestaurantProviders;
    this.mapper = mapper;
    this.validationService = validationService;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
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

  public List<Restaurant> searchEntities(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range) {
    validationService.validateBudget(budgetMin, budgetMax);
    Map<String, Restaurant> externalOnlyRestaurants = new LinkedHashMap<>();
    boolean hasAvailableProvider = false;

    for (ExternalRestaurantProvider provider : externalRestaurantProviders) {
      if (!provider.isAvailable()) {
        logger.warn("External restaurant provider is not available: {}. Check HOTPEPPER_API_KEY.", provider.getClass().getSimpleName());
        continue;
      }
      hasAvailableProvider = true;
      try {
        List<Restaurant> externalRestaurants = provider.search(area, genre, budgetMin, budgetMax, latitude, longitude, range);
        restaurantRepository.saveAll(externalRestaurants);
        externalRestaurants.forEach(restaurant -> externalOnlyRestaurants.put(restaurant.id(), restaurant));
      } catch (RuntimeException exception) {
        logger.warn("External restaurant provider failed: {}", provider.getClass().getSimpleName(), exception);
      }
    }

    if (!hasAvailableProvider) {
      return restaurantRepository.search(area, genre, budgetMin, budgetMax);
    }

    if (!externalOnlyRestaurants.isEmpty()) {
      return List.copyOf(externalOnlyRestaurants.values());
    }

    return restaurantRepository.search(area, genre, budgetMin, budgetMax);
  }

  public Restaurant getEntityOrThrow(String id) {
    return restaurantRepository.findById(id)
        .orElseThrow(() -> new NotFoundException("Restaurant not found: " + id));
  }

  public RestaurantResponse findById(String id) {
    return googlePlacesEnrichmentService.enrich(mapper.toRestaurantResponse(getEntityOrThrow(id)));
  }
}
