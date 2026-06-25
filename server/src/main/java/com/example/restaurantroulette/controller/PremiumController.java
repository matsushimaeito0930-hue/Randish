package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.PremiumStatusResponse;
import com.example.restaurantroulette.service.AiReportProxyService;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.PremiumService;
import com.fasterxml.jackson.databind.JsonNode;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/premium")
public class PremiumController {
  private final PremiumService premiumService;
  private final AuthenticatedUserService authenticatedUserService;
  private final AiReportProxyService aiReportProxyService;

  public PremiumController(
      PremiumService premiumService,
      AuthenticatedUserService authenticatedUserService,
      AiReportProxyService aiReportProxyService) {
    this.premiumService = premiumService;
    this.authenticatedUserService = authenticatedUserService;
    this.aiReportProxyService = aiReportProxyService;
  }

  @GetMapping("/status")
  public PremiumStatusResponse status(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, userId);
    return premiumService.status(userId);
  }

  @PostMapping("/ai-report")
  public JsonNode aiReport(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @RequestParam String userId,
      @RequestBody JsonNode payload) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    if (!premiumService.status(userId).isPro()) {
      throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "RANDISH Pro is required.");
    }
    return aiReportProxyService.generate(payload);
  }
}
