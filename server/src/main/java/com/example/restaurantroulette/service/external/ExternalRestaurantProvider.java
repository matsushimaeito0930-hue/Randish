package com.example.restaurantroulette.service.external;

import com.example.restaurantroulette.entity.Restaurant;
import java.util.List;

public interface ExternalRestaurantProvider {
  boolean isAvailable();

  List<Restaurant> search(String area, String genre, Integer budgetMin, Integer budgetMax, Double latitude, Double longitude, Integer range);
}
