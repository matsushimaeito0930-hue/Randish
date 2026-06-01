package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.StatisticsResponse;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.entity.VisitCollection;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

@Service
public class StatisticsService {
  private static final DateTimeFormatter MONTH_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM");

  private final VisitCollectionService visitCollectionService;
  private final RestaurantQueryService restaurantQueryService;
  private final FavoriteService favoriteService;
  private final ValidationService validationService;

  public StatisticsService(
      VisitCollectionService visitCollectionService,
      RestaurantQueryService restaurantQueryService,
      FavoriteService favoriteService,
      ValidationService validationService) {
    this.visitCollectionService = visitCollectionService;
    this.restaurantQueryService = restaurantQueryService;
    this.favoriteService = favoriteService;
    this.validationService = validationService;
  }

  public StatisticsResponse calculate(String userId) {
    validationService.requireUserId(userId);
    List<VisitCollection> visits = visitCollectionService.findEntitiesByUserId(userId);
    long totalVisits = visits.size();
    Set<String> visitedRestaurantIds = visits.stream()
        .map(VisitCollection::restaurantId)
        .collect(Collectors.toSet());

    Map<String, Restaurant> restaurantById = visitedRestaurantIds.stream()
        .map(restaurantQueryService::getEntityOrThrow)
        .collect(Collectors.toMap(Restaurant::id, Function.identity()));

    String favoriteGenre = mostFrequent(visits, visit -> restaurantById.get(visit.restaurantId()).genre());
    String favoriteArea = mostFrequent(visits, visit -> restaurantById.get(visit.restaurantId()).area());

    Map<String, Long> monthlyVisitCount = visits.stream()
        .collect(Collectors.groupingBy(
            visit -> visit.visitDate().format(MONTH_FORMATTER),
            LinkedHashMap::new,
            Collectors.counting()));

    long firstVisitCount = visits.stream()
        .collect(Collectors.groupingBy(VisitCollection::restaurantId, Collectors.counting()))
        .size();
    double newRestaurantRate = totalVisits == 0 ? 0 : (double) firstVisitCount / totalVisits;

    return new StatisticsResponse(
        userId,
        totalVisits,
        favoriteGenre,
        favoriteArea,
        monthlyVisitCount,
        newRestaurantRate,
        favoriteService.countByUserId(userId),
        visitedRestaurantIds.size());
  }

  private String mostFrequent(List<VisitCollection> visits, Function<VisitCollection, String> classifier) {
    return visits.stream()
        .collect(Collectors.groupingBy(classifier, Collectors.counting()))
        .entrySet()
        .stream()
        .max(Map.Entry.comparingByValue())
        .map(Map.Entry::getKey)
        .orElse(null);
  }
}
