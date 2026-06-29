package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.service.external.GeoapifyRestaurantProvider;
import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
  private static final String DEFAULT_ADMIN_USAGE_PASSWORD = "eito";

  private final HotPepperRestaurantProvider hotPepperRestaurantProvider;
  private final GeoapifyRestaurantProvider geoapifyRestaurantProvider;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;
  private final String adminUsagePassword;

  public AdminController(
      HotPepperRestaurantProvider hotPepperRestaurantProvider,
      GeoapifyRestaurantProvider geoapifyRestaurantProvider,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.hotPepperRestaurantProvider = hotPepperRestaurantProvider;
    this.geoapifyRestaurantProvider = geoapifyRestaurantProvider;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
    this.adminUsagePassword = resolveAdminUsagePassword();
  }

  @GetMapping("/api-usage")
  public Map<String, Object> apiUsage(
      @RequestHeader(value = "X-Randish-Admin-Password", required = false) String headerPassword,
      @RequestParam(required = false) String password) {
    if (!adminUsagePassword.equals(firstNonBlank(headerPassword, password))) {
      throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Admin password is required.");
    }
    return Map.of(
        "generatedAt", Instant.now().toString(),
        "providers", List.of(
            hotPepperRestaurantProvider.apiUsage(),
            geoapifyRestaurantProvider.apiUsage(),
            googlePlacesEnrichmentService.apiUsage()));
  }

  private String firstNonBlank(String first, String second) {
    if (first != null && !first.isBlank()) {
      return first.trim();
    }
    return second == null ? "" : second.trim();
  }

  private String resolveAdminUsagePassword() {
    String envValue = System.getenv("RANDISH_ADMIN_PASSWORD");
    if (envValue != null && !envValue.isBlank()) {
      return envValue.trim();
    }
    return DEFAULT_ADMIN_USAGE_PASSWORD;
  }
}
