package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.exception.UnauthorizedException;
import com.example.restaurantroulette.service.external.GeoapifyRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  private static final String DEFAULT_ADMIN_PASSWORD = "eito0930";

  private final HotPepperRestaurantProvider hotPepperRestaurantProvider;
  private final GeoapifyRestaurantProvider geoapifyRestaurantProvider;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  public AdminController(
      HotPepperRestaurantProvider hotPepperRestaurantProvider,
      GeoapifyRestaurantProvider geoapifyRestaurantProvider,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.hotPepperRestaurantProvider = hotPepperRestaurantProvider;
    this.geoapifyRestaurantProvider = geoapifyRestaurantProvider;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
  }

  @GetMapping("/api-usage")
  public Map<String, Object> apiUsage(
      @RequestHeader(value = "X-Randish-Admin-Password", required = false) String headerPassword,
      @RequestParam(required = false) String password) {
    if (!adminPassword().equals(firstNonBlank(headerPassword, password))) {
      throw new UnauthorizedException("Admin password is incorrect.");
    }
    return Map.of(
        "generatedAt", Instant.now().toString(),
        "providers", List.of(
            hotPepperRestaurantProvider.apiUsage(),
            geoapifyRestaurantProvider.apiUsage(),
            googlePlacesEnrichmentService.apiUsage()));
  }

  private String adminPassword() {
    String configured = firstNonBlank(System.getProperty("RANDISH_ADMIN_PASSWORD"), System.getenv("RANDISH_ADMIN_PASSWORD"));
    return configured == null || configured.isBlank() ? DEFAULT_ADMIN_PASSWORD : configured.trim();
  }

  private String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) {
      return first.trim();
    }
    return second == null ? "" : second.trim();
  }
}
