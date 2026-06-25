package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.service.RevenueCatWebhookService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/revenuecat")
public class RevenueCatWebhookController {
  private final RevenueCatWebhookService revenueCatWebhookService;

  public RevenueCatWebhookController(RevenueCatWebhookService revenueCatWebhookService) {
    this.revenueCatWebhookService = revenueCatWebhookService;
  }

  @PostMapping("/webhook")
  public ResponseEntity<Void> webhook(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestBody JsonNode payload) {
    revenueCatWebhookService.handle(authorizationHeader, payload);
    return ResponseEntity.ok().build();
  }
}
