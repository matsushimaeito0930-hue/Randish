package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.FavoriteService;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {
  private final FavoriteService favoriteService;
  private final AuthenticatedUserService authenticatedUserService;

  public FavoriteController(FavoriteService favoriteService, AuthenticatedUserService authenticatedUserService) {
    this.favoriteService = favoriteService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @PostMapping
  public FavoriteResponse create(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody FavoriteCreateRequest request) {
    authenticatedUserService.requireSameUser(authorizationHeader, request.userId());
    return favoriteService.create(request);
  }

  @DeleteMapping("/{id}")
  public void delete(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String id) {
    authenticatedUserService.requireSameUser(authorizationHeader, favoriteService.findOwnerUserId(id));
    favoriteService.delete(id);
  }

  @GetMapping("/user/{userId}")
  public List<FavoriteResponse> findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return favoriteService.findByUserId(userId);
  }

  @GetMapping("/{id}/restaurant")
  public RestaurantResponse findRestaurant(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String id) {
    authenticatedUserService.requireSameUser(authorizationHeader, favoriteService.findOwnerUserId(id));
    return favoriteService.findRestaurant(id);
  }

  @GetMapping("/check")
  public FavoriteCheckResponse check(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId,
      @RequestParam String restaurantId) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return favoriteService.check(userId, restaurantId);
  }
}
