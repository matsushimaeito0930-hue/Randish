package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.dto.ApiDtos.StampResponse;
import com.example.restaurantroulette.dto.ApiDtos.VisitResponse;
import com.example.restaurantroulette.entity.FavoriteRestaurant;
import com.example.restaurantroulette.entity.RandomHistory;
import com.example.restaurantroulette.entity.Restaurant;
import com.example.restaurantroulette.entity.Stamp;
import com.example.restaurantroulette.entity.VisitCollection;
import org.springframework.stereotype.Component;

@Component
public class DtoMapper {
  public RestaurantResponse toRestaurantResponse(Restaurant restaurant) {
    return new RestaurantResponse(
        restaurant.id(),
        restaurant.externalProvider(),
        restaurant.externalId(),
        restaurant.name(),
        restaurant.area(),
        restaurant.genre(),
        restaurant.budgetMin(),
        restaurant.budgetMax(),
        restaurant.rating(),
        restaurant.minutes(),
        restaurant.address(),
        restaurant.photoUrl(),
        restaurant.note(),
        restaurant.latitude(),
        restaurant.longitude(),
        null,
        null,
        null,
        null);
  }

  public RandomHistoryResponse toRandomHistoryResponse(RandomHistory history, Restaurant restaurant) {
    return new RandomHistoryResponse(
        history.id(),
        history.userId(),
        toRestaurantResponse(restaurant),
        history.area(),
        history.genre(),
        history.budgetMin(),
        history.budgetMax(),
        history.createdAt());
  }

  public FavoriteResponse toFavoriteResponse(FavoriteRestaurant favorite, Restaurant restaurant) {
    return new FavoriteResponse(favorite.id(), favorite.userId(), toRestaurantResponse(restaurant), favorite.createdAt());
  }

  public VisitResponse toVisitResponse(VisitCollection visit, Restaurant restaurant) {
    return new VisitResponse(
        visit.id(),
        visit.userId(),
        toRestaurantResponse(restaurant),
        visit.visitDate(),
        visit.photoUrl(),
        visit.memo(),
        visit.rating(),
        visit.createdAt());
  }

  public StampResponse toStampResponse(Stamp stamp) {
    return new StampResponse(stamp.id(), stamp.userId(), stamp.restaurantId(), stamp.stampType(), stamp.awardedAt());
  }
}
