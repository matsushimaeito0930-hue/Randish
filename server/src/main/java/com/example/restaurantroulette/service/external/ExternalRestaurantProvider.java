package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import java.util.List;
import java.util.Optional;

public interface ExternalRestaurantProvider {
  default String providerKey() {
    return getClass().getSimpleName();
  }

  boolean isAvailable();

  default boolean isFallback() {
    return false;
  }

  List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range);

  default Optional<Restaurant> findByExternalId(
      String externalId,
      String savedArea,
      String savedGenre,
      Integer savedBudgetMin,
      Integer savedBudgetMax) {
    return Optional.empty();
  }

  default List<Restaurant> searchRandomCandidates(
      String area,
      String genre,
      Integer budgetMin,
      Integer budgetMax,
      Double latitude,
      Double longitude,
      Integer range,
      int maxCandidates) {
    return search(area, genre, budgetMin, budgetMax, latitude, longitude, range);
  }
}
