package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import java.util.List;

public interface ExternalRestaurantProvider {
  boolean isAvailable();

  default boolean isFallback() {
    return false;
  }

  List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range);

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
