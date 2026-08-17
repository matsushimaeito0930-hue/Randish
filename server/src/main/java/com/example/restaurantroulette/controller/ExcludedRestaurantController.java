package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.ExcludedRestaurantCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.ExcludedRestaurantResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.ExcludedRestaurantService;
import java.util.List;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/excluded-restaurants")
public class ExcludedRestaurantController {
  private final ExcludedRestaurantService excludedRestaurantService;
  private final AuthenticatedUserService authenticatedUserService;

  public ExcludedRestaurantController(
      ExcludedRestaurantService excludedRestaurantService,
      AuthenticatedUserService authenticatedUserService) {
    this.excludedRestaurantService = excludedRestaurantService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @PostMapping
  public ExcludedRestaurantResponse create(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody ExcludedRestaurantCreateRequest request) {
    authenticatedUserService.requireSameUser(authorizationHeader, request.userId());
    return excludedRestaurantService.create(request);
  }

  @GetMapping("/user/{userId}")
  public List<ExcludedRestaurantResponse> findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return excludedRestaurantService.findByUserId(userId);
  }

  @DeleteMapping("/{id}")
  public void delete(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String id) {
    authenticatedUserService.requireSameUser(authorizationHeader, excludedRestaurantService.findOwnerUserId(id));
    excludedRestaurantService.delete(id);
  }
}
