package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import com.example.restaurantroulette.service.external.HotPepperRestaurantProvider;
import java.util.Map;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@ConditionalOnProperty(name = "randish.debug.enabled", havingValue = "true")
@RestController
@RequestMapping("/api/debug")
public class DebugController {
  private final HotPepperRestaurantProvider hotPepperRestaurantProvider;
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  public DebugController(
      HotPepperRestaurantProvider hotPepperRestaurantProvider,
      GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.hotPepperRestaurantProvider = hotPepperRestaurantProvider;
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
  }

  @GetMapping("/hotpepper")
  public Map<String, Object> hotPepper(
      @RequestParam(required = false) String area,
      @RequestParam(required = false) String genre) {
    return hotPepperRestaurantProvider.diagnostics(area, genre);
  }

  @GetMapping("/google-places")
  public Map<String, Object> googlePlaces() {
    return googlePlacesEnrichmentService.diagnostics();
  }
}
