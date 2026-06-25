package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.RandomRestaurantRequest;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.ValidationService;
import com.example.restaurantroulette.service.RandomRestaurantService;
import com.example.restaurantroulette.service.RestaurantQueryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/restaurants")
public class RestaurantController {
  private final RestaurantQueryService restaurantQueryService;
  private final RandomRestaurantService randomRestaurantService;
  private final AuthenticatedUserService authenticatedUserService;

  public RestaurantController(
      RestaurantQueryService restaurantQueryService,
      RandomRestaurantService randomRestaurantService,
      AuthenticatedUserService authenticatedUserService) {
    this.restaurantQueryService = restaurantQueryService;
    this.randomRestaurantService = randomRestaurantService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @GetMapping
  public List<RestaurantResponse> findAll(
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String genre,
      @RequestParam(required = false) Integer budgetMin,
      @RequestParam(required = false) Integer budgetMax,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude,
      @RequestParam(required = false) Integer range) {
    return restaurantQueryService.search(area, genre, budgetMin, budgetMax, latitude, longitude, range);
  }

  @GetMapping("/random")
  public RestaurantResponse chooseRandom(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam(required = false) String userId,
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String genre,
      @RequestParam(required = false) Integer budgetMin,
      @RequestParam(required = false) Integer budgetMax,
      @RequestParam(required = false) Double latitude,
      @RequestParam(required = false) Double longitude,
      @RequestParam(required = false) Integer range,
      @RequestParam(required = false) Integer distanceMeters) {
    String effectiveUserId = userId == null || userId.isBlank() ? ValidationService.GUEST_USER_ID : userId.trim();
    if (!authenticatedUserService.isGuestUserId(effectiveUserId)) {
      authenticatedUserService.requireSameUser(authorizationHeader, effectiveUserId);
    }
    return randomRestaurantService.choose(new RandomRestaurantRequest(
        effectiveUserId,
        area,
        genre,
        budgetMin,
        budgetMax,
        latitude,
        longitude,
        range,
        distanceMeters));
  }

  @GetMapping("/{id}")
  public RestaurantResponse findById(@PathVariable String id) {
    return restaurantQueryService.findById(id);
  }
}
