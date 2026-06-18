package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.StatisticsResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.StatisticsService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/statistics")
public class StatisticsController {
  private final StatisticsService statisticsService;
  private final AuthenticatedUserService authenticatedUserService;

  public StatisticsController(StatisticsService statisticsService, AuthenticatedUserService authenticatedUserService) {
    this.statisticsService = statisticsService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @GetMapping("/user/{userId}")
  public StatisticsResponse findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUser(authorizationHeader, userId);
    return statisticsService.calculate(userId);
  }
}
