package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryCreateRequest;
import com.example.restaurantroulette.dto.ApiDtos.RandomHistoryResponse;
import com.example.restaurantroulette.service.RandomHistoryService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/random-histories")
public class RandomHistoryController {
  private final RandomHistoryService randomHistoryService;

  public RandomHistoryController(RandomHistoryService randomHistoryService) {
    this.randomHistoryService = randomHistoryService;
  }

  @PostMapping
  public RandomHistoryResponse create(@RequestBody RandomHistoryCreateRequest request) {
    return randomHistoryService.create(request);
  }

  @GetMapping("/user/{userId}")
  public List<RandomHistoryResponse> findByUserId(@PathVariable String userId) {
    return randomHistoryService.findByUserId(userId);
  }
}
