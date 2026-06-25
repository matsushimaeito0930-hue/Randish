package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.RandomHistoryService;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/random-histories")
public class RandomHistoryController {
  private final RandomHistoryService randomHistoryService;
  private final AuthenticatedUserService authenticatedUserService;

  public RandomHistoryController(RandomHistoryService randomHistoryService, AuthenticatedUserService authenticatedUserService) {
    this.randomHistoryService = randomHistoryService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @PostMapping
  public RandomHistoryResponse create(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody RandomHistoryCreateRequest request) {
    authenticatedUserService.requireSameUser(authorizationHeader, request.userId());
    return randomHistoryService.create(request);
  }

  @GetMapping("/user/{userId}")
  public List<RandomHistoryResponse> findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return randomHistoryService.findByUserId(userId);
  }

  @GetMapping("/{id}/restaurant")
  public RestaurantResponse findRestaurant(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String id) {
    authenticatedUserService.requireSameUser(authorizationHeader, randomHistoryService.findOwnerUserId(id));
    return randomHistoryService.findRestaurant(id);
  }
}
