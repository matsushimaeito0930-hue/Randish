package com.example.restaurantroulette.service;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.dto.ApiDtos.StampResponse;
import com.example.restaurantroulette.dto.ApiDtos.UserResponse;
import com.example.restaurantroulette.dto.ApiDtos.VisitResponse;
import com.example.restaurantroulette.entity.AppUser;
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

  public UserResponse toUserResponse(AppUser user) {
    return new UserResponse(
        user.id(),
        user.email(),
        user.displayName(),
        user.authProvider(),
        user.createdAt(),
        user.updatedAt());
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
