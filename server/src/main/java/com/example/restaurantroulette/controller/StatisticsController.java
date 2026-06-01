package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.StatisticsResponse;
import com.example.restaurantroulette.service.StatisticsService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/statistics")
public class StatisticsController {
  private final StatisticsService statisticsService;

  public StatisticsController(StatisticsService statisticsService) {
    this.statisticsService = statisticsService;
  }

  @GetMapping("/user/{userId}")
  public StatisticsResponse findByUserId(@PathVariable String userId) {
    return statisticsService.calculate(userId);
  }
}
