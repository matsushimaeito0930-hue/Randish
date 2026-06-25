package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesRequest;
import com.example.restaurantroulette.dto.ApiDtos.NearbyPlacesResponse;
import com.example.restaurantroulette.service.NearbyPlacesService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/places")
public class PlacesController {
  private final NearbyPlacesService nearbyPlacesService;

  public PlacesController(NearbyPlacesService nearbyPlacesService) {
    this.nearbyPlacesService = nearbyPlacesService;
  }

  @PostMapping("/nearby")
  public NearbyPlacesResponse nearby(@RequestBody NearbyPlacesRequest request) {
    return nearbyPlacesService.search(request);
  }
}
