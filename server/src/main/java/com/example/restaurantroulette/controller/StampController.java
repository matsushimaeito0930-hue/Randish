package com.example.restaurantroulette.controller;

import com.example.restaurantroulette.dto.ApiDtos.StampResponse;
import com.example.restaurantroulette.service.AuthenticatedUserService;
import com.example.restaurantroulette.service.StampService;
import java.util.List;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@CrossOrigin
@RestController
@RequestMapping("/api/stamps")
public class StampController {
  private final StampService stampService;
  private final AuthenticatedUserService authenticatedUserService;

  public StampController(StampService stampService, AuthenticatedUserService authenticatedUserService) {
    this.stampService = stampService;
    this.authenticatedUserService = authenticatedUserService;
  }

  @GetMapping("/user/{userId}")
  public List<StampResponse> findByUserId(
      @RequestHeader(value = "Authorization", required = false) String authorizationHeader,
      @PathVariable String userId) {
    authenticatedUserService.requireSameUserOrGuest(authorizationHeader, userId);
    return stampService.findByUserId(userId);
  }
}
