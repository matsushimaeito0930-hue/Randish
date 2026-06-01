package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.StampResponse;
import com.example.restaurantroulette.service.StampService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/stamps")
public class StampController {
  private final StampService stampService;

  public StampController(StampService stampService) {
    this.stampService = stampService;
  }

  @GetMapping("/user/{userId}")
  public List<StampResponse> findByUserId(@PathVariable String userId) {
    return stampService.findByUserId(userId);
  }
}
