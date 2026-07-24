package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesResponse;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.NearbyPlacesService;
import com.example.restaurantroulette.service.PremiumService;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
public class PlacesController {
  private final NearbyPlacesService nearbyPlacesService;
  private final AuthService authService;
  private final PremiumService premiumService;

  public PlacesController(
      NearbyPlacesService nearbyPlacesService,
      AuthService authService,
      PremiumService premiumService) {
    this.nearbyPlacesService = nearbyPlacesService;
    this.authService = authService;
    this.premiumService = premiumService;
  }

  @PostMapping("/nearby")
  public NearbyPlacesResponse nearby(
      @RequestBody NearbyPlacesRequest request,
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader) {
    return nearbyPlacesService.search(request, isPremium(authorizationHeader));
  }

  private boolean isPremium(String authorizationHeader) {
    if (authorizationHeader == null || authorizationHeader.isBlank()) {
      return false;
    }
    try {
      String userId = authService.me(authorizationHeader).user().id();
      return premiumService.status(userId).isPro();
    } catch (RuntimeException exception) {
      return false;
    }
  }
}
