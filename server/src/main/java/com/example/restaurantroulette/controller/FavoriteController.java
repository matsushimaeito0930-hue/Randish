package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.FavoriteCheckResponse;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.FavoriteResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.FavoriteService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/favorites")
public class FavoriteController {
  private final FavoriteService favoriteService;

  public FavoriteController(FavoriteService favoriteService) {
    this.favoriteService = favoriteService;
  }

  @PostMapping
  public FavoriteResponse create(@RequestBody FavoriteCreateRequest request) {
    return favoriteService.create(request);
  }

  @DeleteMapping("/{id}")
  public void delete(@PathVariable String id) {
    favoriteService.delete(id);
  }

  @GetMapping("/user/{userId}")
  public List<FavoriteResponse> findByUserId(@PathVariable String userId) {
    return favoriteService.findByUserId(userId);
  }

  @GetMapping("/{id}/restaurant")
  public RestaurantResponse findRestaurant(@PathVariable String id) {
    return favoriteService.findRestaurant(id);
  }

  @GetMapping("/check")
  public FavoriteCheckResponse check(@RequestParam String userId, @RequestParam String restaurantId) {
    return favoriteService.check(userId, restaurantId);
  }
}
