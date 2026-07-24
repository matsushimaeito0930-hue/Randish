package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.RestaurantResponse;
import com.example.restaurantroulette.service.AuthService;
import com.example.restaurantroulette.service.PremiumService;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/google-places")
public class GooglePlacesController {
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;
  private final AuthService authService;
  private final PremiumService premiumService;

  public GooglePlacesController(
      GooglePlacesEnrichmentService googlePlacesEnrichmentService,
      AuthService authService,
      PremiumService premiumService) {
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
    this.authService = authService;
    this.premiumService = premiumService;
  }

  @PostMapping("/business-status")
  public RestaurantResponse businessStatus(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody RestaurantResponse restaurant) {
    if (authorizationHeader == null || authorizationHeader.isBlank()) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication is required.");
    }
    String userId = authService.me(authorizationHeader).user().id();
    if (!premiumService.status(userId).isPro()) {
      throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "RANDISH Premium is required.");
    }
    if (restaurant == null || restaurant.name() == null || restaurant.name().isBlank()) {
      throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Restaurant is required.");
    }
    return googlePlacesEnrichmentService.enrichBusinessStatus(restaurant);
  }

  @GetMapping("/photos")
  public ResponseEntity<byte[]> photo(@RequestParam String name) {
    return googlePlacesEnrichmentService.fetchPhoto(name);
  }
}
