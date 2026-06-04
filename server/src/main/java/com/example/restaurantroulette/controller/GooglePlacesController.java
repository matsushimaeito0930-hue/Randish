package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.service.external.GooglePlacesEnrichmentService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/google-places")
public class GooglePlacesController {
  private final GooglePlacesEnrichmentService googlePlacesEnrichmentService;

  public GooglePlacesController(GooglePlacesEnrichmentService googlePlacesEnrichmentService) {
    this.googlePlacesEnrichmentService = googlePlacesEnrichmentService;
  }

  @GetMapping("/photos")
  public ResponseEntity<byte[]> photo(@RequestParam String name) {
    return googlePlacesEnrichmentService.fetchPhoto(name);
  }
}
